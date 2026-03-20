const { getPage } = require('../browser/manager');

async function getText({ selector }) {
  const page = await getPage();

  try {
    if (selector) {
      const elements = await page.locator(selector).all();
      const texts = [];
      for (const el of elements) {
        texts.push(await el.textContent());
      }
      return { success: true, texts, count: texts.length };
    } else {
      // Get all visible text on page
      const bodyText = await page.locator('body').textContent();
      return { success: true, text: bodyText, count: 1 };
    }
  } catch (e) {
    return { success: false, message: `getText failed: ${e.message}` };
  }
}

module.exports = getText;
