const { getPage } = require('../browser/manager');

/**
 * Enter PIN code into Facebook's encrypted chat PIN dialog.
 * 
 * Call this when Facebook shows a PIN dialog for encrypted messages.
 * It will:
 * 1. Detect if PIN dialog is visible
 * 2. Focus the PIN input box
 * 3. Type the PIN: 120106
 * 4. Press Enter
 * 
 * INPUT:
 * {
 *   pin: "120106"  // OPTIONAL: defaults to the known PIN
 * }
 * 
 * OUTPUT:
 * {
 *   success: true,
 *   dialogFound: true,
 *   pinEntered: true,
 *   message: "PIN dialog handled successfully"
 * }
 */

const DEFAULT_PIN = '120106';

// PIN input selectors on Facebook
const PIN_INPUT_SELECTORS = [
  'input[type="text"]',           // Generic text input
  'input[maxlength="6"]',         // 6-digit PIN input
  'input[inputmode="numeric"]',  // Numeric input
  'input[aria-label*="PIN"]',     // PIN labeled input
  'input[placeholder*="PIN"]',    // PIN placeholder
  'input[autocomplete="off"]',   // Autocomplete off (often PIN fields)
];

// Dialog selectors
const DIALOG_SELECTORS = [
  '[role="dialog"]',
  '[aria-labelledby*="PIN"]',
  '[aria-label*="PIN code"]',
  'div[aria-label*="encrypted"]',
];

async function enterPin({ pin = DEFAULT_PIN } = {}) {
  const page = await getPage();
  
  const result = {
    success: false,
    dialogFound: false,
    pinEntered: false,
    message: ''
  };
  
  // Step 1: Check if PIN dialog is visible
  let dialogVisible = false;
  let dialogSelector = null;
  
  for (const selector of DIALOG_SELECTORS) {
    try {
      const dialog = page.locator(selector).first();
      if (await dialog.isVisible({ timeout: 1000 })) {
        dialogVisible = true;
        dialogSelector = selector;
        break;
      }
    } catch (e) {
      // Try next selector
    }
  }
  
  result.dialogFound = dialogVisible;
  
  if (!dialogVisible) {
    result.message = 'No PIN dialog found on page';
    return result;
  }
  
  console.log(`[enterPin] Found PIN dialog with selector: ${dialogSelector}`);
  
  // Step 2: Find and focus the PIN input
  let pinInput = null;
  
  for (const selector of PIN_INPUT_SELECTORS) {
    try {
      const input = page.locator(selector).first();
      if (await input.isVisible({ timeout: 1000 })) {
        pinInput = input;
        break;
      }
    } catch (e) {
      // Try next selector
    }
  }
  
  if (!pinInput) {
    // Last resort: find any visible text input in the dialog
    try {
      const dialog = page.locator(dialogSelector).first();
      pinInput = dialog.locator('input[type="text"], input[type="tel"]').first();
      if (!(await pinInput.isVisible({ timeout: 1000 }))) {
        pinInput = null;
      }
    } catch (e) {
      pinInput = null;
    }
  }
  
  if (!pinInput) {
    result.message = 'Could not find PIN input field';
    return result;
  }
  
  // Step 3: Click to focus the input
  try {
    await pinInput.click({ timeout: 3000 });
    await page.waitForTimeout(500);
    console.log(`[enterPin] Clicked PIN input`);
  } catch (e) {
    result.message = `Failed to click PIN input: ${e.message}`;
    return result;
  }
  
  // Step 4: Type the PIN character by character
  try {
    for (const char of pin) {
      await page.keyboard.type(char, { delay: 50 });
      await page.waitForTimeout(50);
    }
    result.pinEntered = true;
    console.log(`[enterPin] Typed PIN: ${pin}`);
  } catch (e) {
    result.message = `Failed to type PIN: ${e.message}`;
    return result;
  }
  
  // Step 5: Press Enter
  try {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    console.log(`[enterPin] Pressed Enter`);
    result.success = true;
    result.message = 'PIN dialog handled successfully';
  } catch (e) {
    result.message = `Failed to press Enter: ${e.message}`;
  }
  
  return result;
}

module.exports = enterPin;
