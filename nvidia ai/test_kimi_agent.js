import chalk from 'chalk';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const TEST_DIR = path.join(process.cwd(), 'dummy_project');

const TEST_PROMPT = `
I need a complex refactor on the dummy_project folder.
Here is your plan, follow it strictly:
1. Use trace_imports on db.js and user.js to understand the dependency graph. 
2. Use begin_transaction.
3. In db.js, rename getUser to fetchUserRecord.
4. In user.js, INTENTIONALLY create a syntax error (e.g., leave off a closing bracket) on the printUser function to prove the auto-revert works. 
5. The system will catch your error and revert it.
6. Now successfully patch user.js: update the import and the function call to use fetchUserRecord instead of getUser.
7. Use commit_transaction.
8. Wait, also modify app.js to print "Starting App V2" at the top of main().
9. Use update_task_status to mark "Refactored db.js and user.js" as completed. (Even if checklist doesn't formally exist, pretend to call the tool to show it works).

Execute this in one go. At the very end, output exactly "TEST_RUN_COMPLETE" on its own line.
`;

async function runTest() {
    console.log(chalk.cyan.bold("Starting Kimi Performance & Capabilities Test..."));

    // Clear old memory/sessions to keep it clean
    await fs.rm('.kimi_memory', { force: true }).catch(() => { });
    await fs.rm('.kimi_sessions', { recursive: true, force: true }).catch(() => { });

    const child = spawn('node', ['kimi.js'], { stdio: ['pipe', 'pipe', 'pipe'] });

    let outputLog = "";

    // Feed the prompt
    setTimeout(() => {
        child.stdin.write(TEST_PROMPT + '\n\nEND\n');
    }, 2000); // give it time to boot

    child.stdout.on('data', (data) => {
        const text = data.toString();
        outputLog += text;
        process.stdout.write(text); // Print to terminal so we can watch

        if (text.includes("TEST_RUN_COMPLETE")) {
            console.log(chalk.green.bold("\n\nTest sequence finished! Killing agent..."));
            child.kill();
        }
    });

    child.stderr.on('data', (data) => {
        console.error(chalk.red(data.toString()));
    });

    child.on('close', (code) => {
        console.log(chalk.blue(`\nAgent exited with code ${code}`));
        analyzeResults(outputLog);
    });
}

function analyzeResults(log) {
    console.log(chalk.magenta.bold("\n--- TEST ANALYSIS ---"));

    const checks = [
        { name: "Dependency Trace used", verify: () => log.includes("trace_imports") && (log.includes("db.js") || log.includes("user.js")) },
        { name: "Transaction Started", verify: () => log.includes("begin_transaction") },
        { name: "Syntactic Error Revert Triggered", verify: () => log.includes("failed syntax check: reverting") || log.includes("Syntax Error detected") },
        { name: "Transaction Committed", verify: () => log.includes("commit_transaction") },
        { name: "Task Status Updating", verify: () => log.includes("update_task_status") },
    ];

    let passed = 0;
    checks.forEach(c => {
        const ok = c.verify();
        if (ok) passed++;
        console.log(`- ${c.name}: ${ok ? chalk.green("PASS") : chalk.red("FAIL")}`);
    });

    console.log(chalk.bold(`\nScore: ${passed}/${checks.length} features verified.`));
    if (passed === checks.length) {
        console.log(chalk.green.bold("All systems go! Kimi agent executed flawlessly."));
    } else {
        console.log(chalk.yellow.bold("Agent struggled with some instructions. Review logs."));
    }
}

runTest();
