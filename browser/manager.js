const { chromium } = require('playwright');

let browser = null;
let context = null;
let page = null;

const COOKIE_FILES = {
  facebook: '/home/ubuntu/.openclaw/workspace/data/cookies/facebook.json',
  ebay: '/home/ubuntu/.openclaw/workspace/data/cookies/ebay.json',
};

async function launchBrowser(options = {}) {
  if (browser) return { browser, context, page };

  const { headless = true, cookieFile = null } = options;

  browser = await chromium.launch({
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });

  if (cookieFile && COOKIE_FILES[cookieFile]) {
    try {
      const cookies = require(COOKIE_FILES[cookieFile]);
      await context.addCookies(cookies);
    } catch (e) {
      console.error(`Failed to load cookies from ${cookieFile}:`, e.message);
    }
  } else if (cookieFile) {
    try {
      const cookies = require(cookieFile);
      await context.addCookies(cookies);
    } catch (e) {
      console.error(`Failed to load cookies from ${cookieFile}:`, e.message);
    }
  }

  page = await context.newPage();
  return { browser, context, page };
}

async function getPage() {
  if (!page) {
    await launchBrowser();
  }
  return page;
}

async function closeBrowser() {
  if (page) await page.close();
  if (context) await context.close();
  if (browser) await browser.close();
  browser = null;
  context = null;
  page = null;
}

module.exports = {
  launchBrowser,
  getPage,
  closeBrowser
};
