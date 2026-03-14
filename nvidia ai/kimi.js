#!/usr/bin/env node
import boxen from 'boxen';
import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

import {
    callModel,
    callModelWithFallback,
    changeLog,
    costTracker,
    estimateMessagesTokens,
    handleToolCall,
    isRetriableError,
    MODELS,
    parseTextToolCalls,
    spinner,
    tools,
    undoLastChange
} from './engine.js';

// ═══════════════════════════════════════════════════════════════
//  SESSION & MEMORY PERSISTENCE
// ═══════════════════════════════════════════════════════════════
const MEMORY_FILE = '.kimi_memory';
const SESSION_DIR = '.kimi_sessions';
const MAX_STEPS_PER_TASK = 50;

// ═══════════════════════════════════════════════════════════════
//  ROLE-BASED SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════════
const ROLE_PROMPTS = {
    SUPERVISOR: `You are the Kimi Supervisor. Your role is WHAT and WHETHER.
1. WHAT needs to be done next?
2. WHETHER the Executor's recent work matches the primary goal and project style.
Goal: {{PRIMARY_GOAL}}
Style: {{GLOBAL_STYLE}}
Plan: {{TASK_PLAN}}`,

    ARCHITECT: `You are the Kimi Architect. Your role is technical STRATEGY.
Analyze the codebase and design the most efficient, robust, and idiomatic implementation strategy.
1. ANALYZE: Identify files, types, and dependencies.
2. PROPOSE: Outline the exact code changes and structural impact.
3. CONSTRAINTS: Identify potential breaking changes or performance risks.
## HALLUCINATION GUARD:
- Do NOT assume a function exists unless you see it in a read_file/view_file_outline output.
- Cite file paths and line numbers for every design decision.
Goal: {{PRIMARY_GOAL}}`,

    EXECUTOR: `You are the Kimi Executor. Your role is surgical ACTION.
Use tools accurately to fulfill the primary goal. 
1. PREPARE: Identify the target file and its context.
2. ACT: Apply surgical edits using search_replace or patch_file.
3. VERIFY: Confirm success with verify_project or run_command.
## OPERATIONAL ORDER:
- Use tool outputs as the ONLY source of truth.
- If you analyze 40 files, maintain a local mental map of the changes.
- Never "guess" a closing bracket or a semicolon; read the surrounding context first.
Goal: {{PRIMARY_GOAL}}
Plan: {{TASK_PLAN}}`
};

const memoryFns = {
    load: async () => { try { return await fs.readFile(MEMORY_FILE, 'utf8'); } catch { return "No memory found yet."; } },
    save: async (content) => { await fs.writeFile(MEMORY_FILE, content, 'utf8'); },
    updateTaskStatus: (path, status) => {
        let found = false;
        if (taskChecklist.files) {
            for (let f of taskChecklist.files) {
                if (f.path === path) {
                    f.status = status;
                    found = true;
                }
            }
        }
        return found;
    }
};

async function saveSession(name, messages) {
    await fs.mkdir(SESSION_DIR, { recursive: true });
    const file = path.join(SESSION_DIR, `${name}.json`);
    await fs.writeFile(file, JSON.stringify({ name, savedAt: new Date().toISOString(), messages }, null, 2), 'utf8');
    return file;
}

async function loadSession(name) {
    const file = path.join(SESSION_DIR, `${name}.json`);
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
}

async function listSessions() {
    try {
        const files = await fs.readdir(SESSION_DIR);
        return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
    } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════
//  MULTI-LINE INPUT READER (for /error and /paste)
// ═══════════════════════════════════════════════════════════════
function readMultiLine(rl, prompt) {
    return new Promise((resolve) => {
        console.log(chalk.yellow.bold(prompt));
        console.log(chalk.gray('  (type END on its own line to finish)\n'));
        const lines = [];
        let blankCount = 0;
        const handler = (line) => {
            if (line.trim() === 'END') {
                rl.removeListener('line', handler);
                resolve(lines.join('\n'));
                return;
            }
            if (line.trim() === '') {
                blankCount++;
                if (blankCount >= 3) {
                    rl.removeListener('line', handler);
                    resolve(lines.join('\n'));
                    return;
                }
            } else {
                blankCount = 0;
            }
            lines.push(line);
            process.stdout.write(chalk.gray('  │ '));
        };
        rl.on('line', handler);
        process.stdout.write(chalk.gray('  │ '));
    });
}

/**
 * Truncate content for display — shows first N lines with a count of hidden lines.
 */
function truncateForDisplay(text, maxLines = 15, maxChars = 800) {
    const lines = text.split('\n');
    if (lines.length <= maxLines && text.length <= maxChars) return text;
    const shown = lines.slice(0, maxLines).join('\n');
    const hiddenLines = lines.length - maxLines;
    const suffix = hiddenLines > 0
        ? chalk.yellow(`\n... [${hiddenLines} more line${hiddenLines > 1 ? 's' : ''} truncated]`)
        : chalk.yellow('\n... [truncated]');
    return shown.slice(0, maxChars) + suffix;
}

async function autoSaveSession(messages) {
    try {
        await fs.mkdir(SESSION_DIR, { recursive: true });
        await fs.writeFile(path.join(SESSION_DIR, '_autosave.json'),
            JSON.stringify({ savedAt: new Date().toISOString(), messages }, null, 2), 'utf8');
    } catch { /* silent */ }
}

const stats = { steps: 0, toolCalls: 0, tokensEstimated: 0, startTime: Date.now(), errors: 0 };
let taskChecklist = { files: [], tasks: [], currentStep: 0, globalStyle: null };
let lastUserInput = null; // For /retry command

// ═══════════════════════════════════════════════════════════════
//  CONVERSATION BRANCHES
// ═══════════════════════════════════════════════════════════════
const branches = new Map();

function showStats() {
    const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
    const tokenEst = estimateMessagesTokens(messages);
    return [
        `${chalk.cyan('Steps:')} ${stats.steps}`,
        `${chalk.cyan('Tools:')} ${stats.toolCalls}`,
        `${chalk.cyan('Tokens:')} ~${tokenEst.toLocaleString()}`,
        `${chalk.cyan('Errors:')} ${stats.errors}`,
        `${chalk.cyan('Uptime:')} ${elapsed}s`,
        `${chalk.cyan('Changes:')} ${changeLog.length} (undoable)`,
        `${chalk.cyan('API Cost:')} ${costTracker.summary()}`,
        `${chalk.cyan('Branches:')} ${branches.size}`
    ].join('  │  ');
}

// ═══════════════════════════════════════════════════════════════
//  SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════
const systemPrompt = `You are Kimi, an elite AI coding agent operating through a terminal interface.
You are precise, persistent, and systematic. You NEVER give up until the task is complete.

## WORKFLOW
1. **PLAN**: State a brief plan (2-4 steps max). Do NOT over-plan. Start working immediately.
2. **EXECUTE**: Apply ALL edits for a file in ONE step. Do NOT read a file multiple times.
3. **VERIFY**: After code modifications, verify with \`verify_project\` or \`run_command\`.
4. **PERSIST**: Never stop mid-task. Execute ALL steps without waiting for permission.

## CRITICAL: SPEED & EFFICIENCY RULES
- **NEVER re-read a file you already have in context.** If you read a file, you have its full content. Use line numbers from that read to make edits.
- **NEVER read a file in small chunks (100 lines at a time).** Either use \`view_file_outline\` first to find the relevant section, then read just that section, OR read the entire file once.
- **Batch ALL independent tool calls together.** If you need to read 3 files, call read_file 3 times IN PARALLEL, not sequentially.
- **Make ALL edits for a file in a single search_replace call.** Do not make one small edit, then re-read, then another edit. Plan all your edits, then execute them.
- **When editing multiple files, process them ALL before stopping.** Don't get stuck on one file.
- **Minimize planning text.** Your output tokens cost time. Be terse. Use tools instead of explaining what you will do.

## TOOL USAGE
- **read_file**: Read a file ONCE before editing. For files >500 lines, use \`view_file_outline\` first to find the relevant section, then read that section with start_line/end_line. Results are cached.
- **search_replace**: PRIMARY edit tool. Use exact text from the file. Set replace_all: true for ALL occurrences.
- **patch_file**: Only if search_replace is ambiguous due to duplicate text blocks. Re-read for accurate line numbers if context was compacted.
- **write_file**: Only for NEW files or complete rewrites.
- **view_file_outline**: Use BEFORE reading large files to identify which sections matter.
- **grep_search**: Find patterns across the codebase. Results are capped, be specific with patterns.
- **find_files**: Find files by glob pattern (e.g. *.tsx, *Glass*). Cross-platform, works on Windows.
- **trace_imports**: Understand dependency graph before editing.
- **run_command**: Shell commands. This is a WINDOWS machine. Use PowerShell/cmd syntax, NOT Unix commands.

## ERROR HANDLING
- If a tool returns an error, analyze it and retry with a corrected approach.
- If search_replace fails ("not found"), re-read the file to get the exact current text.
- Maximum 3 self-correction attempts per tool call before reporting the issue.

## MULTI-FILE OPERATIONS
- For risky multi-file refactors, use \`begin_transaction\` first.
- Use \`update_task_status\` to mark checklist items as completed when done.

## STRICT RULES
- Use tool outputs as the ONLY source of truth. Never hallucinate file contents.
- When editing code, preserve existing formatting and style conventions.
- Use update_memory to save project patterns or architecture decisions.

## MOVIEFLIX PROJECT GUIDELINES
- This is a React Native app targeted at TV and Phone devices.
- PERFORMANCE IS CRITICAL. For heavy logic, prefer Kotlin Native Modules.
- NO PLACEHOLDERS: Use premium aesthetics (gradients, glassmorphism).
- This runs on WINDOWS. Use Windows-compatible shell commands.

Current working directory: ${process.cwd()}
PROJECT MEMORY:
{{MEMORY_CONTENT}}

ACTIVE CHECKLIST:
{{CHECKLIST_CONTENT}}
`;

const messages = [
    { role: "system", content: systemPrompt }
];

let pendingErrorInput = null; // used by /error and /paste to feed into the execution pipeline

// ═══════════════════════════════════════════════════════════════
//  CONTEXT MANAGEMENT (Token-budget based)
// ═══════════════════════════════════════════════════════════════
const MAX_CONTEXT_TOKENS = 100000; // ~100K budget (leave headroom for 128K models)

async function compactContext(msgs) {
    const tokenCount = estimateMessagesTokens(msgs);
    if (tokenCount < MAX_CONTEXT_TOKENS * 0.8) return msgs; // Under 80%, no action

    console.log(chalk.gray(`\n[Context] ${tokenCount.toLocaleString()} tokens (~${Math.round(tokenCount / MAX_CONTEXT_TOKENS * 100)}% capacity). Compacting...`));

    // Keep system prompt (index 0) and the most recent 5 messages
    // Summarize everything in between, adapting to conversation length
    const keepRecent = Math.min(5, Math.floor(msgs.length * 0.3)); // Keep 30% or 5, whichever is smaller
    const splitIdx = Math.max(2, msgs.length - keepRecent); // At least 2 messages to summarize
    const toSummarize = msgs.slice(1, splitIdx);
    const remaining = msgs.slice(splitIdx);

    if (toSummarize.length < 2) return msgs; // Not enough to summarize

    try {
        const summary = await callModel(MODELS.ARCHITECT, [
            {
                role: "system",
                content: `Summarize this conversation excerpt. 
CONSTRAINTS:
1. MANIFEST: List ALL files read, modified, or identified.
2. DECISIONS: Recap key technical decisions and why they were made.
3. STATE: Update the 'source of truth' for variables/flags changed.
Be surgical. Do NOT drop file paths.`
            },
            { role: "user", content: JSON.stringify(toSummarize.map(m => ({ role: m.role, content: (m.content || '').slice(0, 1500) }))) }
        ], { maxTokens: 3072 });
        console.log(chalk.green(`  ✓ Compacted ${toSummarize.length} messages → summary`));
        return [
            msgs[0],
            { role: "system", content: `CONTEXT SUMMARY:\n${summary.content}` },
            ...remaining
        ];
    } catch (e) {
        console.log(chalk.yellow(`  ⚠ Compaction failed: ${e.message}. Trimming oldest messages.`));
        return [msgs[0], ...msgs.slice(Math.floor(msgs.length / 2))];
    }
}

// ═══════════════════════════════════════════════════════════════
//  EXECUTION LOOP (with parallel tools, error recovery, step counter, streaming)
// ═══════════════════════════════════════════════════════════════
const MAX_TOOL_RETRIES = 3;

async function executeBatch(initialMessage, contextMessages, workerId = null, role = 'EXECUTOR', meta = {}) {
    let assistantMessage = initialMessage;
    let networkRetries = 0;
    let stepCount = 0;

    const log = (msg) => {
        if (!workerId) console.log(msg);
        else console.log(chalk.gray(`[Worker ${workerId}] `) + msg.replace(/\n(.*)/g, `\n${chalk.gray(`[Worker ${workerId}] `)} $1`));
    };

    while (stepCount < MAX_STEPS_PER_TASK) {
        if (!assistantMessage) throw new Error("Batch execution received a null message");
        stats.steps++;
        stepCount++;

        // 1. Display assistant content
        if (assistantMessage.content) {
            const clean = assistantMessage.content
                .replace(/<\|tool_calls_section_begin\|>[\s\S]*?<\|tool_calls_section_end\|>/g, '')
                .replace(/<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/g, '')
                .replace(/functions\.[\w_]+:\d+/g, '').trim();

            if (clean) {
                log("\n" + boxen(clean, {
                    title: chalk.bold.green(`Kimi [Step ${stats.steps}]`),
                    titleAlignment: 'left', padding: 1,
                    margin: { vertical: 1 }, borderStyle: 'round', borderColor: 'blue'
                }));
            }
        }

        // 2. Extract tool calls
        let toolCalls = assistantMessage.tool_calls || parseTextToolCalls(assistantMessage.content);

        if (toolCalls && toolCalls.length > 0) {
            // Parallel/Serial execution logic
            const getPath = (tc) => {
                try { return JSON.parse(tc.function.arguments)?.path || null; } catch { return null; }
            };
            const groups = new Map();
            const independent = [];
            for (const tc of toolCalls) {
                const p = getPath(tc);
                if (p) {
                    if (!groups.has(p)) groups.set(p, []);
                    groups.get(p).push(tc);
                } else {
                    independent.push(tc);
                }
            }

            const firstRound = [...independent, ...[...groups.values()].map(g => g[0])];
            const laterRounds = [...groups.values()].filter(g => g.length > 1).map(g => g.slice(1));

            const executeAndCollect = async (tcs) => {
                const results = await Promise.allSettled(tcs.map(tc => handleToolCall(tc, memoryFns)));
                for (let j = 0; j < results.length; j++) {
                    const result = results[j];
                    stats.toolCalls++;
                    if (result.status === 'fulfilled') {
                        contextMessages.push(result.value);
                        if (result.value.content?.startsWith('Error:')) stats.errors++;
                    } else {
                        stats.errors++;
                        contextMessages.push({
                            role: "tool", tool_call_id: tcs[j].id,
                            name: tcs[j].function.name,
                            content: `Error: ${result.reason?.message || 'Unknown error'}`
                        });
                    }
                }
            };

            await executeAndCollect(firstRound);
            for (const group of laterRounds) {
                for (const tc of group) await executeAndCollect([tc]);
            }

            // Context budget check
            const compacted = await compactContext(contextMessages);
            if (compacted !== contextMessages) {
                contextMessages.length = 0;
                contextMessages.push(...compacted);
            }
            await autoSaveSession(contextMessages);

            // Supervisor Check (Event-driven: every 20 steps or significant files)
            const hasSignificantChanges = contextMessages.slice(-toolCalls.length * 2).some(m =>
                m.role === 'tool' && ['write_file', 'patch_file', 'commit_transaction'].includes(m.name) && !m.content?.startsWith('Error:')
            );

            if ((stepCount % 20 === 0 || hasSignificantChanges) && !workerId) {
                log(chalk.magenta(`\n[Supervision] Checking progress...`));
                try {
                    const supervisorPrompt = ROLE_PROMPTS.SUPERVISOR
                        .replace('{{PRIMARY_GOAL}}', meta.primaryGoal || 'N/A')
                        .replace('{{GLOBAL_STYLE}}', JSON.stringify(taskChecklist.global_styles || 'Modern/Standard'))
                        .replace('{{TASK_PLAN}}', JSON.stringify(taskChecklist.files || 'In progress'));

                    const verification = await callModelWithFallback('SUPERVISOR', [
                        { role: "system", content: supervisorPrompt },
                        { role: "user", content: "Analyze recent progress and provide guidance or critical redirection if needed." }
                    ], { maxTokens: 1024 });

                    if (verification.result.content.includes('CRITICAL REDIRECTION')) {
                        log(chalk.red(`\n⚠ Supervisor Intervention!`));
                        contextMessages.push({ role: "system", content: verification.result.content });
                    }
                } catch (e) { /* silent */ }
            }

            // Next turn thinking
            const stepLabel = `Step ${stats.steps + 1}`;
            if (!workerId) spinner.start(chalk.gray(`Kimi Thinking (${stepLabel})...`));

            const systemPromptWithRole = ROLE_PROMPTS[role]
                .replace('{{PRIMARY_GOAL}}', meta.primaryGoal || 'N/A')
                .replace('{{TASK_PLAN}}', JSON.stringify(taskChecklist.files || 'In progress'));

            // Append role-specific guidance WITHOUT overwriting the full system prompt
            // Only update if the role prompt is meaningfully different from the existing content
            const existingSystem = contextMessages[0]?.content || '';
            if (!existingSystem.includes('ROLE DIRECTIVE:')) {
                contextMessages[0] = { role: "system", content: existingSystem + `\n\n--- ROLE DIRECTIVE ---\n${systemPromptWithRole}` };
            }

            try {
                const fb = await callModelWithFallback('EXECUTOR', contextMessages.filter(m => m !== null), {
                    stream: !workerId,
                    extraBody: { tools, tool_choice: "auto", chat_template_kwargs: { thinking: true } }
                });
                assistantMessage = fb.result;
            } catch (err) {
                // ... (error handling remains similar, slightly cleaned up)
                if (err.response?.status === 400) {
                    const compacted = await compactContext(contextMessages);
                    contextMessages.length = 0; contextMessages.push(...compacted);
                    const fb = await callModelWithFallback('EXECUTOR', contextMessages.filter(m => m !== null), { stream: !workerId, extraBody: { tools, tool_choice: "auto", chat_template_kwargs: { thinking: true } } });
                    assistantMessage = fb.result;
                } else if (isRetriableError(err) && networkRetries < 3) {
                    networkRetries++;
                    await new Promise(r => setTimeout(r, 5000 * networkRetries));
                    continue; // Loop will retry
                } else {
                    log(chalk.red(`\n❌ Executor failed: ${err.message}`));
                    break;
                }
            }
            contextMessages.push(assistantMessage);
            continue;
        }

        // Final Verification check before exit
        const hasVerified = contextMessages.slice(-15).some(m =>
            m.role === 'tool' && (m.name === 'verify_project' || /build|lint|test|tsc|expo/.test(m.content || ''))
        );

        if (changeLog.length > 0 && !hasVerified && stepCount < MAX_STEPS_PER_TASK - 1) {
            log(chalk.yellow(`\n[Enforcer] Changes detected without verification.`));
            contextMessages.push({ role: "system", content: "CRITICAL: You have modified files but not yet verified the build/lint. Run a verification command before finishing." });

            const fb = await callModelWithFallback('EXECUTOR', contextMessages, { stream: !workerId, extraBody: { tools, tool_choice: "auto" } });
            assistantMessage = fb.result;
            contextMessages.push(assistantMessage);
            continue;
        }

        break;
    }

    if (stepCount >= MAX_STEPS_PER_TASK) {
        log(chalk.red(`\n⚠ Safety limit reached (${MAX_STEPS_PER_TASK} steps). Stopping current task.`));
    }
}

// ═══════════════════════════════════════════════════════════════
//  SLASH COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════
async function handleSlashCommand(input, rl, messages) {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ');

    switch (cmd) {
        case '/help':
            console.log(boxen([
                chalk.cyan.bold('Available Commands:'),
                `  ${chalk.green('/help')}      — Show this help`,
                `  ${chalk.green('/error')}     — Paste a multi-line error/stack trace`,
                `  ${chalk.green('/paste')}     — Paste any multi-line content`,
                `  ${chalk.green('/undo')}      — Revert last file change`,
                `  ${chalk.green('/status')}    — Show session stats + API cost`,
                `  ${chalk.green('/clear')}     — Clear conversation history`,
                `  ${chalk.green('/compact')}   — Force context compaction`,
                `  ${chalk.green('/save')} ${chalk.gray('[name]')}  — Save session`,
                `  ${chalk.green('/load')} ${chalk.gray('[name]')}  — Load session`,
                `  ${chalk.green('/sessions')}  — List saved sessions`,
                `  ${chalk.green('/branch')} ${chalk.gray('[name]')} — Snapshot context (for risky experiments)`,
                `  ${chalk.green('/rollback')} ${chalk.gray('[name]')} — Restore a branch snapshot`,
                `  ${chalk.green('/branches')}  — List all branch snapshots`,
                `  ${chalk.green('/direct')} ${chalk.gray('[prompt]')} — Skip planning phase`,
                `  ${chalk.green('/swarm')} ${chalk.gray('[prompt]')}  — Force swarm mode for multi-file tasks`,
                `  ${chalk.green('/resume')}    — Resume from autosaved session`,
                `  ${chalk.green('/retry')}     — Re-send last user message`,
                `  ${chalk.green('/model')} ${chalk.gray('[role] [id]')} — Switch model at runtime`,
                `  ${chalk.green('/export')} ${chalk.gray('[name]')} — Export conversation as markdown`,
            ].join('\n'), { padding: 1, borderColor: 'cyan', borderStyle: 'round' }));
            return true;

        case '/undo':
            const undoResult = await undoLastChange();
            console.log(chalk.yellow(`\n🔄 ${undoResult}`));
            return true;

        case '/status':
            console.log('\n' + boxen(showStats(), { title: chalk.bold('Session Status'), padding: 1, borderColor: 'cyan' }));
            return true;

        case '/clear':
            messages.length = 1; // Keep system prompt
            stats.steps = 0; stats.toolCalls = 0; stats.errors = 0;
            console.log(chalk.yellow('\n🗑️  Conversation cleared.'));
            return true;

        case '/compact':
            const before = estimateMessagesTokens(messages);
            const compacted = await compactContext(messages);
            messages.length = 0;
            messages.push(...compacted);
            const after = estimateMessagesTokens(messages);
            console.log(chalk.green(`\n📦 Compacted: ${before.toLocaleString()} → ${after.toLocaleString()} tokens`));
            return true;

        case '/save': {
            const name = arg || `session_${Date.now()}`;
            const file = await saveSession(name, messages);
            console.log(chalk.green(`\n💾 Session saved: ${file}`));
            return true;
        }

        case '/load': {
            if (!arg) {
                const sessions = await listSessions();
                if (sessions.length === 0) { console.log(chalk.yellow('\nNo saved sessions.')); return true; }
                console.log(chalk.cyan('\nSaved sessions:'));
                sessions.forEach(s => console.log(chalk.gray(`  ▸ `) + s));
                return true;
            }
            try {
                const session = await loadSession(arg);
                messages.length = 0;
                messages.push(...session.messages);
                console.log(chalk.green(`\n📂 Loaded session "${arg}" (${session.messages.length} messages)`));
            } catch (e) {
                console.log(chalk.red(`\n✗ Could not load "${arg}": ${e.message}`));
            }
            return true;
        }

        case '/sessions': {
            const sessions = await listSessions();
            if (sessions.length === 0) { console.log(chalk.yellow('\nNo saved sessions.')); return true; }
            console.log(chalk.cyan('\nSaved sessions:'));
            sessions.forEach(s => console.log(chalk.gray(`  ▸ `) + s));
            return true;
        }

        case '/error': {
            const body = arg || await readMultiLine(rl, '📋 Paste your error / stack trace below:');
            if (!body.trim()) { console.log(chalk.yellow('\n⚠ Empty input, cancelled.')); return true; }
            const fullText = `ERROR TO FIX:\n${body}`;
            console.log(boxen(truncateForDisplay(fullText), {
                title: chalk.bold.red('Error Input'), titleAlignment: 'left',
                padding: 0, margin: { top: 1, bottom: 0, left: 1, right: 1 },
                borderStyle: 'single', borderColor: 'red'
            }));
            // Set pending input — message will be pushed by the main loop
            pendingErrorInput = fullText;
            return 'process';
        }

        case '/paste': {
            const body = arg || await readMultiLine(rl, '📋 Paste your content below:');
            if (!body.trim()) { console.log(chalk.yellow('\n⚠ Empty input, cancelled.')); return true; }
            console.log(boxen(truncateForDisplay(body), {
                title: chalk.bold.blue('Pasted Input'), titleAlignment: 'left',
                padding: 0, margin: { top: 1, bottom: 0, left: 1, right: 1 },
                borderStyle: 'single', borderColor: 'cyan'
            }));
            // Set pending input — message will be pushed by the main loop
            pendingErrorInput = body;
            return 'process';
        }

        case '/resume': {
            try {
                const auto = await loadSession('_autosave');
                if (auto.messages?.length > 1) {
                    messages.length = 0;
                    messages.push(...auto.messages);
                    console.log(chalk.green(`\n📂 Resumed autosave (${auto.messages.length} messages, saved ${auto.savedAt || 'unknown'})`));
                } else {
                    console.log(chalk.yellow('\nNo usable autosave found.'));
                }
            } catch {
                console.log(chalk.yellow('\nNo autosave session found.'));
            }
            return true;
        }

        case '/retry': {
            if (!lastUserInput) {
                console.log(chalk.yellow('\nNo previous user message to retry.'));
                return true;
            }
            console.log(chalk.cyan(`\n🔄 Retrying: "${lastUserInput.slice(0, 80)}${lastUserInput.length > 80 ? '...' : ''}"\n`));
            pendingErrorInput = lastUserInput;
            return 'process';
        }

        case '/model': {
            const [role, ...modelParts] = arg.split(/\s+/);
            const modelId = modelParts.join(' ');
            if (!role || !modelId) {
                console.log(chalk.cyan('\nCurrent models:'));
                Object.entries(MODELS).forEach(([r, id]) => console.log(`  ${chalk.gray(r.padEnd(12))} ${chalk.white(id)}`));
                console.log(chalk.gray('\n  Usage: /model EXECUTOR nvidia/new-model-id'));
                return true;
            }
            const upperRole = role.toUpperCase();
            if (!MODELS[upperRole]) {
                console.log(chalk.red(`\n✗ Unknown role "${upperRole}". Available: ${Object.keys(MODELS).join(', ')}`));
                return true;
            }
            MODELS[upperRole] = modelId;
            console.log(chalk.green(`\n✓ ${upperRole} model changed to ${modelId}`));
            return true;
        }

        case '/export': {
            const exportName = arg || `kimi_export_${Date.now()}`;
            const lines = [];
            lines.push(`# Kimi Conversation Export\n`);
            lines.push(`> Exported: ${new Date().toISOString()}\n`);
            lines.push(`> Messages: ${messages.length}\n`);
            lines.push(`> Stats: ${stats.steps} steps, ${stats.toolCalls} tool calls, ${stats.errors} errors\n`);
            lines.push(`---\n`);
            for (const m of messages) {
                if (m.role === 'system' && m === messages[0]) continue; // Skip system prompt
                const roleLabel = m.role === 'assistant' ? '🤖 **Kimi**' : m.role === 'user' ? '👤 **User**' : m.role === 'tool' ? `🔧 \`${m.name}\`` : `📋 *${m.role}*`;
                lines.push(`### ${roleLabel}\n`);
                const content = (m.content || '').slice(0, 5000);
                if (m.tool_calls) {
                    lines.push(`Tool calls: ${m.tool_calls.map(tc => tc.function?.name).join(', ')}\n`);
                }
                if (content) lines.push(`\`\`\`\n${content}\n\`\`\`\n`);
                lines.push('');
            }
            const exportPath = path.join(SESSION_DIR, `${exportName}.md`);
            await fs.mkdir(SESSION_DIR, { recursive: true });
            await fs.writeFile(exportPath, lines.join('\n'), 'utf8');
            console.log(chalk.green(`\n📄 Exported to ${exportPath}`));
            return true;
        }

        case '/branch': {
            const name = arg || `branch_${Date.now()}`;
            branches.set(name, JSON.parse(JSON.stringify(messages)));
            console.log(chalk.green(`\n🌿 Branch '${name}' created (${messages.length} messages snapshotted)`));
            return true;
        }

        case '/rollback': {
            if (!arg) {
                if (branches.size === 0) { console.log(chalk.yellow('\nNo branches saved.')); return true; }
                console.log(chalk.cyan('\nAvailable branches:'));
                branches.forEach((v, k) => console.log(chalk.gray(`  ▸ `) + k + chalk.gray(` (${v.length} messages)`)));
                return true;
            }
            const snapshot = branches.get(arg);
            if (!snapshot) { console.log(chalk.red(`\n✗ Branch '${arg}' not found.`)); return true; }
            messages.length = 0;
            messages.push(...JSON.parse(JSON.stringify(snapshot)));
            console.log(chalk.green(`\n↩️ Rolled back to branch '${arg}' (${messages.length} messages)`));
            return true;
        }

        case '/branches': {
            if (branches.size === 0) { console.log(chalk.yellow('\nNo branches saved.')); return true; }
            console.log(chalk.cyan('\nSaved branches:'));
            branches.forEach((v, k) => console.log(chalk.gray(`  ▸ `) + k + chalk.gray(` (${v.length} messages)`)));
            return true;
        }

        case '/direct': {
            if (!arg) { console.log(chalk.yellow('\nUsage: /direct <prompt>')); return true; }
            pendingErrorInput = arg;
            return 'process';
        }

        case '/swarm': {
            console.log(chalk.bgMagenta.white.bold(` 🐝 Swarm mode will be forced for the next task `));
            // Set a flag that the next task should force swarm
            pendingErrorInput = arg || null;
            return true;
        }

        default:
            return false; // Not a recognized slash command
    }
}

// ═══════════════════════════════════════════════════════════════
//  MAIN AGENT
// ═══════════════════════════════════════════════════════════════
async function startAgent() {
    // ─── Rich Startup Banner ───
    const modelList = Object.entries(MODELS).map(([role, id]) =>
        `  ${chalk.gray(role.padEnd(12))} ${chalk.white(id.split('/')[1])}`
    ).join('\n');

    console.log("\n" + boxen(
        chalk.green.bold('  ╔═╗ Kimi AI Agent v2.0') + '\n' +
        chalk.green.bold('  ╠═╣ ') + chalk.cyan('Multi-Model • Streaming • Persistent') + '\n' +
        chalk.green.bold('  ╚═╝ ') + chalk.gray('State-of-the-Art Coding Agent') + '\n\n' +
        chalk.cyan.bold('Models:') + '\n' + modelList + '\n\n' +
        chalk.cyan.bold('Tools:') + ` ${tools.length} available (type ${chalk.green('/help')} for commands)\n` +
        chalk.gray('Press Esc to exit • Ctrl+C to quit'),
        { padding: 1, margin: { bottom: 1 }, borderStyle: 'double', borderColor: 'green', dimBorder: false }
    ));

    // Load memory and checklist into system prompt
    const memory = await memoryFns.load();
    const checklistContent = taskChecklist.files?.length > 0
        ? JSON.stringify(taskChecklist, null, 2)
        : "No active checklist.";
    messages[0].content = systemPrompt
        .replace("{{MEMORY_CONTENT}}", memory)
        .replace("{{CHECKLIST_CONTENT}}", checklistContent);

    // Try to load autosave
    try {
        const auto = await loadSession('_autosave');
        if (auto.messages?.length > 1) {
            console.log(chalk.gray(`  [Recovered ${auto.messages.length} messages from last session]`));
        }
    } catch { /* no autosave */ }

    // Setup input
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    process.stdin.on('keypress', (str, key) => {
        if (key.name === 'escape') { console.log(chalk.yellow('\n\nBye!')); process.exit(0); }
        if (key.ctrl && key.name === 'c') process.exit(0);
    });

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const ask = (q) => new Promise((resolve, reject) => {
        rl.question(q, resolve);
    });

    // Graceful exit when readline closes (terminal closed, pipe broken, etc.)
    rl.on('close', async () => {
        console.log(chalk.yellow('\n\nTerminal closed. Saving session...'));
        await autoSaveSession(messages).catch(() => { });
        process.exit(0);
    });

    // ─── Main Loop ───
    while (true) {
        try {
            let userInput;

            if (pendingErrorInput) {
                // /error, /paste, or /retry set this — push message here (single source of truth)
                userInput = pendingErrorInput;
                pendingErrorInput = null;
                messages.push({ role: 'user', content: userInput });
            } else {
                // Show token usage in prompt bar
                const tokenEst = estimateMessagesTokens(messages);
                const tokenBar = chalk.gray(` [${tokenEst.toLocaleString()} tokens]`);
                console.log(chalk.gray("─".repeat(60)) + tokenBar);
                userInput = await ask(chalk.blue.bold('❯ '));

                if (!userInput.trim()) continue;
                if (userInput.toLowerCase() === 'exit') break;

                // Check slash commands
                if (userInput.startsWith('/')) {
                    const handled = await handleSlashCommand(userInput, rl, messages);
                    if (handled === true) continue;       // fully handled
                    if (handled === 'process') continue;  // /error or /paste — message already pushed, fall through to next iteration
                }

                // Display user input (truncated for readability)
                console.log(boxen(truncateForDisplay(userInput), {
                    title: chalk.bold.blue('You'), titleAlignment: 'left',
                    padding: 0, margin: { top: 1, bottom: 0, left: 1, right: 1 },
                    borderStyle: 'single', borderColor: 'cyan'
                }));

                messages.push({ role: "user", content: userInput });
            }

            lastUserInput = userInput; // Store for /retry
            const primaryGoal = userInput; // Goal anchoring

            let intent = 'PLAN';
            let triageData = { category: 'PLAN' };
            let forceSwarm = false;
            try {
                const triageMessages = [
                    {
                        role: "system",
                        content: `Categorize the user's request into EXACTLY one of these categories:
- CHAT: Greetings, small talk, or general conversation.
- RESEARCH: Questions about the codebase, architecture, or technical research.
- PLAN: Implementation tasks, bug fixes, or new features requiring multiple steps.
- DIRECT: One-liner tool requests, explicit commands, or requests to skip planning.

EXAMPLES:
"Hello" -> CHAT
"How does the auth work?" -> RESEARCH  
"Fix the button lag" -> PLAN
"run ls" -> DIRECT
"we were adding X to multiple files" -> PLAN

Output ONLY the category word, nothing else.`
                    },
                    { role: "user", content: `REQUEST: "${userInput.slice(0, 500)}"\n\nCATEGORY:` }
                ];

                const triageResults = await callModelWithFallback('TRIAGE', triageMessages, { maxTokens: 20 });
                const raw = String(triageResults.result.content || '').trim();

                // Robust parsing: try JSON first, then extract from reasoning/fenced text
                let parsed = null;
                try {
                    parsed = JSON.parse(raw);
                } catch {
                    // Try extracting JSON from markdown fences or reasoning text
                    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || raw.match(/(\{[\s\S]*?\})/);
                    if (jsonMatch) {
                        try { parsed = JSON.parse(jsonMatch[1]); } catch { /* not valid JSON */ }
                    }
                }

                if (parsed && parsed.category) {
                    triageData = parsed;
                    intent = (triageData.category || 'PLAN').toUpperCase();
                } else {
                    // Word-based fallback (handles reasoning models that output explanation + word)
                    const content = raw.toUpperCase();
                    if (/\bDIRECT\b/.test(content)) intent = 'DIRECT';
                    else if (/\bRESEARCH\b/.test(content)) intent = 'RESEARCH';
                    else if (/\bCHAT\b/.test(content)) intent = 'CHAT';
                    else if (/\bPLAN\b/.test(content)) intent = 'PLAN';
                    else intent = 'PLAN';
                }

                // Validate
                if (!['CHAT', 'RESEARCH', 'PLAN', 'DIRECT'].includes(intent)) intent = 'PLAN';

                console.log(chalk.gray(`      ▸ Intent Detected: ${intent}`));
            } catch (e) {
                console.log(chalk.yellow(`      ⚠ Triage failed (${e.message}), defaulting to PLAN.`));
            }

            if (intent.includes('CHAT')) {
                console.log(chalk.gray("\n[Fast-Track] Quick response..."));
                try {
                    const fb = await callModelWithFallback('EXECUTOR', [
                        { role: "system", content: "You are Kimi, a coding assistant. Be helpful, concise and friendly." },
                        ...messages.filter(m => m.role !== 'system')
                    ], { maxTokens: 1024, stream: true });
                    messages.push(fb.result);
                } catch (e) {
                    console.error(chalk.red(`\n❌ Chat component failed: ${e.message}`));
                }
                continue;
            }

            // ─── Specialized Orchestration ───
            if (intent.includes('DIRECT')) {
                console.log(chalk.gray("\n[Direct Mode] Skipping planning..."));
            } else {
                const needsPlan = intent.includes('PLAN');
                const needsResearch = intent.includes('RESEARCH') || needsPlan;
                const isFastTrack = triageData.fast_track && triageData.initial_plan;

                if (isFastTrack) {
                    console.log(chalk.green(`      ✓ Fast-track plan accepted.`));
                    messages.push({ role: "system", content: `INITIAL PLAN:\n${triageData.initial_plan.join('\n')}` });
                }

                console.log(chalk.magenta.bold(`\n[2/3] Specialized Roles: ${needsPlan && !isFastTrack ? 'Supervisor + Architect' : 'Architect only'}...`));

                // Quick file tree scan for Supervisor context (so it can provide real paths)
                let fileTreeContext = '';
                if (needsPlan && !isFastTrack) {
                    try {
                        const { execAsync: ea } = await import('node:child_process').then(m => ({ execAsync: promisify(m.exec) })).catch(() => ({ execAsync }));
                        // Use list_dir equivalent to give supervisor real paths
                        const topEntries = await import('node:fs/promises').then(async fsp => {
                            const entries = await fsp.readdir(process.cwd(), { withFileTypes: true });
                            return entries.filter(e => !['node_modules', '.git', '.gradle', '.expo', 'android_backup'].includes(e.name))
                                .map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`)
                                .slice(0, 40).join('\n');
                        });
                        fileTreeContext = `\n\nPROJECT FILE TREE (top-level):\n${topEntries}`;
                    } catch { /* silent */ }
                }

                const planningCalls = [];
                if (needsPlan && !isFastTrack) {
                    const p = callModelWithFallback('SUPERVISOR', [
                        {
                            role: "system",
                            content: `You are the project supervisor. Analyze the user request and create a HIGH-LEVEL master plan.

RULES:
- Use ONLY the file paths that the user explicitly mentions OR that appear in the PROJECT FILE TREE below.
- If the user mentions specific files, include them in a JSON checklist.
- If the task involves updating multiple files, provide a JSON checklist with ALL files that need work.
- For discovery tasks, instruct the Executor to use find_files or grep_search first.

ALWAYS provide a JSON checklist when the user mentions specific files:
\`\`\`json
{
  "project_goal": "Description",
  "files": [
    { "path": "path/to/file.tsx", "status": "pending", "requirement": "What to do" }
  ]
}
\`\`\`${fileTreeContext}`
                        },
                        { role: "user", content: userInput.slice(0, 5000) }
                    ], { maxTokens: 2048, timeout: 45000 });
                    planningCalls.push(p.then(res => ({ ...res, roleAssigned: 'SUPERVISOR' })));
                }
                if (needsResearch) {
                    const p = callModelWithFallback('ARCHITECT', [
                        {
                            role: "system", content: `You are the lead architect. Provide technical guidance and code patterns. Be concise.

CRITICAL RULES:
- Do NOT invent imports, component names, or APIs that you haven't verified exist.
- Instead, instruct the Executor to READ the actual source files first to discover the real API.
- Focus on the APPROACH (how to structure the changes) rather than exact code.
- If you reference specific components or imports, qualify them with "(verify this exists first)".
- Your guidance should help the Executor work systematically, not give it fake starter code.` },
                        { role: "user", content: userInput.slice(0, 5000) }
                    ], { maxTokens: 2048, timeout: 45000 });
                    planningCalls.push(p.then(res => ({ ...res, roleAssigned: 'ARCHITECT' })));
                }

                const planningResults = await Promise.allSettled(planningCalls);

                const planParts = [];
                planningResults.forEach((res, idx) => {
                    if (res.status === 'fulfilled') {
                        const val = res.value;
                        const label = val.model.split('/')[1];
                        const title = val.roleAssigned === 'SUPERVISOR' ? 'Master Plan' : 'Blueprint';

                        // Extract JSON checklist if present
                        const jsonMatch = val.result.content.match(/```json\s+([\s\S]*?)\s+```/);
                        if (jsonMatch) {
                            try {
                                const checklist = JSON.parse(jsonMatch[1]);
                                if (checklist.files) {
                                    taskChecklist = { ...taskChecklist, ...checklist };
                                    console.log(chalk.green(`      ✓ Structured checklist loaded (${taskChecklist.files.length} files tracked)`));
                                }
                            } catch (e) { /* ignore malformed JSON in plan */ }
                        }

                        console.log("\n" + boxen(val.result?.content || '(empty)', { title: `${title} (${label})`, padding: 1, margin: { bottom: 1 }, borderColor: val.roleAssigned === 'SUPERVISOR' ? "magenta" : "yellow" }));
                        planParts.push(`${title.toUpperCase()}:\n${val.result.content}`);
                    } else {
                        console.log(chalk.yellow(`\n⚠ A specialized model failed to respond.`));
                    }
                });

                if (planParts.length > 0) {
                    messages.push({ role: "system", content: planParts.join("\n\n") });
                } else {
                    // ALL planning models failed — inject a graceful fallback plan
                    console.log(chalk.yellow(`\n⚠ All planning models failed. Injecting fallback plan for Executor...`));
                    messages.push({
                        role: "system",
                        content: `PLANNING MODELS UNAVAILABLE — FALLBACK PLAN:
Proceed with the user's request using this systematic approach:
1. Use find_files and grep_search to discover relevant files first
2. Read each file before modifying it
3. Make changes one file at a time
4. Continue until all files are processed
Do NOT wait for planning guidance. Execute the task independently and methodically.`
                    });
                }
            }

            // ─── Executor Phase (streaming or Swarm) ───
            console.log(chalk.cyan.bold(`\n[Executor] Running...`));

            const checklistContent = taskChecklist.files?.length > 0
                ? JSON.stringify(taskChecklist, null, 2)
                : "No active checklist.";

            // Inject updated checklist into system prompt
            messages[0].content = messages[0].content
                .replace(/ACTIVE CHECKLIST:\n[\s\S]*$/, `ACTIVE CHECKLIST:\n${checklistContent}\n`);

            const meta = { primaryGoal, checklist: taskChecklist };

            // Swarm activates with ≥2 files or when force-flagged
            if (forceSwarm || taskChecklist.files?.length >= 2) {
                console.log(chalk.bgMagenta.white.bold(` 🐝 SWARM MODE ACTIVATED 🐝 `));
                console.log(chalk.magenta(`Spawning multiple independent workers to process ${taskChecklist.files.length} files in parallel...`));

                const workers = [];
                const chunkSize = Math.ceil(taskChecklist.files.length / 3);
                for (let i = 0; i < taskChecklist.files.length; i += chunkSize) {
                    const chunkFiles = taskChecklist.files.slice(i, i + chunkSize);
                    const workerId = i / chunkSize + 1;

                    const workerHistory = JSON.parse(JSON.stringify(messages));
                    workerHistory.push({
                        role: "system",
                        content: `SWARM WORKER INSTRUCTION: You are Swarm Worker ${workerId}.\nYour specific assignment: ${JSON.stringify(chunkFiles, null, 2)}`
                    });

                    workers.push((async () => {
                        const fb = await callModelWithFallback('EXECUTOR', workerHistory.filter(m => m !== null), { stream: false, extraBody: { tools, tool_choice: "auto" } });
                        const initialMsg = fb.result;
                        workerHistory.push(initialMsg);
                        await executeBatch(initialMsg, workerHistory, workerId, 'EXECUTOR', meta);
                        return `Worker ${workerId} done.`;
                    })());
                }

                await Promise.allSettled(workers);
                console.log(chalk.bgMagenta.white.bold(` 🐝 SWARM EXECUTION COMPLETE 🐝 `));
            } else {
                spinner.start(chalk.gray("Kimi Thinking..."));
                const fb = await callModelWithFallback('EXECUTOR', messages.filter(m => m !== null), { stream: true, extraBody: { tools, tool_choice: "auto" } });
                const initialMsg = fb.result;
                messages.push(initialMsg);
                await executeBatch(initialMsg, messages, null, 'EXECUTOR', meta);
            }

            // ─── Post-Task Autonomous Memory Phase ───
            if (changeLog.length > 0) {
                console.log(chalk.magenta(`\n[Memory] Consolidating knowledge...`));
                try {
                    const memoryUpdate = await callModel(MODELS.ARCHITECT, [
                        { role: "system", content: "Extract 1-3 critical technical insights (bugs, patterns, paths) from this session for long-term memory. Be extremely concise. Bullet points only." },
                        { role: "user", content: JSON.stringify(messages.slice(-20).map(m => ({ role: m.role, content: (m.content || '').slice(0, 500) }))) }
                    ], { maxTokens: 512 });
                    if (memoryUpdate.content) {
                        const currentMem = await memoryFns.load();
                        await memoryFns.save(currentMem + "\n" + memoryUpdate.content);
                        console.log(chalk.green(`      ✓ Knowledge expanded.`));
                    }
                } catch (e) { /* ignore */ }
            }
            await autoSaveSession(messages);

            // Auto-test runner — find and run nearest test file for modified files
            const modifiedFiles = changeLog.slice(-10).map(c => c.path).filter(Boolean);
            if (modifiedFiles.length > 0) {
                const testPatterns = ['test', 'spec', '__tests__'];
                const hasTest = modifiedFiles.some(f => testPatterns.some(p => f.includes(p)));
                if (!hasTest) {
                    // Check if there's a matching test file
                    for (const f of modifiedFiles) {
                        const dir = path.dirname(f);
                        const base = path.basename(f, path.extname(f));
                        const testCandidates = [
                            path.join(dir, `${base}.test${path.extname(f)}`),
                            path.join(dir, `${base}.spec${path.extname(f)}`),
                            path.join(dir, '__tests__', `${base}${path.extname(f)}`)
                        ];
                        for (const tc of testCandidates) {
                            try {
                                await fs.access(tc);
                                console.log(chalk.magenta(`\n[🧪 Auto-Test] Found test file: ${tc}`));
                                // Inject a hint to the executor to run the test
                                messages.push({
                                    role: "system",
                                    content: `AUTO-TEST DETECTED: A test file exists at ${tc} for your recent changes. Consider running it to verify correctness.`
                                });
                                break;
                            } catch { /* no test file */ }
                        }
                    }
                }
            }

            // Show step summary
            console.log(chalk.gray(`\n── Completed: ${stats.steps} steps, ${stats.toolCalls} tool calls | ${costTracker.summary()} ──`));

        } catch (error) {
            spinner.stop();
            stats.errors++;
            if (error === '') { console.log(chalk.yellow('\nGoodbye!')); process.exit(0); }
            console.error(chalk.red("\n❌ Error:"), error.response?.data || error.message);
            console.log(chalk.gray("Returning to prompt.\n"));
            continue;
        }
    }
}

// ═══════════════════════════════════════════════════════════════
//  PROCESS HANDLERS
// ═══════════════════════════════════════════════════════════════
process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n\nSaving session before exit...'));
    await autoSaveSession(messages).catch(() => { });
    console.log(chalk.yellow('Goodbye!'));
    process.exit(0);
});

process.on('uncaughtException', async (err) => {
    spinner.stop();
    console.error(chalk.red("\n💥 Uncaught Error:"), err.message);
    await autoSaveSession(messages).catch(() => { });
    process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
    spinner.stop();
    console.error(chalk.red("\n💥 Unhandled Rejection:"), reason instanceof Error ? reason.message : reason);
    await autoSaveSession(messages).catch(() => { });
});

startAgent().catch(err => {
    console.error(chalk.red("FATAL ERROR:"), err);
    process.exit(1);
});
