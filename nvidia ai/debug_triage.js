import chalk from 'chalk';
import { callModelWithFallback, displayConfig } from './engine.js';

displayConfig.verbose = true;

async function debugTriage() {
    const prompt = "Hello, how are you?";
    const triageMessages = [
        {
            role: "system",
            content: `Categorize the user's request into EXACTLY one of these categories:
- CHAT: Greetings, small talk, or general conversation.
- RESEARCH: Questions about the codebase, architecture, or technical research.
- PLAN: Implementation tasks, bug fixes, or new features requiring multiple steps.
- DIRECT: One-liner tool requests or explicit commands to skip planning.

EXAMPLES:
"Hello" -> CHAT
"How does the auth work?" -> RESEARCH
"Fix the button lag" -> PLAN
"run ls" -> DIRECT

Output ONLY the category word.`
        },
        { role: "user", content: `REQUEST: "${prompt}"\n\nCATEGORY:` }
    ];

    console.log(chalk.blue("Calling Model..."));
    const fb = await callModelWithFallback('TRIAGE', triageMessages, { maxTokens: 10 });
    console.log(chalk.yellow("\n--- RAW RESULT ---"));
    console.log(JSON.stringify(fb.result, null, 2));
    console.log(chalk.yellow("------------------"));
}

debugTriage();
