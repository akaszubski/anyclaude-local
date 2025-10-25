#!/usr/bin/env node
/**
 * Test what the AI SDK outputs when processing LMStudio's stream
 */

import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

async function testLMStudioStream() {
  console.log('Testing LMStudio stream via AI SDK...\n');

  const lmstudio = createOpenAI({
    apiKey: 'lm-studio',
    baseURL: 'http://localhost:1234/v1',
    compatibility: 'legacy',
  });

  try {
    const result = streamText({
      model: lmstudio('gpt-oss-20b-mlx'),
      messages: [{ role: 'user', content: '1+1=' }],
      maxTokens: 50,
    });

    console.log('Stream chunks from AI SDK:\n');
    let chunkNum = 0;

    for await (const chunk of result.fullStream) {
      chunkNum++;
      console.log(`Chunk ${chunkNum}:`, JSON.stringify(chunk, null, 2));

      if (chunkNum > 100) {
        console.log('\n...stopping after 100 chunks...');
        break;
      }
    }

    console.log('\n✓ Stream completed successfully');
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    throw error;
  }
}

testLMStudioStream().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
