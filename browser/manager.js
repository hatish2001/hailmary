const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

let browser = null;
let context = null;
let page = null;

const COOKIE_FILES = {
  facebook: '/home/ubuntu/.openclaw/workspace/data/cookies/facebook.json',
  ebay: '/home/ubuntu/.openclaw/workspace/data/cookies/ebay.json',
};

// Anti-detection args - makes browser look like normal Chrome
const ANTI_DETECT_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--disable-features=IsolateOrigins,site-per-process',
  '--exclude-switches',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-sync',
  '--disable-translate',
  '--metrics-recording-only',
  '--mute-audio',
  '--no-first-run',
  '--safebrowsing-disable-auto-update',
];

async function launchBrowser(options = {}) {
  if (browser) return { browser, context, page };

  // Default to headless: false so it works with xvfb-run (virtual display)
  // When running without xvfb, set headless: true explicitly
  const {
    headless = false,
    cookieFile = null,
    useFreshProfile = false,
    userDataDir = null
  } = options;

  const args = [...ANTI_DETECT_ARGS];

  // Use fresh temp profile if requested - avoids cookie/FP detection
  let actualUserDataDir = userDataDir;
  if (useFreshProfile && !userDataDir) {
    actualUserDataDir = path.join(os.tmpdir(), `hailmary-browser-${Date.now()}`);
    fs.mkdirSync(actualUserDataDir, { recursive: true });
  }

  // If we have a user data dir, use launchPersistentContext (required by Playwright for user dirs)
  if (actualUserDataDir) {
    browser = await chromium.launchPersistentContext(actualUserDataDir, {
      headless,
      args,
      viewport: { width: 1280, height: 720 },
      acceptDownloads: true,
    });

    // Try to inject saved cookies from cookies.json in the profile dir
    const profileCookiesFile = path.join(actualUserDataDir, 'cookies.json');
    if (fs.existsSync(profileCookiesFile)) {
      try {
        const profileCookies = JSON.parse(fs.readFileSync(profileCookiesFile, 'utf8'));
        if (Array.isArray(profileCookies) && profileCookies.length > 0) {
          await browser.addCookies(profileCookies);
        }
      } catch (e) {
        console.error(`Failed to load profile cookies: ${e.message}`);
      }
    }

    page = browser.pages().length > 0 ? browser.pages()[0] : await browser.newPage();
    return { browser, context: browser, page };
  }

  // Normal launch (no user data dir)
  browser = await chromium.launch({ headless, args });

  context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true,
  });

  // Inject anti-detection: hide navigator.webdriver
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
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
    // Auto-load facebook cookies by default if no browser exists
    await launchBrowser({ cookieFile: 'facebook' });
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
  closeBrowser,
  ANTI_DETECT_ARGS
};
