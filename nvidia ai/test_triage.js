import chalk from 'chalk';
import { callModelWithFallback, displayConfig } from './engine.js';

displayConfig.verbose = true;

async function testTriage(prompt) {
    console.log(chalk.blue(`\nTesting Triage for: "${prompt}"`));
    try {
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

        const triageResults = await callModelWithFallback('TRIAGE', triageMessages, { maxTokens: 10 });

        let intent;
        const content = String(triageResults.result.content || '').toUpperCase();

        if (/\bDIRECT\b/.test(content)) intent = 'DIRECT';
        else if (/\bRESEARCH\b/.test(content)) intent = 'RESEARCH';
        else if (/\bCHAT\b/.test(content)) intent = 'CHAT';
        else if (/\bPLAN\b/.test(content)) intent = 'PLAN';
        else intent = 'PLAN';

        console.log(chalk.green(`Result: ${intent} (Model: ${triageResults.model})`));
        if (triageResults.result.reasoning_content) {
            console.log(chalk.gray(`Reasoning detected (${triageResults.result.reasoning_content.length} chars)`));
        }
        return intent;
    } catch (e) {
        console.error(chalk.red(`Triage Failed: ${e.message}`));
    }
}

async function runTests() {
    await testTriage("Hello, how are you?");
    await testTriage("Can you analyze the project structure and tell me how the state is managed?");
    await testTriage("I need to add a new feature that integrates a SQLite database for offline storage.");
    await testTriage("run npm run build");
    await testTriage("I am currently working on the MovieFlixNative project and I noticed that the SongList component is causing some performance issues on Android TV devices when scrolling through a large list of tracks, particularly because of how the LiquidGlass effect is being rendered; could you please analyze these two files and suggest a way to optimize the rendering logic or perhaps move some of the processing to a native Kotlin module similar to how we did it for the MoviesModule?");
}

runTests();
