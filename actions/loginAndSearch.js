const { launchBrowser, getPage, closeBrowser } = require('../browser/manager');
const { loginWithCredentials } = require('./loginWithCredentials');
const { marketplaceSearch } = require('./marketplaceSearch');
const fs = require('fs');
const path = require('path');

const COOKIE_DIR = '/home/ubuntu/.openclaw/workspace/hailmary/data/cookies';
const CREDENTIALS_FILE = '/home/ubuntu/.openclaw/workspace/hailmary/data/credentials.json';

/**
 * Login to Facebook AND run marketplace search in one chained operation.
 * Uses fresh profile, preserves browser session across both steps.
 * 
 * INPUT:
 * {
 *   query: "bmw 330i",              // REQUIRED: Search term
 *   category: "vehicles",            // OPTIONAL: vehicles|electronics|...
 *   location: "Upland, CA",         // OPTIONAL: Location
 *   radius: 50,                      // OPTIONAL: Radius in miles
 *   priceMin: 10000,                 // OPTIONAL: Min price
 *   priceMax: 50000,                // OPTIONAL: Max price
 *   useFreshProfile: true            // OPTIONAL: Use fresh Chrome profile (default: true)
 * }
 * 
 * OUTPUT:
 * {
 *   success: true,
 *   step: "login" | "search",
 *   loginResult: { loggedIn, cookieFile },
 *   searchResult: { resultsCount, results, screenshot, url },
 *   message: "..."
 * }
 */

// Persistent browser profile - survives across process restarts
const PERSISTENT_PROFILE_DIR = '/home/ubuntu/.openclaw/workspace/data/browser-profiles/facebook';

async function loginAndSearch(params) {
  const {
    query,
    category,
    location,
    radius,
    priceMin,
    priceMax
  } = params;

  if (!query) {
    return { success: false, error: 'MISSING_QUERY', message: 'Search query is required' };
  }

  const timestamp = Date.now();
  let screenshotPath = null;

  // === STEP 1: Login with persistent profile ===
  let credentials;
  try {
    credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8')).facebook;
  } catch (e) {
    return { success: false, error: 'NO_CREDENTIALS', message: 'No credentials file found' };
  }

  // Close any existing browser first
  await closeBrowser();

  // Ensure profile directory exists
  if (!fs.existsSync(PERSISTENT_PROFILE_DIR)) {
    fs.mkdirSync(PERSISTENT_PROFILE_DIR, { recursive: true });
  }

  // Launch browser with PERSISTENT profile - same fingerprint every time
  const { browser, context, page } = await launchBrowser({
    headless: false,
    useFreshProfile: false,  // IMPORTANT: reuse same profile to maintain fingerprint
    userDataDir: PERSISTENT_PROFILE_DIR
  });

  // Navigate to login
  await page.goto('https://www.facebook.com/login', {
    waitUntil: 'networkidle',
    timeout: 20000
  });
  await page.waitForTimeout(3000);

  // Fill credentials
  const emailInput = page.locator('input[name="email"], #email, input[type="text"]').first();
  await emailInput.fill(credentials.email);
  await page.waitForTimeout(300);

  const passwordInput = page.locator('input[name="pass"], #pass, input[type="password"]').first();
  await passwordInput.fill(credentials.password);
  await page.waitForTimeout(300);

  // Click login - try multiple strategies
  let loginClicked = false;
  
  const strategies = [
    () => page.locator('button[name="login"]').first().isVisible({ timeout: 1000 }),
    () => page.locator('#loginbutton input[type="submit"]').first().isVisible({ timeout: 1000 }),
    () => page.locator('button[type="submit"]').first().isVisible({ timeout: 1000 }),
  ];

  for (const strategy of strategies) {
    try {
      if (await strategy()) {
        const btn = page.locator('button[name="login"], #loginbutton input[type="submit"], button[type="submit"]').first();
        await btn.click();
        loginClicked = true;
        break;
      }
    } catch (e) {}
  }

  if (!loginClicked) {
    await passwordInput.press('Enter');
    loginClicked = true;
  }

  await page.waitForTimeout(5000);

  // Check if we're logged in
  const url = page.url().toLowerCase();
  const loggedIn = !url.includes('/login') && !url.includes('checkpoint') && !url.includes('security');

  // Save cookies
  let cookieFile = null;
  if (loggedIn) {
    const cookies = await context.cookies();
    if (!fs.existsSync(COOKIE_DIR)) {
      fs.mkdirSync(COOKIE_DIR, { recursive: true });
    }
    cookieFile = path.join(COOKIE_DIR, 'facebook.json');
    fs.writeFileSync(cookieFile, JSON.stringify(cookies, null, 2));
  }

  screenshotPath = `/home/ubuntu/.openclaw/workspace/data/screenshots/fb_login_${timestamp}.png`;
  await page.screenshot({ path: screenshotPath });

  const loginResult = {
    success: true,
    loggedIn,
    url: page.url(),
    cookieFile,
    screenshot: screenshotPath
  };

  if (!loggedIn) {
    return {
      success: false,
      step: 'login',
      loginResult,
      message: 'Login failed - could not authenticate'
    };
  }

  // === STEP 2: Run marketplace search in same browser session ===
  screenshotPath = `/home/ubuntu/.openclaw/workspace/data/screenshots/marketplace_${query.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.png`;

  // Build URL
  const BASE_URL = 'https://www.facebook.com/marketplace';
  let locationSlug = 'san-jose';
  if (location) {
    locationSlug = location.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  let categoryPath = '';
  if (category) {
    const slugs = { vehicles: 'vehicles', electronics: 'electronics', clothing: 'clothing', furniture: 'furniture', property: 'property', rentals: 'rentals' };
    if (slugs[category]) categoryPath = `/${slugs[category]}`;
  }

  let searchUrl = `${BASE_URL}/${locationSlug}${categoryPath}?query=${encodeURIComponent(query)}`;
  if (radius) searchUrl += `&radius=${radius}`;
  if (priceMin) searchUrl += `&minPrice=${priceMin}`;
  if (priceMax) searchUrl += `&maxPrice=${priceMax}`;

  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(4000);

  // Extract results
  const results = [];
  const listingLinks = await page.locator('a[href*="/marketplace/item/"]').all();

  for (const link of listingLinks.slice(0, 50)) {
    try {
      const href = await link.getAttribute('href');
      const text = await link.textContent();
      if (!text || !href) continue;

      const priceMatch = text.match(/\$[\d,]+(?:\.\d{2})?/);
      const price = priceMatch ? priceMatch[0] : null;

      let title = text.replace(/\$[\d,]+(?:\.\d{2})?/g, '').replace(/\s+/g, ' ').trim();
      title = title.replace(/^(Just listed|Partner listing)\s*/i, '').trim();
      if (title.length > 100) title = title.slice(0, 100) + '...';

      if (title && price) {
        results.push({
          title,
          price,
          url: href.startsWith('http') ? href : `https://www.facebook.com${href}`
        });
      }
    } catch (e) {}
  }

  await page.screenshot({ path: screenshotPath });

  const searchResult = {
    success: true,
    query,
    category: category || 'all',
    location: location || 'default',
    resultsCount: results.length,
    results,
    screenshot: screenshotPath,
    url: page.url()
  };

  return {
    success: true,
    step: 'search',
    loginResult,
    searchResult,
    message: `Found ${results.length} results for "${query}"`
  };
}

module.exports = loginAndSearch;
