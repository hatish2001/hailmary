const { getPage } = require('../browser/manager');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = '/home/ubuntu/.openclaw/workspace/data/screenshots';

async function screenshot({ filename, fullPage = false } = {}) {
  const page = await getPage();

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
