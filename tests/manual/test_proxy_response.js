#!/usr/bin/env node
/**
 * Test the anyclaude proxy to see if it responds to requests
 */

import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

async function testProxy() {
  console.log('Starting anyclaude in proxy-only mode...\n');

  // Start proxy in background
  const proxy = spawn('anyclaude', [], {
    env: { ...process.env, PROXY_ONLY: 'true' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let proxyURL = null;

  // Capture proxy URL from stdout
  proxy.stdout.on('data', (data) => {
    const output = data.toString();
    console.log('[Proxy]', output.trim());

    const match = output.match(/LMStudio proxy: (http:\/\/[^\s]+)/);
    if (match) {
      proxyURL = match[1];
    }
  });

  proxy.stderr.on('data', (data) => {
    console.error('[Proxy Error]', data.toString().trim());
  });

  // Wait for proxy to start
  await sleep(2000);

  if (!proxyURL) {
    console.error('✗ Failed to get proxy URL from anyclaude');
    proxy.kill();
    process.exit(1);
  }

  console.log(`\n✓ Proxy started at: ${proxyURL}\n`);

  // Test the proxy with a simple request
  console.log('Sending test request: 1+1=\n');

  const startTime = Date.now();
  let responseReceived = false;
  let timedOut = false;

  // Set a 15 second timeout
  const timeout = setTimeout(() => {
    timedOut = true;
    console.log('\n✗ TIMEOUT after 15 seconds - proxy is hanging!\n');
    proxy.kill();
    process.exit(1);
  }, 15000);

  try {
    const response = await fetch(`${proxyURL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-key',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 50,
        messages: [{ role: 'user', content: '1+1=' }],
        stream: true,  // ← Request streaming!
      }),
    });

    clearTimeout(timeout);
    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      console.error(`✗ Request failed with status ${response.status}`);
      const text = await response.text();
      console.error('Response:', text);
      proxy.kill();
      process.exit(1);
    }

    console.log(`✓ Response received in ${elapsed}ms`);
    console.log(`  Content-Type: ${response.headers.get('content-type')}\n`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let chunks = 0;
    let gotMessageStop = false;
    let totalBytes = 0;
    let rawChunks = 0;

    while (true) {
      const { done, value } = await reader.read();
      rawChunks++;

      if (done) {
        console.log(`\nStream ended (done=true) after ${rawChunks} raw chunks, ${totalBytes} bytes\n`);
        break;
      }

      totalBytes += value.length;
      const text = decoder.decode(value);

      console.log(`[Raw chunk ${rawChunks}] ${value.length} bytes: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);

      const lines = text.split('\n').filter(line => line.trim());

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          chunks++;
          const data = line.slice(6);

          // Parse and check for message_stop
          try {
            const json = JSON.parse(data);
            if (json.type === 'message_stop') {
              gotMessageStop = true;
            }

            // Show more detail for certain chunk types
            let detail = '';
            if (json.type === 'content_block_start') {
              detail = ` (block_type="${json.content_block?.type}")`;
            } else if (json.type === 'content_block_delta') {
              detail = ` (text="${json.delta?.text?.substring(0, 20)}...")`;
            } else if (json.type === 'message_delta') {
              detail = ` (stop_reason="${json.delta?.stop_reason}")`;
            }

            console.log(`  → [SSE Chunk ${chunks}] type="${json.type}"${detail}`);
          } catch (e) {
            console.log(`  → [SSE Chunk ${chunks}] (parse error: ${e.message})`);
          }
        }
      }
    }

    console.log(`\n✓ Stream completed with ${chunks} chunks`);

    if (gotMessageStop) {
      console.log('✓ Got message_stop event\n');
      console.log('SUCCESS! Proxy is working correctly.\n');
      proxy.kill();
      process.exit(0);
    } else {
      console.log('✗ Never received message_stop event\n');
      console.log('FAILURE! Stream incomplete.\n');
      proxy.kill();
      process.exit(1);
    }

  } catch (error) {
    clearTimeout(timeout);

    if (!timedOut) {
      console.error('\n✗ Error:', error.message);
      console.error('\nFAILURE! Proxy errored.\n');
      proxy.kill();
      process.exit(1);
    }
  }
}

testProxy().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
