const { getPage } = require('../browser/manager');

async function navigate({ url, waitUntil = 'domcontentloaded', timeout = 20000 }) {
  const page = await getPage();
  
  // Fall back through strategies if first fails
  const strategies = [
    { waitUntil: 'domcontentloaded', timeout: 15000 },
    { waitUntil: 'load', timeout: 10000 },
    { waitUntil: 'commit', timeout: 5000 },
  ];

  let lastError = null;
  for (const strategy of strategies) {
    try {
      await page.goto(url, strategy);
      await page.waitForTimeout(2500); // Wait for dynamic content
      break;
    } catch (e) {
      lastError = e.message;
      // Try next strategy
    }
  }

  const title = await page.title();
  const currentUrl = page.url();

  return {
    success: true,
    url: currentUrl,
    title,
    message: `Navigated to ${url}`
  };
}

module.exports = navigate;
