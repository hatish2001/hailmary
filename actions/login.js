const { launchBrowser, closeBrowser, getPage } = require('../browser/manager');
const fs = require('fs');
const path = require('path');

// Self-contained cookie storage within hailmary
const HAILMARY_DATA = '/home/ubuntu/.openclaw/workspace/hailmary/data';
const COOKIE_DIR = path.join(HAILMARY_DATA, 'cookies');

// Default cookie file paths per site (for backward compat)
const DEFAULT_COOKIE_PATHS = {
  facebook: '/home/ubuntu/.openclaw/workspace/data/cookies/facebook.json',
  ebay: '/home/ubuntu/.openclaw/workspace/data/cookies/ebay.json',
};

// Default URLs per site
const DEFAULT_URLS = {
  facebook: 'https://www.facebook.com',
  ebay: 'https://www.ebay.com',
  gmail: 'https://mail.google.com',
};

/**
 * Normalize a cookie object for Playwright compatibility:
 * - sameSite must be "Lax", "Strict", or "None" (capitalized)
 * - null/undefined sameSite becomes "None"
 * - Remove problematic fields
 */
function normalizeCookie(cookie) {
  const { 
    name, 
    value, 
    domain, 
    path: cookiePath = '/', 
    expires = -1, 
    httpOnly = false, 
    secure = true, 
    sameSite,
    ...rest 
  } = cookie;

  // Normalize sameSite - must be capitalized
  let normalizedSameSite = sameSite;
  if (!sameSite || sameSite === null || sameSite === 'null') {
    normalizedSameSite = 'None';
  } else if (typeof sameSite === 'string') {
    const upper = sameSite.charAt(0).toUpperCase() + sameSite.slice(1).toLowerCase();
    if (['Lax', 'Strict', 'None'].includes(upper)) {
      normalizedSameSite = upper;
    } else {
      normalizedSameSite = 'None';
    }
  }

  return {
    name,
    value: String(value),
    domain: domain || undefined,
    path: cookiePath,
    expires: typeof expires === 'number' ? expires : -1,
    httpOnly: Boolean(httpOnly),
    secure: Boolean(secure),
    sameSite: normalizedSameSite,
    ...rest
  };
}

/**
 * Normalize an array of cookies
 */
function normalizeCookies(cookies) {
  if (!Array.isArray(cookies)) {
    throw new Error('Cookies must be an array');
  }
  return cookies.map(normalizeCookie);
}

/**
 * Save cookies to a file in our self-contained storage
 */
function saveCookies(site, cookies) {
  if (!fs.existsSync(COOKIE_DIR)) {
    fs.mkdirSync(COOKIE_DIR, { recursive: true });
  }
  const filePath = path.join(COOKIE_DIR, `${site}.json`);
  fs.writeFileSync(filePath, JSON.stringify(cookies, null, 2));
  return filePath;
}

/**
 * Load cookies from our self-contained storage
 */
function loadCookies(site) {
  const filePath = path.join(COOKIE_DIR, `${site}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function login({ site, cookieFile, cookies, url, headless = true }) {
  // Validate site
  if (!site) {
    return {
      success: false,
      error: 'MISSING_SITE',
      message: 'Must provide a site (facebook, ebay, gmail, or custom)'
    };
  }

  const siteLower = site.toLowerCase();

  // Get cookies - either from provided array, provided file, or self-contained storage
  let cookieData = null;
  let cookieSource = null;

  if (cookies && Array.isArray(cookies)) {
    // Raw cookies provided - normalize and save
    cookieData = normalizeCookies(cookies);
    cookieSource = 'provided_array';
    const savedPath = saveCookies(siteLower, cookieData);
    cookieSource = `self_contained:${savedPath}`;
  } else if (cookieFile) {
    // External file provided
    try {
      const loaded = require(cookieFile);
      cookieData = normalizeCookies(loaded);
      cookieSource = cookieFile;
      // Also save to self-contained for future use
      saveCookies(siteLower, cookieData);
      cookieSource = `self_contained:${path.join(COOKIE_DIR, siteLower + '.json')} (from ${cookieFile})`;
    } catch (e) {
      return {
        success: false,
        error: 'COOKIE_FILE_NOT_FOUND',
        message: `Could not load cookie file: ${cookieFile}`
      };
    }
  } else {
    // Try self-contained storage first
    cookieData = loadCookies(siteLower);
    if (cookieData) {
      cookieSource = `self_contained:${path.join(COOKIE_DIR, siteLower + '.json')}`;
    } else if (DEFAULT_COOKIE_PATHS[siteLower]) {
      // Fall back to old location
      try {
        const loaded = require(DEFAULT_COOKIE_PATHS[siteLower]);
        cookieData = normalizeCookies(loaded);
        cookieSource = DEFAULT_COOKIE_PATHS[siteLower];
        // Migrate to self-contained
        saveCookies(siteLower, cookieData);
        cookieSource = `self_contained:${path.join(COOKIE_DIR, siteLower + '.json')} (migrated from default)`;
      } catch (e) {
        cookieData = null;
      }
    }
  }

  if (!cookieData || cookieData.length === 0) {
    return {
      success: false,
      error: 'NO_COOKIES',
      message: `No cookies found for ${site}. Provide cookies array or cookieFile parameter.`,
      hint: 'Expected cookies in format: [{name, value, domain, ...}, ...]'
    };
  }

  // Close any existing browser session
  await closeBrowser();

  // Launch browser
  const browser = await launchBrowser({ headless });
  const context = browser.context;
  const page = browser.page;

  // Add cookies to context
  try {
    await context.addCookies(cookieData);
  } catch (e) {
    await closeBrowser();
    return {
      success: false,
      error: 'COOKIE_ADD_FAILED',
      message: `Failed to add cookies: ${e.message}`,
      cookieSource,
      hint: 'Check that cookie domains are valid and cookies are not expired'
    };
  }

  // Navigate to URL
  const targetUrl = url || DEFAULT_URLS[siteLower] || 'https://www.google.com';
  
  let navigationSuccess = false;
  let navigationError = null;

  // Try different wait strategies
  const strategies = [
    { waitUntil: 'domcontentloaded', timeout: 15000 },
    { waitUntil: 'load', timeout: 10000 },
    { waitUntil: 'commit', timeout: 5000 },
  ];

  for (const strategy of strategies) {
    try {
      await page.goto(targetUrl, strategy);
      await page.waitForTimeout(2000);
      navigationSuccess = true;
      break;
    } catch (e) {
      navigationError = e.message;
      // Try next strategy
    }
  }

  if (!navigationSuccess) {
    return {
      success: false,
      error: 'NAVIGATION_FAILED',
      message: `Failed to navigate to ${targetUrl}: ${navigationError}`,
      loggedIn: false,
      cookieSource
    };
  }

  // Verify login via URL
  const currentUrl = page.url();
  let loggedIn = false;
  let verificationMethod = null;

  if (siteLower === 'facebook') {
    const url = currentUrl.toLowerCase();
    if (url.includes('facebook.com') && 
        !url.includes('/login') && 
        !url.includes('checkpoint') && 
        !url.includes('security') &&
        !url.includes('auth')) {
      loggedIn = true;
      verificationMethod = 'url_confirmed';
    } else {
      verificationMethod = 'url_redirected_to_login';
    }
  } else {
    // Generic check
    if (!currentUrl.includes('login') && !currentUrl.includes('signin') && !currentUrl.includes('auth')) {
      loggedIn = true;
      verificationMethod = 'url_redirected';
    } else {
      verificationMethod = 'still_on_login_url';
    }
  }

  return {
    success: true,
    loggedIn,
    site: siteLower,
    cookieSource,
    url: currentUrl,
    title: await page.title(),
    verificationMethod,
    cookiesSaved: cookieSource,
    message: loggedIn 
      ? `Successfully logged into ${site}` 
      : `Cookies loaded but login unclear. URL: ${currentUrl}`,
    warning: loggedIn ? null : 'Login state uncertain - cookies may be expired'
  };
}

module.exports = login;
