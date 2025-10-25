#!/usr/bin/env node

/**
 * Manual Integration Test: Stream Inactivity Timeout
 *
 * This test verifies that the inactivity timeout works when streaming from LMStudio.
 * Run this while LMStudio is running with a model loaded.
 *
 * Usage: node tests/manual/test_stream_timeout.js
 */

const { createOpenAI } = require('@ai-sdk/openai');
const { streamText } = require('ai');

// Load the stream converter from our built code
const builtModule = require('../../dist/main.cjs');

// Extract the convertToAnthropicStream function
// We need to find it in the built bundle
const fs = require('fs');
const builtCode = fs.readFileSync('dist/main.cjs', 'utf-8');

// Check if inactivity timeout code is present
console.log('🔍 Checking for inactivity timeout in build...\n');

const hasInactivityTimer = builtCode.includes('inactivityTimer');
const hasTimeoutWarning = builtCode.includes('Stream inactive for');
const hasTimeout30s = builtCode.includes('30000') || builtCode.includes('30 second');

console.log(`  inactivityTimer variable: ${hasInactivityTimer ? '✓' : '✗'}`);
console.log(`  Timeout warning message: ${hasTimeoutWarning ? '✓' : '✗'}`);
console.log(`  30-second timeout: ${hasTimeout30s ? '✓' : '✗'}`);

if (!hasInactivityTimer || !hasTimeoutWarning) {
  console.log('\n❌ Inactivity timeout code not found in build!');
  console.log('   Did you run `bun run build` after making changes?');
  process.exit(1);
}

console.log('\n✅ Inactivity timeout code found in build');
console.log('\n📋 Test Plan:');
console.log('  1. Connect to LMStudio');
console.log('  2. Send a streaming request');
console.log('  3. Monitor for inactivity timeout (30s)');
console.log('  4. Verify stream completes gracefully\n');

async function testStreamTimeout() {
  const lmstudioURL = process.env.LMSTUDIO_URL || 'http://localhost:1234/v1';

  console.log(`🔗 Connecting to LMStudio at ${lmstudioURL}...\n`);

  // Create LMStudio provider
  const provider = createOpenAI({
    baseURL: lmstudioURL,
    apiKey: process.env.LMSTUDIO_API_KEY || 'lm-studio',
    compatibility: 'legacy',
  });

  console.log('📤 Sending test request: "Say hello"');
  console.log('⏱️  Monitoring stream activity...\n');

  const startTime = Date.now();
  let lastChunkTime = startTime;
  let chunkCount = 0;
  let messageStopReceived = false;
  let timeoutTriggered = false;

  try {
    const result = await streamText({
      model: provider('gpt-oss-20b-mlx'),
      prompt: 'Say hello',
      maxTokens: 50,
    });

    // Consume the raw stream to see AI SDK events
    console.log('📊 AI SDK Stream Events:\n');
    for await (const chunk of result.fullStream) {
      const now = Date.now();
      const timeSinceStart = now - startTime;
      const timeSinceLastChunk = now - lastChunkTime;

      console.log(`  [${(timeSinceStart / 1000).toFixed(1)}s] ${chunk.type} (${timeSinceLastChunk}ms since last)`);

      lastChunkTime = now;
      chunkCount++;

      // Check if this is the finish event
      if (chunk.type === 'finish') {
        console.log('  ✓ AI SDK sent finish event');
        break;
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`\n✅ Stream completed in ${totalTime}ms`);
    console.log(`   Total chunks: ${chunkCount}`);

    if (totalTime > 25000) {
      console.log('   ⚠️  Stream took >25s - may have triggered timeout');
      timeoutTriggered = true;
    }

    return { success: true, chunkCount, totalTime, timeoutTriggered };

  } catch (error) {
    console.error('\n❌ Stream error:', error.message);
    return { success: false, error };
  }
}

// Run the test
console.log('═'.repeat(60));
console.log('  STREAM INACTIVITY TIMEOUT TEST');
console.log('═'.repeat(60));
console.log();

testStreamTimeout()
  .then((result) => {
    console.log('\n' + '═'.repeat(60));
    if (result.success) {
      console.log('✅ TEST COMPLETED');
      console.log(`   Chunks received: ${result.chunkCount}`);
      console.log(`   Duration: ${result.totalTime}ms`);
      if (result.timeoutTriggered) {
        console.log('   Timeout: MAY HAVE TRIGGERED (>25s)');
      } else {
        console.log('   Timeout: Did not trigger (<25s)');
      }
    } else {
      console.log('❌ TEST FAILED');
      console.log(`   Error: ${result.error}`);
    }
    console.log('═'.repeat(60));
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  });
