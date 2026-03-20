const { getPage } = require('../browser/manager');

async function type({ selector, text, pressEnter = false, timeout = 5000 }) {
  const page = await getPage();

  try {
    const element = page.locator(selector).first();
    await element.fill(text, { timeout });

    if (pressEnter) {
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(500);

    return {
      success: true,
      message: `Typed "${text}"${pressEnter ? ' and pressed Enter' : ''}`
    };
  } catch (e) {
    return { success: false, message: `Type failed: ${e.message}` };
  }
}

module.exports = type;
