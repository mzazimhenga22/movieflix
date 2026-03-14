import chalk from 'chalk';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const TEST_DIR = path.join(process.cwd(), 'dummy_project');

const TEST_PROMPTS = [
    "/direct Execute this exact sequence of actions on the dummy_project strictly. Do not deviate. 1. trace_imports on dummy_project/user.js. 2. begin_transaction. 3. Edit dummy_project/db.js to rename getUser to fetchUserRecord. 4. Edit dummy_project/user.js, to make an INTENTIONAL syntax error on printUser by removing the closing brace }. 5. The syntax checker should catch your error and revert your patch. 6. Once reverted, successfully edit dummy_project/user.js to fix the import and the function call to use fetchUserRecord. 7. commit_transaction. 8. When done, output TEST_RUN_COMPLETE"
];

async function setupDummyProject() {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
    await fs.writeFile(path.join(TEST_DIR, 'db.js'), `export function connectDB() { console.log("DB"); }\nexport function getUser(id) { return { id, name: "Alice" }; }\n`);
    await fs.writeFile(path.join(TEST_DIR, 'user.js'), `import { getUser } from './db.js';\nexport function printUser(id) { const u = getUser(id); console.log(u); }\n`);
    await fs.writeFile(path.join(TEST_DIR, 'app.js'), `import { connectDB } from './db.js';\nimport { printUser } from './user.js';\nconnectDB();\nprintUser(1);\n`);
}

async function runTest() {
    console.log(chalk.blue('Starting Kimi Test Run... Setting up dummy project.'));
    await setupDummyProject();

    const kimi = spawn('node', ['kimi.js'], { stdio: ['pipe', 'pipe', 'inherit'] });
    let outputBuffer = '';

    // Send prompts one by one
    let promptIndex = 0;

    kimi.stdout.on('data', (data) => {
        const text = data.toString();
        process.stdout.write(text);
        outputBuffer += text;

        if (text.includes('❯')) {
            if (promptIndex < TEST_PROMPTS.length) {
                console.log(chalk.green(`\\n[Test Runner] Sending Prompt ${promptIndex + 1}`));
                kimi.stdin.write(TEST_PROMPTS[promptIndex] + '\\n');
                promptIndex++;
            }
        }

        if (text.includes('TEST_RUN_COMPLETE')) {
            console.log(chalk.green.bold('\\n[Test Runner] SUCCESS! Kimi finished the test.\\n'));
            kimi.kill();
            process.exit(0);
        }
    });

}

runTest().catch(console.error);
