import { extractReservationInfo } from './src/llm';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// .dev.varsを読み込む
dotenv.config({ path: '.dev.vars' });

const mockEnv = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
    SLACK_BOT_TOKEN: '',
    SLACK_SIGNING_SECRET: '',
    SLACK_NOTIFICATION_CHANNEL_ID: '',
    GOOGLE_CALENDAR_ID: '',
    GOOGLE_SERVICE_ACCOUNT_JSON: '',
};

async function runTests() {
    if (!mockEnv.OPENROUTER_API_KEY) {
        console.error('Error: OPENROUTER_API_KEY could not be loaded from .dev.vars');
        process.exit(1);
    }

    const examplesPath = path.join(process.cwd(), 'input_example.md');
    const content = fs.readFileSync(examplesPath, 'utf-8');
    // --- で分割し、空行を除去
    const examples = content.split('---').map(s => s.trim()).filter(s => s.length > 0);

    console.log(`Found ${examples.length} examples to test with model: tngtech/deepseek-r1t2-chimera:free\n`);

    for (let i = 0; i < examples.length; i++) {
        const example = examples[i];
        console.log(`=========================================`);
        console.log(`Example ${i + 1}:`);
        console.log(example);
        console.log(`-----------------------------------------`);

        try {
            const result = await extractReservationInfo(example, mockEnv);
            if (result) {
                console.log(`✅ Extracted Info:`);
                console.log(`   Purpose:   ${result.purpose}`);
                console.log(`   Organizer: ${result.organizer}`);
                console.log(`   Start:     ${result.startTime}`);
                console.log(`   End:       ${result.endTime}`);
            } else {
                console.log(`❌ Failed to extract info`);
            }
        } catch (error) {
            console.error('Error during extraction:', error);
        }
        console.log(`=========================================\n`);
    }
}

runTests();
