const { getPage } = require('../browser/manager');

async function wait({ milliseconds = 2000 }) {
  const page = await getPage();
  await page.waitForTimeout(milliseconds);
  return { success: true, message: `Waited ${milliseconds}ms` };
}

module.exports = wait;
