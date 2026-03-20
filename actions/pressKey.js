const { getPage } = require('../browser/manager');

async function pressKey({ key }) {
  const page = await getPage();
  await page.keyboard.press(key);
  await page.waitForTimeout(500);
  return { success: true, message: `Pressed key: ${key}` };
}

module.exports = pressKey;
