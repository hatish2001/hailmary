const { getPage } = require('../browser/manager');

async function navigate({ url, waitUntil = 'networkidle', timeout = 30000 }) {
  const page = await getPage();
  await page.goto(url, { waitUntil, timeout });
  await page.waitForTimeout(2000); // Extra wait for dynamic content

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
