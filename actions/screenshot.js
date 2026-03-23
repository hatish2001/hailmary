const { getPage } = require('../browser/manager');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = '/home/ubuntu/.openclaw/workspace/data/screenshots';

async function screenshot({ filename, fullPage = false } = {}) {
  const { launchBrowser } = require('../browser/manager');
  // Launch headless browser for screenshots to avoid display issues
  let browser;
  try {
    browser = await launchBrowser({ headless: true, userDataDir: '/home/ubuntu/.openclaw/workspace/data/browser-profiles/facebook' });
  } catch (e) {
    return { success: false, message: `Failed to launch browser: ${e.message}` };
  }
  const page = browser.page;

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const name = filename || `hailmary_${Date.now()}.png`;
  const filepath = path.join(SCREENSHOT_DIR, name);

  try {
    await page.screenshot({ path: filepath, fullPage });
    return {
      success: true,
      filepath,
      filename: name,
      message: `Screenshot saved to ${filepath}`
    };
  } catch (e) {
    return { success: false, message: `Screenshot failed: ${e.message}` };
  }
}

module.exports = screenshot;
