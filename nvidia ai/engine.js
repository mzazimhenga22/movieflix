#!/usr/bin/env node
import axios from 'axios';
import chalk from 'chalk';
import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ora from 'ora';

export const execAsync = promisify(exec);
export const spinner = ora();

// ═══════════════════════════════════════════════════════════════
//  SMART FILE CACHE (LRU, invalidated on write/patch/search_replace)
// ═══════════════════════════════════════════════════════════════
const MAX_CACHE_ENTRIES = 50;
const fileCache = new Map(); // path -> { content, mtime }

const PROJECT_ROOT = process.cwd();

export function validatePath(filePath) {
    const absolutePath = path.resolve(PROJECT_ROOT, filePath);
    if (!absolutePath.startsWith(PROJECT_ROOT)) {
        throw new Error(`Access denied: Path ${filePath} is outside project root ${PROJECT_ROOT}`);
    }
    return absolutePath;
}

export function invalidateCache(filePath) {
    const absPath = path.resolve(PROJECT_ROOT, filePath);
    fileCache.delete(absPath);
}

async function cachedReadFile(filePath) {
    const cached = fileCache.get(filePath);
    if (cached) {
        try {
            const stat = await fs.stat(filePath);
            if (stat.mtimeMs === cached.mtime) return cached.content;
        } catch { /* fall through */ }
    }
    const content = await fs.readFile(filePath, 'utf8');
    const stat = await fs.stat(filePath);
    // LRU eviction: delete oldest entries when cache exceeds limit
    if (fileCache.size >= MAX_CACHE_ENTRIES) {
        const oldest = fileCache.keys().next().value;
        fileCache.delete(oldest);
    }
    fileCache.set(filePath, { content, mtime: stat.mtimeMs });
    return content;
}

// ═══════════════════════════════════════════════════════════════
//  TOKEN COST TRACKER
// ═══════════════════════════════════════════════════════════════
export const costTracker = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    apiCalls: 0,
    toolSuccessRate: { success: 0, fail: 0 },
    modelRetries: 0,
    trackCall(inputTokens, outputTokens) {
        this.totalInputTokens += inputTokens;
        this.totalOutputTokens += outputTokens;
        this.apiCalls++;
    },
    trackTool(success) {
        if (success) this.toolSuccessRate.success++;
        else this.toolSuccessRate.fail++;
    },
    summary() {
        const rate = (this.toolSuccessRate.success / (this.toolSuccessRate.success + this.toolSuccessRate.fail || 1) * 100).toFixed(1);
        return `API Calls: ${this.apiCalls} | Input: ~${this.totalInputTokens.toLocaleString()} | Output: ~${this.totalOutputTokens.toLocaleString()} | Tools: ${rate}% success | Retries: ${this.modelRetries}`;
    }
};

// ═══════════════════════════════════════════════════════════════
//  ATOMIC MULTI-FILE TRANSACTION
// ═══════════════════════════════════════════════════════════════
let activeTransaction = null;

export function beginTransaction() {
    activeTransaction = { files: new Map(), committed: false };
    return activeTransaction;
}

export async function commitTransaction() {
    if (!activeTransaction) return 'No active transaction';
    activeTransaction.committed = true;
    const count = activeTransaction.files.size;
    activeTransaction = null;
    return `Transaction committed (${count} files)`;
}

export async function rollbackTransaction() {
    if (!activeTransaction) return 'No active transaction';
    for (const [filePath, original] of activeTransaction.files) {
        if (original === null) {
            await fs.unlink(filePath).catch(() => { });
        } else {
            await fs.writeFile(filePath, original, 'utf8');
        }
        invalidateCache(filePath);
    }
    const count = activeTransaction.files.size;
    activeTransaction = null;
    return `Transaction rolled back (${count} files reverted)`;
}

async function recordInTransaction(filePath) {
    if (activeTransaction && !activeTransaction.files.has(filePath)) {
        const original = await fs.readFile(filePath, 'utf8').catch(() => null);
        activeTransaction.files.set(filePath, original);
    }
}

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS & MODELS
// ═══════════════════════════════════════════════════════════════
export const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
export const API_KEY = "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";
export const QUEUE_DETECT_TIMEOUT_MS = 45000;  // 45s (raised from 15s to avoid false queue messages)
export const FINAL_TIMEOUT_MS = 300000;        // 5 min
export const MAX_RETRIES_PER_MODEL = 3;
export const COMMAND_TIMEOUT_MS = 60000;      // 60s cap for shell commands
export const MAX_OUTPUT_BYTES = 30720;        // 30KB output cap (raised from 10KB)
export const SUMMARIZE_THRESHOLD = 51200;     // 50KB threshold for compression (raised from 5KB to prevent re-reads)

export const MODELS = {
    TRIAGE: "meta/llama-3.1-70b-instruct",
    SUPERVISOR: "meta/llama-3.1-70b-instruct",
    ARCHITECT: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    EXECUTOR: "moonshotai/kimi-k2.5"
};

export const FALLBACK_CHAINS = {
    TRIAGE: [MODELS.TRIAGE, MODELS.ARCHITECT, MODELS.EXECUTOR],
    SUPERVISOR: [MODELS.SUPERVISOR, MODELS.ARCHITECT, MODELS.EXECUTOR],
    ARCHITECT: [MODELS.ARCHITECT, MODELS.EXECUTOR],
    EXECUTOR: [MODELS.EXECUTOR, MODELS.ARCHITECT]
};

// ═══════════════════════════════════════════════════════════════
//  TOKEN ESTIMATION
// ═══════════════════════════════════════════════════════════════
export function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 3.5);
}

export function estimateMessagesTokens(msgs) {
    return msgs.reduce((sum, m) => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
        return sum + estimateTokens(content) + 4; // 4 tokens overhead per message
    }, 0);
}

// ═══════════════════════════════════════════════════════════════
//  TEXT TOOL CALL PARSER
// ═══════════════════════════════════════════════════════════════
export function parseTextToolCalls(content) {
    if (!content) return null;
    const toolCalls = [];

    // 1. Try standard tool calls
    if (content.includes('<|tool_call_begin|>')) {
        const regex = /<\|tool_call_begin\|>\s*functions\.([\w_]+):\d+\s*<\|tool_call_argument_begin\|>\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*<\|tool_call_end\|>/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
            try {
                toolCalls.push({
                    id: `txt_${Math.random().toString(36).substr(2, 9)}`,
                    type: "function",
                    function: { name: match[1], arguments: JSON.stringify(JSON.parse(match[2])) }
                });
            } catch (e) {
                console.log(chalk.red(`  ✗ Failed to parse text tool call: ${e.message}`));
            }
        }
    }

    // Markdown code block auto-write fallback removed to prevent accidental file deletion hallucinations.

    return toolCalls.length > 0 ? toolCalls : null;
}

// ═══════════════════════════════════════════════════════════════
//  TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════
export const tools = [
    {
        type: "function", function: {
            name: "read_file",
            description: "Read the contents of a file. Returns the full text content with line numbers.",
            parameters: {
                type: "object", properties: {
                    path: { type: "string", description: "Path to the file" },
                    start_line: { type: "integer", description: "Optional start line (1-indexed)" },
                    end_line: { type: "integer", description: "Optional end line (1-indexed, inclusive)" }
                }, required: ["path"]
            }
        }
    },
    {
        type: "function", function: {
            name: "write_file",
            description: "Write content to a file. Creates parent directories if needed.",
            parameters: {
                type: "object", properties: {
                    path: { type: "string", description: "Path to the file" },
                    content: { type: "string", description: "Content to write" }
                }, required: ["path", "content"]
            }
        }
    },
    {
        type: "function", function: {
            name: "patch_file",
            description: "Replace a specific line range in a file with new content. More precise than write_file for edits.",
            parameters: {
                type: "object", properties: {
                    path: { type: "string", description: "Path to the file" },
                    start_line: { type: "integer", description: "Starting line number (1-indexed)" },
                    end_line: { type: "integer", description: "Ending line number (1-indexed)" },
                    new_content: { type: "string", description: "The replacement content" },
                    original_content: { type: "string", description: "REQUIRED: The content currently at this range. The tool will verify it matches before patching." }
                }, required: ["path", "start_line", "end_line", "new_content", "original_content"]
            }
        }
    },
    {
        type: "function", function: {
            name: "list_dir",
            description: "List contents of a directory with file sizes and types",
            parameters: {
                type: "object", properties: {
                    path: { type: "string", description: "Path to the directory" }
                }, required: ["path"]
            }
        }
    },
    {
        type: "function", function: {
            name: "grep_search",
            description: "Search for a regex pattern in files within a directory. Returns matching lines with file paths and line numbers.",
            parameters: {
                type: "object", properties: {
                    path: { type: "string", description: "Path to search in" },
                    pattern: { type: "string", description: "Regex pattern to search for" },
                    include: { type: "string", description: "Optional glob to filter files (e.g. '*.tsx')" }
                }, required: ["path", "pattern"]
            }
        }
    },
    {
        type: "function", function: {
            name: "find_files",
            description: "Find files matching a glob pattern recursively",
            parameters: {
                type: "object", properties: {
                    path: { type: "string", description: "Root directory" },
                    pattern: { type: "string", description: "Glob pattern (e.g. *.kt)" }
                }, required: ["path", "pattern"]
            }
        }
    },
    {
        type: "function", function: {
            name: "run_command",
            description: "Run a shell command. Output is capped at 10KB. Timeout: 60s.",
            parameters: {
                type: "object", properties: {
                    command: { type: "string", description: "The command to run" },
                    cwd: { type: "string", description: "Working directory" }
                }, required: ["command"]
            }
        }
    },
    {
        type: "function", function: {
            name: "search_replace",
            description: "Find exact text in a file and replace it. Use for surgical, precise edits. Set replace_all to true to replace ALL occurrences.",
            parameters: {
                type: "object", properties: {
                    path: { type: "string", description: "Path to the file" },
                    search: { type: "string", description: "Exact text to find" },
                    replace: { type: "string", description: "Replacement text" },
                    replace_all: { type: "boolean", description: "If true, replace ALL occurrences (default: first only)" }
                }, required: ["path", "search", "replace"]
            }
        }
    },
    {
        type: "function", function: {
            name: "fetch_url",
            description: "Fetch content from a URL. Returns the response body text (HTML/JSON/text). Useful for reading docs, APIs, or web pages.",
            parameters: {
                type: "object", properties: {
                    url: { type: "string", description: "The URL to fetch" },
                    method: { type: "string", description: "HTTP method (GET/POST)", default: "GET" }
                }, required: ["url"]
            }
        }
    },
    {
        type: "function", function: {
            name: "update_memory",
            description: "Save important project patterns or knowledge to persistent memory",
            parameters: {
                type: "object", properties: {
                    content: { type: "string", description: "The project knowledge to remember" }
                }, required: ["content"]
            }
        }
    },
    {
        type: "function", function: {
            name: "verify_project",
            description: "Run linting or type-checking to ensure code quality",
            parameters: {
                type: "object", properties: {
                    command: { type: "string", description: "Command to run (e.g. 'npx tsc --noEmit')", default: "npm run lint" }
                }
            }
        }
    },
    {
        type: "function", function: {
            name: "search_web",
            description: "Search the web for technical information, documentation, or code solutions.",
            parameters: {
                type: "object", properties: {
                    query: { type: "string", description: "The search query" }
                }, required: ["query"]
            }
        }
    },
    {
        type: "function", function: {
            name: "view_file_outline",
            description: "Get a high-level outline of a file (classes, functions, exports) without reading the full content.",
            parameters: {
                type: "object", properties: {
                    path: { type: "string", description: "Path to the file" }
                }, required: ["path"]
            }
        }
    },
    {
        type: "function", function: {
            name: "get_diff",
            description: "Get the git diff for a specific file or the whole workspace. Useful to verify exactly what changed.",
            parameters: {
                type: "object", properties: {
                    path: { type: "string", description: "Path to the file (optional, leave empty for workspace diff)" }
                }
            }
        }
    },
    {
        type: "function", function: {
            name: "update_task_status",
            description: "Mark a specific task in the active checklist as completed or failed.",
            parameters: {
                type: "object", properties: {
                    path: { type: "string", description: "The exact file path of the task in the checklist" },
                    status: { type: "string", enum: ["completed", "failed"], description: "The new status" }
                }, required: ["path", "status"]
            }
        }
    },
    {
        type: "function", function: {
            name: "trace_imports",
            description: "Trace the import/export dependency graph for a file. Shows what it imports and what files import it.",
            parameters: {
                type: "object", properties: {
                    path: { type: "string", description: "Path to the file to trace" },
                    root: { type: "string", description: "Project root directory to search importers" }
                }, required: ["path"]
            }
        }
    },
    {
        type: "function", function: {
            name: "preview_patch",
            description: "Preview what a patch_file operation would look like BEFORE applying it. Shows a unified diff.",
            parameters: {
                type: "object", properties: {
                    path: { type: "string", description: "Path to the file" },
                    start_line: { type: "integer", description: "Starting line number (1-indexed)" },
                    end_line: { type: "integer", description: "Ending line number (1-indexed)" },
                    new_content: { type: "string", description: "The proposed replacement content" }
                }, required: ["path", "start_line", "end_line", "new_content"]
            }
        }
    },
    {
        type: "function", function: {
            name: "begin_transaction",
            description: "Start an atomic multi-file transaction. All file changes until commit_transaction can be rolled back together.",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function", function: {
            name: "commit_transaction",
            description: "Commit the current multi-file transaction, making all changes permanent.",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function", function: {
            name: "rollback_transaction",
            description: "Rollback the current transaction, reverting ALL file changes made since begin_transaction.",
            parameters: { type: "object", properties: {} }
        }
    }
];

// ═══════════════════════════════════════════════════════════════
//  SYNTAX VALIDATION
// ═══════════════════════════════════════════════════════════════
async function checkSyntax(filePath) {
    if (!filePath.endsWith('.js') && !filePath.endsWith('.ts') && !filePath.endsWith('.tsx') && !filePath.endsWith('.jsx')) {
        return { valid: true };
    }
    try {
        // A quick syntax check using node for JS files
        if (filePath.endsWith('.js')) {
            await execAsync(`node --check "${filePath}"`, { timeout: 10000 });
        }
        // Could expand to tsc or eslint here if desired
        return { valid: true };
    } catch (e) {
        let errorOutput = e.stderr || e.message;
        try {
            const match = errorOutput.match(/:(\d+)(?:\n|:)/);
            if (match && match[1]) {
                const lineNum = parseInt(match[1], 10);
                const content = await fs.readFile(filePath, 'utf8');
                const lines = content.split('\n');
                const start = Math.max(0, lineNum - 5);
                const end = Math.min(lines.length, lineNum + 5);
                const context = lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join('\n');
                errorOutput += `\n\nContext around error:\n${context}`;
            }
        } catch { }
        return { valid: false, error: errorOutput };
    }
}

// ═══════════════════════════════════════════════════════════════
//  GIT CHECKPOINT
// ═══════════════════════════════════════════════════════════════
export const changeLog = [];

async function gitCheckpoint(filePath, action) {
    try {
        const content = await fs.readFile(filePath, 'utf8').catch(() => null);
        changeLog.push({ path: filePath, action, timestamp: Date.now(), previousContent: content });
        if (changeLog.length > 50) changeLog.shift();
    } catch { /* ignore */ }
}

export async function undoLastChange() {
    const last = changeLog.pop();
    if (!last) return "No changes to undo.";
    if (last.previousContent !== null) {
        await fs.writeFile(last.path, last.previousContent, 'utf8');
        return `Reverted ${last.action} on ${last.path}`;
    }
    try {
        await fs.unlink(last.path);
        return `Deleted newly created file ${last.path}`;
    } catch {
        return `Could not undo ${last.action} on ${last.path}`;
    }
}

// ═══════════════════════════════════════════════════════════════
//  GLOB MATCHING (lightweight, no npm dependency)
// ═══════════════════════════════════════════════════════════════
function globMatch(filename, pattern) {
    // Convert glob pattern to regex
    // Supports: *, **, ?, [abc], {a,b}
    const regexStr = pattern
        .replace(/\./g, '\\.')           // escape dots
        .replace(/\*\*/g, '{{GLOBSTAR}}')  // temp placeholder
        .replace(/\*/g, '[^/]*')         // * = anything except /
        .replace(/\?/g, '[^/]')          // ? = single char
        .replace(/\{\{GLOBSTAR\}\}/g, '.*') // ** = anything including /
        .replace(/\{([^}]+)\}/g, (_, alts) => `(${alts.split(',').join('|')})`); // {a,b} = (a|b)
    try {
        return new RegExp(`^${regexStr}$`, 'i').test(filename);
    } catch {
        // Fallback: simple includes check
        return filename.toLowerCase().includes(pattern.replace(/\*/g, '').toLowerCase());
    }
}

// ═══════════════════════════════════════════════════════════════
//  DISPLAY CONFIG — compact by default, Ctrl+O to expand
// ═══════════════════════════════════════════════════════════════
export const displayConfig = {
    verbose: false,          // false = compact (default), true = show all detail lines
    lastFullOutput: [],      // buffer of detail lines from last tool call for Ctrl+O reveal
};

// ═══════════════════════════════════════════════════════════════
//  TOOL HANDLER
// ═══════════════════════════════════════════════════════════════
const toolIcons = {
    read_file: '📖', write_file: '✏️', patch_file: '🩹', list_dir: '📂', view_file_outline: '📜',
    grep_search: '🔍', find_files: '🗂️', run_command: '⚙️', search_replace: '🔧',
    fetch_url: '🌐', search_web: '🔍🌐', update_memory: '🧠', verify_project: '✅',
    get_diff: '📝', update_task_status: '📋', trace_imports: '🔗', preview_patch: '👁️',
    begin_transaction: '🔒', commit_transaction: '✅🔒', rollback_transaction: '↩️🔒'
};

function capOutput(text, max = MAX_OUTPUT_BYTES) {
    if (text.length <= max) return text;
    const half = Math.floor(max / 2);
    return text.slice(0, half) + `\n\n... [output truncated, ${text.length - max} bytes hidden] ...\n\n` + text.slice(-half);
}

/** Print a detail line — only shown in verbose mode, otherwise buffered */
function detail(line) {
    displayConfig.lastFullOutput.push(line);
    if (displayConfig.verbose) console.log(line);
}

export async function handleToolCall(toolCall, memoryFns) {
    const { name, arguments: argsString } = toolCall.function;
    const args = JSON.parse(argsString);
    spinner.stop();

    const icon = toolIcons[name] || '🔹';
    const argSummary = {
        read_file: args.path, write_file: args.path, patch_file: `${args.path}:${args.start_line}-${args.end_line}`,
        list_dir: args.path, view_file_outline: args.path, grep_search: `"${args.pattern}" in ${args.path}`, find_files: `${args.pattern} in ${args.path}`,
        run_command: args.command, search_replace: args.path, fetch_url: args.url, search_web: args.query,
        update_memory: '(saving knowledge)', verify_project: args.command || 'npm run lint',
        get_diff: args.path || 'workspace', update_task_status: `${args.path} -> ${args.status}`,
        trace_imports: args.path, preview_patch: `${args.path}:${args.start_line}-${args.end_line}`,
        begin_transaction: '(starting)', commit_transaction: '(committing)', rollback_transaction: '(reverting)'
    }[name] || '';

    displayConfig.lastFullOutput = [];
    console.log(chalk.cyan.bold(`\n${icon}  ${name}`) + chalk.gray(` → ${argSummary}`));
    if (displayConfig.verbose) console.log(chalk.gray('─'.repeat(60)));

    let resultMsg = null;
    try {
        // ─── read_file ─── (uses cache)
        if (name === "read_file") {
            const absPath = validatePath(args.path);
            const content = await cachedReadFile(absPath);
            const lines = content.split('\n');
            const start = (args.start_line || 1) - 1;
            const end = args.end_line || lines.length;
            const slice = lines.slice(start, end);
            const numbered = slice.map((l, i) => `${start + i + 1}: ${l}`).join('\n');
            console.log(chalk.green(`  ✓ Read ${slice.length} lines (${start + 1}-${end})`));
            slice.slice(0, 5).forEach((l, i) => detail(chalk.gray(`  ${start + i + 1}: ${l}`)));
            if (slice.length > 5) detail(chalk.gray(`  ... +${slice.length - 5} more lines`));
            // Flag to SKIP compression — full content stays in context (compactContext handles token pressure)
            resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: numbered, _skipCompress: true };
            // Hint for very large files — help model avoid re-reading
            if (lines.length > 800 && !args.start_line) {
                resultMsg.content += `\n\n[NOTE: This file has ${lines.length} lines. You now have the full content. Do NOT re-read it in chunks. Use the line numbers above to target your edits with search_replace.]`;
            }
        }
        // ─── view_file_outline ─── (uses cache)
        else if (name === "view_file_outline") {
            const absPath = validatePath(args.path);
            const content = await cachedReadFile(absPath);
            const lines = content.split('\n');
            const outline = [];
            const patternDefs = [
                { type: 'class', src: '(class|interface|type)\\s+([A-Z][\\w<>]+)' },
                { type: 'fn', src: '(function|const|let|async)\\s+([\\w_]+)\\s*=?\\s*\\(.*?\\)\\s*(=>|\\{)' },
                { type: 'export', src: 'export\\s+(const|function|class|default)\\s+([\\w_]+)' },
                { type: 'kt-fun', src: 'fun\\s+([\\w_]+)' },
                { type: 'kt-class', src: 'class\\s+([\\w_]+)' }
            ];
            lines.forEach((line, i) => {
                const trimmed = line.trim();
                for (const p of patternDefs) {
                    const regex = new RegExp(p.src, 'g');
                    let match;
                    while ((match = regex.exec(trimmed)) !== null) {
                        outline.push(`${(i + 1).toString().padStart(4)} | [${p.type}] ${match[0].slice(0, 60)}`);
                    }
                }
            });
            const result = outline.length > 0 ? outline.join('\n') : "No classes or functions detected with basic patterns.";
            console.log(chalk.green(`  ✓ Outline generated (${outline.length} items)`));
            resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: result };
        }
        // ─── write_file ───
        else if (name === "write_file") {
            const absPath = validatePath(args.path);
            const originalContent = await fs.readFile(absPath, 'utf8').catch(() => null);
            await recordInTransaction(absPath);
            await gitCheckpoint(absPath, 'write_file');
            const dir = path.dirname(absPath);
            await fs.mkdir(dir, { recursive: true });
            const lines = args.content.split('\n');
            await fs.writeFile(absPath, args.content, 'utf8');

            const syntax = await checkSyntax(absPath);
            if (!syntax.valid) {
                console.log(chalk.red(`  ✗ write_file failed syntax check: reverting.`));
                if (originalContent !== null) await fs.writeFile(absPath, originalContent, 'utf8');
                else await fs.unlink(absPath);
                resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: `Syntax Error detected after write. Change reverted. Fix this error:\n${syntax.error}` };
            } else {
                console.log(chalk.green(`  ✓ Wrote ${lines.length} lines → ${args.path}`));
                invalidateCache(absPath);
                resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: "File written successfully" };
            }
        }
        // ─── patch_file ───
        else if (name === "patch_file") {
            const absPath = validatePath(args.path);
            if (!fileCache.has(absPath)) {
                // Auto-read if not in cache to save a turn
                await cachedReadFile(absPath);
            }
            if (!args.original_content) {
                return { role: "tool", tool_call_id: toolCall.id, name, content: "Error: You must provide original_content to use patch_file." };
            }
            await recordInTransaction(absPath);
            await gitCheckpoint(absPath, 'patch_file');
            const content = await fs.readFile(absPath, 'utf8');
            const lines = content.split('\n');

            const targetRange = lines.slice(args.start_line - 1, args.end_line).join('\n');
            if (targetRange.trim() !== args.original_content.trim()) {
                console.log(chalk.red(`  ✗ Patch failed: Content mismatch at ${args.path}`));
                return { role: "tool", tool_call_id: toolCall.id, name, content: `Error: Content at lines ${args.start_line}-${args.end_line} does not match original_content. Please re-read the file.` };
            }

            const before = lines.slice(0, args.start_line - 1);
            const after = lines.slice(args.end_line);
            const newLines = args.new_content.split('\n');
            const patched = [...before, ...newLines, ...after].join('\n');
            await fs.writeFile(absPath, patched, 'utf8');

            const syntax = await checkSyntax(absPath);
            if (!syntax.valid) {
                console.log(chalk.red(`  ✗ patch_file failed syntax check: reverting.`));
                await fs.writeFile(absPath, content, 'utf8');
                resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: `Syntax Error detected after patch. Change reverted. Fix this error:\n${syntax.error}` };
            } else {
                console.log(chalk.green(`  ✓ Patched lines ${args.start_line}-${args.end_line} → ${newLines.length} new lines`));
                invalidateCache(absPath);
                resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: `Patched ${args.path}: replaced lines ${args.start_line}-${args.end_line} with ${newLines.length} lines` };
            }
        }
        // ─── list_dir ───
        else if (name === "list_dir") {
            const absPath = validatePath(args.path);
            const entries = await fs.readdir(absPath, { withFileTypes: true });
            const details = [];
            for (const e of entries) {
                try {
                    const stat = await fs.stat(path.join(absPath, e.name));
                    const size = e.isDirectory() ? '' : ` (${(stat.size / 1024).toFixed(1)}KB)`;
                    const prefix = e.isDirectory() ? '📁' : '📄';
                    details.push(`${prefix} ${e.name}${size}`);
                } catch { details.push(`❓ ${e.name}`); }
            }
            console.log(chalk.green(`  ✓ ${details.length} items`));
            resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: details.join('\n') };
        }
        // ─── grep_search ─── (cross-platform, no git dependency)
        else if (name === "grep_search") {
            const absPath = validatePath(args.path);
            const GREP_EXCLUDES = ['node_modules', '.git', 'android/build', 'ios/build', '.gradle', '.expo', 'android_backup'];
            const includeGlob = args.include || null; // e.g. '*.tsx'
            let regex;
            try { regex = new RegExp(args.pattern, 'gi'); } catch (e) {
                return { role: "tool", tool_call_id: toolCall.id, name, content: `Error: Invalid regex: ${e.message}` };
            }
            const matches = [];
            const MAX_MATCHES = 60;

            async function grepDir(dir, depth = 0) {
                if (depth > 10 || matches.length >= MAX_MATCHES) return;
                let entries;
                try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
                for (const entry of entries) {
                    if (matches.length >= MAX_MATCHES) break;
                    if (GREP_EXCLUDES.some(ex => entry.name === ex)) continue;
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        await grepDir(fullPath, depth + 1);
                    } else if (entry.isFile()) {
                        if (includeGlob && !globMatch(entry.name, includeGlob)) continue;
                        // Skip binary/large files
                        try {
                            const stat = await fs.stat(fullPath);
                            if (stat.size > 512 * 1024) continue; // skip files > 512KB
                        } catch { continue; }
                        try {
                            const content = await fs.readFile(fullPath, 'utf8');
                            const lines = content.split('\n');
                            for (let i = 0; i < lines.length && matches.length < MAX_MATCHES; i++) {
                                regex.lastIndex = 0;
                                if (regex.test(lines[i])) {
                                    const relPath = path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/');
                                    matches.push(`${relPath}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
                                }
                            }
                        } catch { /* skip unreadable files */ }
                    }
                }
            }
            await grepDir(absPath);
            const output = matches.length > 0 ? matches.join('\n') : 'No matches found';
            console.log(chalk.green(`  ✓ ${matches.length} match${matches.length === 1 ? '' : 'es'}`));
            if (matches.length >= MAX_MATCHES) console.log(chalk.yellow(`  ⚠ Results capped at ${MAX_MATCHES}`));
            resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: output };
        }
        // ─── find_files ─── (cross-platform, Node.js native)
        else if (name === "find_files") {
            const absPath = validatePath(args.path);
            const FIND_EXCLUDES = ['node_modules', '.git', 'android/build', 'ios/build', '.gradle', '.expo', 'android_backup'];
            const results = [];
            const MAX_RESULTS = 80;

            async function findInDir(dir, depth = 0) {
                if (depth > 12 || results.length >= MAX_RESULTS) return;
                let entries;
                try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
                for (const entry of entries) {
                    if (results.length >= MAX_RESULTS) break;
                    if (FIND_EXCLUDES.some(ex => entry.name === ex)) continue;
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        await findInDir(fullPath, depth + 1);
                    } else if (entry.isFile()) {
                        if (globMatch(entry.name, args.pattern) || globMatch(path.relative(absPath, fullPath).replace(/\\/g, '/'), args.pattern)) {
                            results.push(path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/'));
                        }
                    }
                }
            }
            await findInDir(absPath);
            const output = results.length > 0 ? results.join('\n') : 'No files found';
            console.log(chalk.green(`  ✓ ${results.length} file${results.length === 1 ? '' : 's'} found`));
            resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: output };
        }
        // ─── run_command ───
        else if (name === "run_command") {
            if (args.cwd) validatePath(args.cwd);
            const DESTRUCTIVE_PATTERNS = [/\brm\s+(-[rf]+\s+|.*--no-preserve-root)/i, /\bdel\s+\/[sfq]/i, /\brmdir\s+\/s/i, /\bgit\s+(reset\s+--hard|clean\s+-fd)/i, /\bformat\s+[a-z]:/i, /\bdrop\s+(table|database)\b/i];
            if (DESTRUCTIVE_PATTERNS.some(p => p.test(args.command))) {
                return { role: "tool", tool_call_id: toolCall.id, name, content: `Error: Command blocked: destructive pattern detected.` };
            }
            const start = Date.now();
            const { stdout, stderr } = await execAsync(args.command, {
                cwd: args.cwd ? validatePath(args.cwd) : PROJECT_ROOT, maxBuffer: MAX_OUTPUT_BYTES, timeout: COMMAND_TIMEOUT_MS
            });
            const elapsed = ((Date.now() - start) / 1000).toFixed(1);
            console.log(chalk.green(`  ✓ Completed in ${elapsed}s`));
            resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: stdout + (stderr ? `\nSTDERR:\n${stderr}` : "") };
        }
        // ─── search_replace ───
        else if (name === "search_replace") {
            const absPath = validatePath(args.path);
            if (!fileCache.has(absPath)) {
                // Auto-read if not in cache
                await cachedReadFile(absPath);
            }
            await recordInTransaction(absPath);
            await gitCheckpoint(absPath, 'search_replace');
            const content = await fs.readFile(absPath, 'utf8');
            if (!content.includes(args.search)) {
                return { role: "tool", tool_call_id: toolCall.id, name, content: "Error: Search string not found." };
            }
            const updated = args.replace_all ? content.replaceAll(args.search, args.replace) : content.replace(args.search, args.replace);
            await fs.writeFile(absPath, updated, 'utf8');
            const syntax = await checkSyntax(absPath);
            if (!syntax.valid) {
                console.log(chalk.red(`  ✗ search_replace syntax fail: reverting.`));
                await fs.writeFile(absPath, content, 'utf8');
                resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: `Syntax Error: ${syntax.error}` };
            } else {
                console.log(chalk.green(`  ✓ Patched ${args.path}`));
                invalidateCache(absPath);
                resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: `Successfully replaced text` };
            }
        }
        // ─── fetch_url ───
        else if (name === "fetch_url") {
            const resp = await axios.get(args.url, { timeout: 15000, responseType: 'text' });
            resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: String(resp.data) };
        }
        // ─── search_web ───
        else if (name === "search_web") {
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`;
            const resp = await axios.get(searchUrl, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
            const results = resp.data.match(/<a class="result__a" href="([^"]+)">([^<]+)<\/a>/g) || [];
            const formatted = results.slice(0, 5).map(r => {
                const m = r.match(/href="([^"]+)">([^<]+)<\/a>/);
                return `- ${m[2]}: ${m[1]}`;
            }).join('\n');
            resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: formatted || "No results found." };
        }
        // ─── update_memory ───
        else if (name === "update_memory") {
            const current = await memoryFns.load();
            await memoryFns.save(current + "\n- " + args.content);
            console.log(chalk.green(`  ✓ Memory updated`));
            resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: "Memory updated successfully" };
        }
        // ─── verify_project ───
        else if (name === "verify_project") {
            const cmd = args.command || "npm run lint";
            const { stdout, stderr } = await execAsync(cmd, { maxBuffer: MAX_OUTPUT_BYTES, timeout: COMMAND_TIMEOUT_MS });
            resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: stdout + (stderr ? `\n${stderr}` : "") };
        }
        // ─── get_diff ───
        else if (name === "get_diff") {
            if (args.path) validatePath(args.path);
            const cmd = args.path ? `git diff -- "${args.path}"` : `git diff`;
            const { stdout } = await execAsync(cmd, { maxBuffer: MAX_OUTPUT_BYTES, timeout: COMMAND_TIMEOUT_MS });
            resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: stdout || "No diff found" };
        }
        // ─── update_task_status ───
        else if (name === "update_task_status") {
            if (memoryFns.updateTaskStatus) {
                const result = memoryFns.updateTaskStatus(args.path, args.status);
                resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: result ? `Task ${args.path} updated` : `Task not found` };
            } else resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: `Not supported` };
        }
        // ─── trace_imports ───
        else if (name === "trace_imports") {
            const absPath = validatePath(args.path);
            const content = await cachedReadFile(absPath);
            const basename = path.basename(absPath).replace(/\.[^.]+$/, '');
            const importLines = content.split('\n').filter(l => /^\s*(import|from|require)/.test(l));
            const exports = content.split('\n').filter(l => /^\s*export/.test(l));
            let importers = [];
            try {
                const relativePath = path.relative(PROJECT_ROOT, absPath).replace(/\\/g, '/').replace(/\.[^.]+$/, '');
                const searchPattern = `(from|require)['"]\\.?\\.?\\/.*${basename}['"]`;
                const { stdout } = await execAsync(`git grep -rlE --no-color "${searchPattern}" -- "${PROJECT_ROOT}" -- "*.ts" "*.tsx" "*.js" "*.jsx"`, { maxBuffer: MAX_OUTPUT_BYTES, timeout: COMMAND_TIMEOUT_MS });
                importers = stdout.trim().split('\n').filter(Boolean).filter(f => path.resolve(f) !== absPath);
            } catch {
                // Fallback to simple grep if regex fails or no matches
                try {
                    const { stdout } = await execAsync(`git grep -rl --no-color "${basename}" -- "${PROJECT_ROOT}" -- "*.ts" "*.tsx" "*.js" "*.jsx"`, { maxBuffer: MAX_OUTPUT_BYTES, timeout: COMMAND_TIMEOUT_MS });
                    importers = stdout.trim().split('\n').filter(Boolean).filter(f => path.resolve(f) !== absPath);
                } catch { }
            }
            const res = [`IMPORTS:\n${importLines.join('\n')}`, `EXPORTS:\n${exports.join('\n')}`, `IMPORTED BY:\n${importers.join('\n')}`].join('\n\n');
            resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: res };
        }
        // ─── preview_patch ───
        else if (name === "preview_patch") {
            const absPath = validatePath(args.path);
            const content = await cachedReadFile(absPath);
            const lines = content.split('\n');
            const oldLines = lines.slice(args.start_line - 1, args.end_line);
            const newLines = args.new_content.split('\n');
            const diff = [`--- ${args.path}`, `+++ ${args.path}`, ...oldLines.map(l => `- ${l}`), ...newLines.map(l => `+ ${l}`)].join('\n');
            resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: diff };
        }
        // ─── Transactions ───
        else if (name === "begin_transaction") {
            beginTransaction();
            resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: "Transaction started" };
        }
        else if (name === "commit_transaction") {
            const res = await commitTransaction();
            resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: res };
        }
        else if (name === "rollback_transaction") {
            const res = await rollbackTransaction();
            resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: res };
        }

        if (!resultMsg) resultMsg = { role: "tool", tool_call_id: toolCall.id, name, content: "Error: Unknown tool" };

        // ─── Post-execution: Metrics & Compression ───
        const isError = resultMsg.content?.startsWith('Error:');
        costTracker.trackTool(!isError);

        // Skip compression for read_file (content must stay intact to prevent re-reads)
        if (resultMsg._skipCompress) {
            delete resultMsg._skipCompress;
            return resultMsg;
        }

        if (resultMsg.content && resultMsg.content.length > SUMMARIZE_THRESHOLD) {
            const contentLen = resultMsg.content.length;
            console.log(chalk.gray(`  Compressing large tool output (${(contentLen / 1024).toFixed(1)}KB)...`));

            // Smart truncation: deterministic for known tool types (no API call needed)
            const isFileRead = ['read_file', 'view_file_outline', 'trace_imports'].includes(name);
            const isDirList = ['list_dir', 'find_files', 'grep_search'].includes(name);

            if (isFileRead || isDirList) {
                // Deterministic cap — keep head and tail, no model call
                resultMsg.content = capOutput(resultMsg.content);
            } else if (contentLen > MAX_OUTPUT_BYTES) {
                // Only use model summarization for truly complex outputs (run_command, etc.)
                // Use the cheaper TRIAGE/SUPERVISOR model, not the expensive EXECUTOR
                try {
                    const summary = await callModel(MODELS.TRIAGE, [
                        { role: "system", content: "Summarize this tool output concisely. Focus on error messages, relevant content, and results. Keep it under 2KB." },
                        { role: "user", content: resultMsg.content.slice(0, MAX_OUTPUT_BYTES) }
                    ], { maxTokens: 1024 });
                    resultMsg.content = `[SUMMARIZED]\n${summary.content}\n\n[Original: ${contentLen} chars]`;
                } catch {
                    resultMsg.content = capOutput(resultMsg.content);
                }
            } else {
                resultMsg.content = capOutput(resultMsg.content);
            }
        }
        return resultMsg;
    } catch (err) {
        console.log(chalk.red(`  ✗ ${err.message}`));
        costTracker.trackTool(false);
        return { role: "tool", tool_call_id: toolCall.id, name, content: `Error: ${err.message}` };
    }
}

// ═══════════════════════════════════════════════════════════════
//  MODEL CALLING — STREAMING
// ═══════════════════════════════════════════════════════════════
export async function callModelStream(model, messages, { maxTokens = 4096, extraBody = {}, timeout = FINAL_TIMEOUT_MS } = {}) {
    const label = model.split('/')[1];
    spinner.start(chalk.gray(`${label} Thinking...`));
    const response = await axios.post(invokeUrl, {
        model, messages, stream: true,
        temperature: 0.1, // Lower temperature globally for stability in specialized models
        top_p: 0.95, max_tokens: maxTokens, ...extraBody
    }, {
        headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json", "Accept": "text/event-stream" },
        responseType: 'stream', timeout
    });
    spinner.stop();

    return new Promise((resolve, reject) => {
        let fullContent = '';
        let reasoningContent = '';
        let toolCalls = [];
        let currentToolCall = null;
        let firstToken = true;

        response.data.on('data', (chunk) => {
            const lines = chunk.toString().split('\n').filter(l => l.startsWith('data: '));
            for (const line of lines) {
                const raw = line.slice(6).trim();
                if (raw === '[DONE]') continue;
                try {
                    const parsed = JSON.parse(raw);
                    const delta = parsed.choices?.[0]?.delta;
                    if (!delta) continue;

                    // Stream text content
                    if (delta.content) {
                        if (firstToken) {
                            spinner.text = chalk.cyan(`${label} is Thinking...`);
                            process.stdout.write('\n');
                            firstToken = false;
                        }
                        process.stdout.write(delta.content);
                        fullContent += delta.content;
                    }

                    // Capture reasoning/thinking content if present
                    if (delta.reasoning_content || delta.reasoning) {
                        if (firstToken) {
                            spinner.text = chalk.cyan(`${label} is Thinking...`);
                            firstToken = false;
                        }
                        const r = delta.reasoning_content || delta.reasoning;
                        reasoningContent += r;
                    }

                    // Accumulate tool calls
                    if (delta.tool_calls) {
                        for (const tc of delta.tool_calls) {
                            if (tc.id) {
                                currentToolCall = { id: tc.id, type: 'function', function: { name: tc.function?.name || '', arguments: '' } };
                                toolCalls.push(currentToolCall);
                            }
                            if (tc.function?.arguments && currentToolCall) {
                                currentToolCall.function.arguments += tc.function.arguments;
                            }
                        }
                    }
                } catch { /* skip malformed SSE lines */ }
            }
        });

        response.data.on('end', () => {
            if (fullContent) process.stdout.write('\n');

            // Track estimated tokens for streaming (no usage data available in SSE)
            const estInput = estimateMessagesTokens(messages);
            const estOutput = estimateTokens(fullContent || '') + estimateTokens(reasoningContent || '');
            costTracker.trackCall(estInput, estOutput);
            console.log(chalk.gray(`    [tokens] ~${estInput.toLocaleString()} in / ~${estOutput.toLocaleString()} out`));

            const msg = { role: 'assistant', content: fullContent || null };
            if (reasoningContent) msg.reasoning_content = reasoningContent;
            if (toolCalls.length > 0) msg.tool_calls = toolCalls;

            const hasContent = (fullContent && fullContent.trim().length > 0) || (reasoningContent && reasoningContent.trim().length > 0);
            const hasTools = toolCalls.length > 0;
            if (!hasContent && !hasTools) {
                reject(new Error(`${label} returned an empty response (stream completed with no content)`));
                return;
            }
            resolve(msg);
        });

        response.data.on('error', reject);
    });
}

// ═══════════════════════════════════════════════════════════════
//  MODEL CALLING — BATCH (fallback)
// ═══════════════════════════════════════════════════════════════
export async function callModel(model, messages, { maxTokens = 4096, extraBody = {}, timeout = FINAL_TIMEOUT_MS } = {}) {
    const label = model.split('/')[1];
    spinner.start(chalk.gray(`${label} Thinking...`));
    try {
        const response = await axios.post(invokeUrl, {
            model, messages,
            temperature: 0.1,
            top_p: 0.95, max_tokens: maxTokens, ...extraBody
        }, {
            headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
            timeout
        });
        spinner.stop();
        const msg = response.data?.choices?.[0]?.message;
        if (!msg) throw new Error(`${label} returned an empty response (no message in choices)`);

        // Token cost tracking
        const usage = response.data?.usage;
        if (usage) {
            costTracker.trackCall(usage.prompt_tokens || 0, usage.completion_tokens || 0);
        } else {
            // Estimate if no usage data
            costTracker.trackCall(estimateMessagesTokens(messages), estimateTokens(msg.content || ''));
        }

        // Capture reasoning content if present (NVIDIA/common APIs use reasoning_content or reasoning)
        const reasoning = msg.reasoning_content || msg.reasoning || '';
        const content = msg.content || '';

        // If content is truly empty but we have reasoning, use the last part of reasoning as a last resort fallback
        // This is useful for triage models that might focus too much on reasoning.
        if (!content.trim() && reasoning.trim()) {
            msg.content = reasoning; // Fallback so triage can find the word
        }

        const hasContent = msg.content && msg.content.trim().length > 0;
        const hasTools = msg.tool_calls && msg.tool_calls.length > 0;

        if (!hasContent && !hasTools) {
            // Log the full response object for debugging
            detail(chalk.red(`  [DEBUG] Empty response from ${label}`));
            detail(chalk.red(`  [DEBUG] Response Body: ${JSON.stringify(response.data).slice(0, 500)}`));
            throw new Error(`${label} returned an empty response (no content, no tools)`);
        }
        return msg;
    } catch (err) { spinner.stop(); throw err; }
}

// ═══════════════════════════════════════════════════════════════
//  ERROR DETECTION & FALLBACK
// ═══════════════════════════════════════════════════════════════

/** Returns true if error is worth retrying on the SAME model (server busy, rate-limited) */
function isBusyError(err) {
    return err.code === 'ECONNABORTED'
        || err.code === 'ECONNRESET'
        || err.code === 'ETIMEDOUT'
        || err.code === 'ENOTFOUND'
        || err.code === 'EAI_AGAIN'
        || err.response?.status === 429
        || err.response?.status === 503
        || err.response?.status === 504;
}

/** Returns true if the model gave an empty/useless response — skip to next model immediately */
function isEmptyResponseError(err) {
    return err.message?.includes('empty response');
}

export function isRetriableError(err) {
    return isBusyError(err) || isEmptyResponseError(err);
}

function getErrorReason(err) {
    if (err.code === 'ECONNABORTED') return 'timeout';
    if (err.code === 'ECONNRESET') return 'connection reset';
    if (err.code === 'ETIMEDOUT') return 'connection timed out';
    if (err.code === 'ENOTFOUND') return 'DNS not found';
    if (err.code === 'EAI_AGAIN') return 'DNS temporary failure';
    if (err.response?.status) return `HTTP ${err.response.status}`;
    if (err.message?.includes('empty response')) return 'empty response';
    return err.message?.slice(0, 60) || 'unknown error';
}

// Shared DNS failure tracking — if one role hits DNS failure, others skip retries
let lastDnsFailureTime = 0;
const DNS_FAILURE_COOLDOWN_MS = 60000; // 60s cooldown after DNS failure

export async function callModelWithFallback(role, messages, { maxTokens = 4096, extraBody = {}, stream = false, timeout = null } = {}) {
    const chain = FALLBACK_CHAINS[role] || [MODELS.EXECUTOR];
    let lastError = null;

    // If DNS failed recently, reduce retries aggressively
    const dnsRecentlyFailed = (Date.now() - lastDnsFailureTime) < DNS_FAILURE_COOLDOWN_MS;

    for (let i = 0; i < chain.length; i++) {
        const model = chain[i];
        const isLastModel = i === chain.length - 1;
        const label = model.split('/')[1];
        let retryCount = 0;
        // If DNS recently failed, only try once per model (no point retrying same dead endpoint)
        const maxRetries = dnsRecentlyFailed ? 1 : (isLastModel ? 5 : 3);
        // Use custom timeout if provided (e.g. planning uses shorter timeouts)
        const JUMP_TIMEOUT_MS = timeout || (isLastModel ? FINAL_TIMEOUT_MS : 180000);

        while (retryCount < maxRetries) {
            const startTime = Date.now();

            let timerInterval = null;
            const softTimer = setTimeout(() => {
                timerInterval = setInterval(() => {
                    const elapsed = Math.floor((Date.now() - startTime) / 1000);
                    spinner.text = chalk.yellow(`${label} is in queue... (${elapsed}s elapsed)`);
                }, 1000);
            }, QUEUE_DETECT_TIMEOUT_MS);

            try {
                const callFn = stream ? callModelStream : callModel;
                const result = await callFn(model, messages, { maxTokens, extraBody, timeout: JUMP_TIMEOUT_MS });
                clearTimeout(softTimer);
                if (timerInterval) clearInterval(timerInterval);
                return { model, result };
            } catch (err) {
                clearTimeout(softTimer);
                if (timerInterval) clearInterval(timerInterval);
                lastError = err;
                const reason = getErrorReason(err);

                // Empty response = this model is useless for this request, skip immediately
                if (isEmptyResponseError(err)) {
                    console.log(chalk.yellow(`\n  ▸ ${label} returned empty. ${isLastModel ? 'No more models.' : 'Trying next model...'}`));
                    break; // Skip to next model, don't retry
                }

                // Busy/timeout = worth retrying on same model
                if (isBusyError(err) && retryCount < maxRetries - 1) {
                    // Track DNS failures globally
                    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
                        lastDnsFailureTime = Date.now();
                    }
                    retryCount++;
                    const backoffMs = Math.min(2000 * Math.pow(2, retryCount), 30000);
                    console.log(chalk.gray(`\n  ▸ ${label} busy (${reason}). Retrying in ${backoffMs / 1000}s (${retryCount}/${maxRetries})...`));
                    await new Promise(r => setTimeout(r, backoffMs));
                    continue;
                }

                // Exhausted retries on non-last model → fall to next
                if (!isLastModel && isBusyError(err)) {
                    // Track DNS failures globally
                    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
                        lastDnsFailureTime = Date.now();
                    }
                    console.log(chalk.yellow(`\n⚠ ${label} unavailable after ${retryCount + 1} attempts (${reason}), next model...`));
                    break;
                }

                // Non-retriable or last model exhausted
                throw err;
            }
        }
    }
    throw lastError || new Error('All models in fallback chain failed');
}
