const { launchBrowser, closeBrowser } = require('../browser/manager');
const fs = require('fs');
const path = require('path');

const COOKIE_DIR = '/home/ubuntu/.openclaw/workspace/hailmary/data/cookies';

/**
 * Log into Facebook using email and password credentials.
 * Saves cookies after successful login for future sessions.
 * 
 * INPUT:
 * {
 *   email: "user@example.com",     // REQUIRED: Facebook email
 *   password: "yourPassword",       // REQUIRED: Facebook password
 *   saveCookies: true              // OPTIONAL: Save cookies after login (default: true)
 * }
 * 
 * OUTPUT:
 * {
 *   success: true,
 *   loggedIn: true,
 *   message: "Successfully logged into Facebook",
 *   cookieFile: "/path/to/cookies/facebook.json",
 *   screenshot: "/path/to/screenshot.png"
 * }
 */

async function loginWithCredentials({ email, password, saveCookies = true }) {
  if (!email || !password) {
    return {
      success: false,
      error: 'MISSING_CREDENTIALS',
      message: 'Both email and password are required'
    };
  }

  // Close any existing browser session
  await closeBrowser();

  // Launch browser with fresh profile to avoid detection/blocks
  const { browser, context, page } = await launchBrowser({ 
    headless: false,
    useFreshProfile: true
  });

  let screenshotPath = null;

  try {
    // Navigate to Facebook login page
    await page.goto('https://www.facebook.com/login', {
      waitUntil: 'networkidle',
      timeout: 20000
    });
    await page.waitForTimeout(3000);

    // Debug: take screenshot of login page
    const debugSSPath = `/home/ubuntu/.openclaw/workspace/data/screenshots/fb_debug_${Date.now()}.png`;
    await page.screenshot({ path: debugSSPath });

    // Find and fill email field
    const emailInput = page.locator('input[name="email"], #email, input[type="text"]').first();
    await emailInput.click();
    await emailInput.fill(email);
    await page.waitForTimeout(300);

    // Find and fill password field
    const passwordInput = page.locator('input[name="pass"], #pass, input[type="password"]').first();
    await passwordInput.click();
    await passwordInput.fill(password);
    await page.waitForTimeout(300);

    // Take screenshot after filling form
    await page.screenshot({ path: debugSSPath.replace('.png', '_filled.png') });

    // Find and click login button - try multiple strategies
    let loginClicked = false;
    
    // Strategy 1: button with name="login"
    try {
      const btn1 = page.locator('button[name="login"]').first();
      if (await btn1.isVisible({ timeout: 2000 })) {
        await btn1.click();
        loginClicked = true;
      }
    } catch (e) {}
    
    // Strategy 2: primary submit button (Facebook's actual login button)
    if (!loginClicked) {
      try {
        const btn2 = page.locator('#loginbutton input[type="submit"], #loginbutton button').first();
        if (await btn2.isVisible({ timeout: 2000 })) {
          await btn2.click();
          loginClicked = true;
        }
      } catch (e) {}
    }
    
    // Strategy 3: any visible submit button in form
    if (!loginClicked) {
      try {
        const form = page.locator('form[action*="login"]').first();
        const submitBtn = form.locator('button[type="submit"], input[type="submit"]').first();
        if (await submitBtn.isVisible({ timeout: 2000 })) {
          await submitBtn.click();
          loginClicked = true;
        }
      } catch (e) {}
    }
    
    // Strategy 4: press Enter in password field
    if (!loginClicked) {
      try {
        await passwordInput.press('Enter');
        loginClicked = true;
      } catch (e) {}
    }
    
    if (!loginClicked) {
      throw new Error('Could not find or click any login button');
    }

    // Wait for navigation after login
    await page.waitForTimeout(5000);

    // Check if login was successful (URL should NOT be on login page)
    const currentUrl = page.url().toLowerCase();
    let loggedIn = false;

    if (!currentUrl.includes('/login') && !currentUrl.includes('checkpoint') && !currentUrl.includes('security')) {
      loggedIn = true;
    } else {
      // Maybe it loaded the news feed directly
      if (currentUrl.includes('facebook.com') && !currentUrl.includes('login')) {
        loggedIn = true;
      }
    }

    // Take screenshot
    const timestamp = Date.now();
    screenshotPath = `/home/ubuntu/.openclaw/workspace/data/screenshots/fb_login_${timestamp}.png`;
    
    // Ensure screenshots directory exists
    const screenshotsDir = path.dirname(screenshotPath);
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    
    await page.screenshot({ path: screenshotPath });

    // Save cookies if requested and login was successful
    let cookieFile = null;
    if (loggedIn && saveCookies) {
      const cookies = await context.cookies();
      
      if (!fs.existsSync(COOKIE_DIR)) {
        fs.mkdirSync(COOKIE_DIR, { recursive: true });
      }
      
      cookieFile = path.join(COOKIE_DIR, 'facebook.json');
      fs.writeFileSync(cookieFile, JSON.stringify(cookies, null, 2));
    }

    return {
      success: true,
      loggedIn,
      message: loggedIn
        ? 'Successfully logged into Facebook'
        : 'Login may have failed - redirected to: ' + currentUrl,
      cookieFile,
      screenshot: screenshotPath,
      url: currentUrl
    };

  } catch (e) {
    return {
      success: false,
      error: 'LOGIN_ERROR',
      message: `Login failed: ${e.message}`,
      screenshot: screenshotPath
    };
  }
}

module.exports = loginWithCredentials;
