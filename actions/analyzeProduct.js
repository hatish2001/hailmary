const { getPage } = require('../browser/manager');

/**
 * Analyze a Facebook Marketplace product listing.
 * 
 * INPUT:
 * {
 *   url: "https://www.facebook.com/marketplace/item/123456/",  // REQUIRED
 *   galleryScreenshots: true  // OPTIONAL: capture gallery images
 * }
 * 
 * OUTPUT:
 * {
 *   success: true,
 *   title: "Original Gameboy color",
 *   price: "$50",
 *   location: "Bakersfield, CA",
 *   condition: "Used – good",
 *   description: "Selling cheap since 2006...",
 *   seller: { name: "Christian Garcia", rating: "Highly rated" },
 *   listed: "5 days ago",
 *   image: "https://...",
 *   screenshots: ["/path/to/screenshot_1.png"],
 *   galleryScreenshots: ["/path/to/gallery_1.png", ...],
 *   url: "..."
 * }
 */

const MARKETPLACE_ITEM_URL = /https:\/\/www\.facebook\.com\/marketplace\/item\/\d+/;

async function analyzeProduct({ url, galleryScreenshots = true }) {
  const page = await getPage();
  
  // Validate URL
  if (!url || !MARKETPLACE_ITEM_URL.test(url)) {
    return {
      success: false,
      error: 'INVALID_URL',
      message: 'Must provide a valid Facebook Marketplace item URL'
    };
  }
  
  // Navigate to product page
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3500); // Wait for dynamic content
  } catch (e) {
    return {
      success: false,
      error: 'NAVIGATION_FAILED',
      message: `Failed to load product page: ${e.message}`
    };
  }
  
  const timestamp = Date.now();
  
  // Extract data using specific reliable selectors
  const result = {
    success: true,
    url: page.url(),
    screenshots: []
  };
  
  // Title - from h1 (reliable)
  try {
    result.title = await page.locator('h1').first().textContent({ timeout: 3000 });
  } catch (e) {
    result.title = null;
  }
  
  // Get main content area text for other fields
  let mainText = '';
  try {
    const mainEl = page.locator('[role="main"]').first();
    if (await mainEl.isVisible({ timeout: 2000 })) {
      mainText = await mainEl.textContent();
    }
  } catch (e) {
    mainText = '';
  }
  
  // Price - look for $ in the text
  const priceMatch = mainText.match(/(\$[\d,]+)/);
  if (priceMatch) {
    result.price = priceMatch[1];
  }
  
  // Location - find city, state pattern
  const locMatch = mainText.match(/([A-Z][a-zA-Z]+,\s*[A-Z]{2})/);
  if (locMatch) {
    result.location = locMatch[1];
  }
  
  // Listed time - find "Listed X days/hours ago"
  // Listed time and location
  const listedMatch = mainText.match(/Listed (\d+ \w+ ago) in ([^L]+)/);
  if (listedMatch) {
    result.listed = listedMatch[1];
    result.location = listedMatch[2].trim();
  }
  
  // Condition - between "Condition" and "Platform"
  const condMatch = mainText.match(/Condition(Used[^\n]+?)(?=Platform)/);
  if (condMatch) {
    result.condition = condMatch[1].trim();
  }
  
  // Platform - between "Platform" and "Selling"
  const platMatch = mainText.match(/Platform([^\n]+?)(?=Selling)/);
  if (platMatch) {
    result.platform = platMatch[1].trim();
  }
  
  // Description - between "Selling" and "Seller information"
  const sellIndex = mainText.indexOf('Seller information');
  const sellWordIndex = mainText.indexOf('Selling');
  if (sellIndex > 0 && sellWordIndex > 0) {
    let desc = mainText.slice(sellWordIndex + 7, sellIndex).trim(); // +7 to skip "Selling"
    // Clean up
    desc = desc
      .replace(/Hi, is this available\?[^\n]*/gi, '')
      .replace(/Send seller a message[^\n]*/gi, '')
      .replace(/Like\s*Share\s*Send[^\n]*/gi, '')
      .replace(/Message[^\n]*/gi, '')
      .replace(/SaveDetails[^\n]*/gi, '')
      .replace(/\n+/g, ' ')
      .trim();
    if (desc.length > 5) {
      result.description = desc.slice(0, 500);
    }
  }
  
  // Seller - extract name
  const sellDetailIndex = mainText.indexOf('Seller details');
  if (sellDetailIndex > 0) {
    const nameText = mainText.slice(sellDetailIndex, sellDetailIndex + 100);
    const nameMatch = nameText.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)/);
    if (nameMatch) {
      result.seller = { name: nameMatch[1] };
      if (mainText.includes('Highly rated')) {
        result.seller.rating = 'Highly rated';
      }
    }
  }
  
  // Product image URL
  try {
    const imgEl = page.locator('img[alt*="Product photo"]').first();
    if (await imgEl.isVisible({ timeout: 2000 })) {
      result.image = await imgEl.getAttribute('src');
    }
  } catch (e) {
    result.image = null;
  }
  
  // Take screenshot of the product page
  const screenshotPath = `/home/ubuntu/.openclaw/workspace/data/screenshots/product_${timestamp}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: false });
  result.screenshots.push(screenshotPath);
  
  // Handle gallery if requested
  if (galleryScreenshots) {
    const galleryResult = await captureGallery(page, timestamp);
    if (galleryResult) {
      result.galleryScreenshots = galleryResult.screenshots;
      result.galleryImages = galleryResult.images;
    }
  }
  
  return result;
}

async function captureGallery(page, timestamp) {
  const screenshots = [];
  const images = [];
  
  try {
    // Look for gallery navigation buttons
    // Usually there's a "See all photos" or arrow buttons
    
    // Find the main product image
    const mainImage = page.locator('img[alt*="Product photo"]').first();
    if (await mainImage.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Try to find "See all photos" button
      const seeAllBtn = page.locator('text="See all photos"').or(
                         page.locator('[aria-label*="photo"]').or(
                         page.locator('text="See more photos"')
                       )).first();
      
      if (await seeAllBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await seeAllBtn.click();
        await page.waitForTimeout(1500);
        
        // Now we're in the gallery - capture screenshots
        for (let i = 0; i < 5; i++) { // Max 5 images
          const imgEl = page.locator('img[src*="scontent"]').nth(i);
          if (await imgEl.isVisible({ timeout: 1000 }).catch(() => false)) {
            const src = await imgEl.getAttribute('src');
            if (src && !images.includes(src)) {
              images.push(src);
            }
          }
          
          // Try clicking next arrow
          const nextBtn = page.locator('[aria-label="Next"]').or(
                          page.locator('text="Next"')).first();
          if (await nextBtn.isVisible({ timeout: 500 }).catch(() => false)) {
            await nextBtn.click();
            await page.waitForTimeout(800);
            
            const galSsPath = `/home/ubuntu/.openclaw/workspace/data/screenshots/gallery_${timestamp}_${i}.png`;
            await page.screenshot({ path: galSsPath, fullPage: false });
            screenshots.push(galSsPath);
          } else {
            break;
          }
        }
        
        // Close gallery
        const closeBtn = page.locator('[aria-label="Close"]').or(
                          page.locator('text="Close"')).first();
        if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
          await closeBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  } catch (e) {
    // Gallery capture failed - not critical
  }
  
  return { screenshots, images };
}

module.exports = analyzeProduct;
