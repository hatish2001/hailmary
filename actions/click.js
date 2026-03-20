const { getPage } = require('../browser/manager');

async function click({ selector, index = 0, text, timeout = 5000 }) {
  const page = await getPage();

  try {
    let element;

    if (text) {
      // Find element containing text
      const elements = await page.locator(`*:has-text("${text}")`).all();
      if (elements.length === 0) {
        return { success: false, message: `No element found containing text: ${text}` };
      }
      element = elements[index || 0];
    } else if (selector) {
      element = page.locator(selector).first();
    } else {
      return { success: false, message: 'Must provide either selector or text' };
    }

    await element.click({ timeout });
    await page.waitForTimeout(1000);

    return {
      success: true,
      message: `Clicked on ${text || selector}`,
      url: page.url()
    };
  } catch (e) {
    return { success: false, message: `Click failed: ${e.message}` };
  }
}

module.exports = click;
