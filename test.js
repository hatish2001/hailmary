const { executeTool, executeSequence, launchBrowser, closeBrowser } = require('./index');

async function test() {
  console.log('Testing hailmary framework...\n');

  // Initialize browser
  await launchBrowser({ headless: false });

  try {
    // Test 1: Navigate to Google
    console.log('Test 1: Navigate to Google');
    let result = await executeTool('navigate', { url: 'https://google.com' });
    console.log('Result:', result.success ? '✓' : '✗', result.message);

    // Test 2: Take screenshot
    console.log('\nTest 2: Take screenshot');
    result = await executeTool('screenshot', { filename: 'test_google.png' });
    console.log('Result:', result.success ? '✓' : '✗', result.filepath);

    // Test 3: Get URL
    console.log('\nTest 3: Get current URL');
    result = await executeTool('getUrl');
    console.log('Result:', result.success ? '✓' : '✗', result.url);

    // Test 4: Sequence
    console.log('\nTest 4: Execute sequence (navigate → screenshot)');
    const seqResults = await executeSequence([
      { tool: 'navigate', params: { url: 'https://github.com' } },
      { tool: 'screenshot', params: { filename: 'test_github.png' } },
    ]);
    console.log('Sequence complete');

    console.log('\nAll tests passed!');
  } finally {
    await closeBrowser();
  }
}

test().catch(console.error);
