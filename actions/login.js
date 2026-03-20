const { launchBrowser, closeBrowser, getPage } = require('../browser/manager');

// Default cookie file paths per site
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

async function login({ site, cookieFile, cookies, url, headless = true }) {
  // Validate site
  if (!site) {
    return {
      success: false,
      error: 'MISSING_SITE',
      message: 'Must provide a site (facebook, ebay, gmail, or custom)'
    };
  }

  // Get cookies - either from file or raw cookies array
  let cookieData = null;
  let cookieSource = null;

  if (cookies && Array.isArray(cookies)) {
    cookieData = cookies;
    cookieSource = 'raw_cookies';
  } else if (cookieFile) {
    try {
      cookieData = require(cookieFile);
      cookieSource = cookieFile;
    } catch (e) {
      return {
        success: false,
        error: 'COOKIE_FILE_NOT_FOUND',
        message: `Could not load cookie file: ${cookieFile}`
      };
    }
  } else if (DEFAULT_COOKIE_PATHS[site]) {
    try {
      cookieData = require(DEFAULT_COOKIE_PATHS[site]);
      cookieSource = DEFAULT_COOKIE_PATHS[site];
    } catch (e) {
      return {
        success: false,
        error: 'COOKIE_FILE_NOT_FOUND',
        message: `No cookie file found for ${site} at ${DEFAULT_COOKIE_PATHS[site]}`,
        hint: 'Provide cookieFile or cookies parameter'
      };
    }
  } else {
    return {
      success: false,
      error: 'NO_COOKIES',
      message: `No cookie file for ${site}. Provide cookieFile or cookies parameter.`
    };
  }

  // Validate cookie data
  if (!Array.isArray(cookieData) || cookieData.length === 0) {
    return {
      success: false,
      error: 'INVALID_COOKIES',
      message: 'Cookie data must be a non-empty array'
    };
  }

  // Close any existing browser session
  await closeBrowser();

  // Launch browser with headless mode
  const browser = await launchBrowser({ headless });

  const context = browser.context;
  const page = browser.page;

  // Add cookies to context
  try {
    // Clean cookies - remove any problematic fields
    const cleanCookies = cookieData.map(cookie => {
      const { name, value, domain, path, expires, httpOnly, secure, sameSite, ...rest } = cookie;
      return {
        name,
        value,
        domain: domain || undefined,
        path: path || '/',
        expires: expires || -1,
        httpOnly: httpOnly || false,
        secure: secure !== false,
        sameSite: sameSite || 'None',
        ...rest
      };
    });

    await context.addCookies(cleanCookies);
  } catch (e) {
    await closeBrowser();
    return {
      success: false,
      error: 'COOKIE_ADD_FAILED',
      message: `Failed to add cookies: ${e.message}`
    };
  }

  // Navigate to URL
  const targetUrl = url || DEFAULT_URLS[site] || 'https://www.google.com';
  
  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000); // Wait for dynamic content to load
  } catch (e) {
    // Try with shorter timeout and load only
    try {
      await page.goto(targetUrl, { waitUntil: 'load', timeout: 10000 });
      await page.waitForTimeout(2000);
    } catch (e2) {
      return {
        success: false,
        error: 'NAVIGATION_FAILED',
        message: `Failed to navigate to ${targetUrl}: ${e2.message}`,
        loggedIn: false,
        cookieSource
      };
    }
  }

  // Verify we're logged in by checking the URL or page content
  const currentUrl = page.url();
  let loggedIn = false;
  let verificationMethod = null;
  let pageTitle = await page.title();

  // Check for common "logged out" indicators
  const pageContent = await page.content();
  
  // Facebook verification - URL-based only (content has too many false positives)
  if (site === 'facebook') {
    const url = currentUrl.toLowerCase();
    // Must be on facebook.com domain, not on login/checkpoint paths
    if (url.includes('facebook.com') && 
        !url.includes('/login') && 
        !url.includes('checkpoint') && 
        !url.includes('security') &&
        !url.includes('auth')) {
      loggedIn = true;
      verificationMethod = 'facebook_url_confirmed';
    } else if (url.includes('/login') || url.includes('checkpoint')) {
      loggedIn = false;
      verificationMethod = 'facebook_login_url';
    }
  }
  
  // Generic check - if URL changed from login URL, probably logged in
  if (!verificationMethod) {
    if (!currentUrl.includes('login') && !currentUrl.includes('signin') && !currentUrl.includes('auth')) {
      loggedIn = true;
      verificationMethod = 'url_redirected';
    } else {
      loggedIn = false;
      verificationMethod = 'still_on_login_url';
    }
  }

  const result = {
    success: true,
    loggedIn,
    site,
    cookieSource,
    url: currentUrl,
    title: await page.title(),
    verificationMethod,
    message: loggedIn 
      ? `Successfully logged into ${site}` 
      : `Cookies loaded but login verification unclear. Current URL: ${currentUrl}`
  };

  // Add warning if not clearly logged in
  if (!loggedIn) {
    result.warning = 'Login state uncertain - cookies may be expired or invalid';
  }

  return result;
}

module.exports = login;
