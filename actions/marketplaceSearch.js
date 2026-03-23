const { getPage } = require('../browser/manager');

/**
 * Facebook Marketplace Search Action
 * 
 * Uses URL-based search instead of UI interaction for reliability.
 * 
 * INPUT PARAMETERS:
 * {
 *   query: "bmw 330i",               // REQUIRED: Search term
 *   category: "vehicles",              // OPTIONAL: vehicles|electronics|clothing|furniture|property|rentals
 *   location: "Upland, CA",          // OPTIONAL: Location to search in
 *   priceMin: 10000,                  // OPTIONAL: Minimum price
 *   priceMax: 35000,                 // OPTIONAL: Maximum price
 *   condition: "used",               // OPTIONAL: new|used_like_new|used
 *   radius: 50,                     // OPTIONAL: Search radius in miles
 *   sortBy: "newest"                // OPTIONAL: newest|price_asc|price_desc|relevance
 * }
 * 
 * OUTPUT:
 * {
 *   success: true,
 *   query: "bmw 330i",
 *   resultsCount: 24,
 *   results: [
 *     { title: "BMW 330i 2022", price: "$32,500", location: "Upland, CA", url: "..." },
 *     ...
 *   ],
 *   screenshot: "/path/to/screenshot.png"
 * }
 */

const BASE_URL = 'https://www.facebook.com/marketplace';

// Category to URL mapping
const CATEGORY_SLUGS = {
  vehicles: 'vehicles',
  electronics: 'electronics',
  clothing: 'clothing',
  furniture: 'furniture',
  property: 'property',
  rentals: 'rentals',
};

function buildSearchUrl({ query, category, location, priceMin, priceMax, radius }) {
  // Build location slug
  let locationSlug = 'san-jose'; // default
  if (location) {
    // Handle "Upland, CA" -> "upland" 
    locationSlug = location.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    // Handle multi-word like "san-jose"
    if (locationSlug.split('-').length > 1) {
      // Already slug-like, keep as is
    }
  }
  
  // Build category path
  let categoryPath = '';
  if (category && CATEGORY_SLUGS[category]) {
    categoryPath = `/${CATEGORY_SLUGS[category]}`;
  }
  
  // Build URL: https://www.facebook.com/marketplace/[location][category]?query=searchTerm
  let url = `${BASE_URL}/${locationSlug}${categoryPath}`;
  
  // Add query params
  const params = new URLSearchParams();
  if (query) params.set('query', query);
  
  const urlStr = url + '?' + params.toString();
  return urlStr;
}

// Results selectors - updated for current Facebook Marketplace
const RESULT_SELECTORS = [
  'a[href*="/marketplace/item/"]',
  '[role="article"] a[href*="/marketplace/"]',
  'div[aria-label*="$"] a[href*="/marketplace/"]',
];

async function marketplaceSearch({ 
  query, 
  category, 
  location,
  priceMin, 
  priceMax, 
  condition,
  radius,
  sortBy,
  verifyScreenshot = true
}) {
  const page = await getPage();
  
  if (!query) {
    return {
      success: false,
      error: 'MISSING_QUERY',
      message: 'Search query is required. Provide a "query" parameter.'
    };
  }
  
  // Build and navigate to search URL
  const searchUrl = buildSearchUrl({ query, category, location, priceMin, priceMax, radius });
  
  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(4000); // Wait for JS to render listings
  } catch (e) {
    // Fallback to basic marketplace search
    const fallbackUrl = `${BASE_URL}/san-jose?query=${encodeURIComponent(query)}`;
    await page.goto(fallbackUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(4000);
  }
  
  // Apply filters via URL params if provided
  const currentUrl = page.url();
  const urlObj = new URL(currentUrl);
  
  if (priceMin !== undefined) urlObj.searchParams.set('minPrice', priceMin);
  if (priceMax !== undefined) urlObj.searchParams.set('maxPrice', priceMax);
  if (radius !== undefined) urlObj.searchParams.set('radius', radius);
  
  if (urlObj.toString() !== currentUrl) {
    await page.goto(urlObj.toString(), { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
  }
  
  // Apply sort if provided (via UI since URL sort can be tricky)
  if (sortBy) {
    await applySort(page, sortBy);
  }
  
  // Wait for results
  await page.waitForTimeout(2000);
  
  // Extract results
  const results = await extractResults(page);
  
  // Take screenshot
  let screenshotPath = null;
  if (verifyScreenshot) {
    const timestamp = Date.now();
    screenshotPath = `/home/ubuntu/.openclaw/workspace/data/screenshots/marketplace_${query.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
  }
  
  return {
    success: true,
    query,
    category: category || 'all',
    location: location || 'default',
    resultsCount: results.length,
    results,
    screenshot: screenshotPath,
    url: page.url(),
    message: `Found ${results.length} results for "${query}"`
  };
}

async function applySort(page, sortBy) {
  try {
    // Click sort button - Facebook uses various selectors
    const sortBtn = page.locator('span:has-text("Sort")').first();
    if (await sortBtn.isVisible({ timeout: 2000 })) {
      await sortBtn.click();
      await page.waitForTimeout(1000);
    } else {
      // Try aria-label
      const sortBtn2 = page.locator('[aria-label*="Sort"]').first();
      if (await sortBtn2.isVisible({ timeout: 1000 })) {
        await sortBtn2.click();
        await page.waitForTimeout(1000);
      }
    }
    
    const sortMap = {
      'newest': 'Newest',
      'price_asc': 'Price: Low to High',
      'price_desc': 'Price: High to Low',
      'relevance': 'Relevance'
    };
    
    const sortText = sortMap[sortBy];
    if (sortText) {
      const option = page.locator('div[role="menu"] span').filter({ hasText: sortText }).first();
      if (await option.isVisible({ timeout: 2000 })) {
        await option.click();
        await page.waitForTimeout(1500);
      }
    }
  } catch (e) {
    // Sort not critical, continue
  }
}

async function extractResults(page) {
  const results = [];
  
  try {
    // Find all marketplace listing links
    const listingLinks = await page.locator('a[href*="/marketplace/item/"]').all();
    
    for (const link of listingLinks.slice(0, 50)) {
      try {
        const href = await link.getAttribute('href');
        const text = await link.textContent();
        
        if (!text || !href) continue;
        
        // Extract price - look for dollar amounts
        const priceMatch = text.match(/\$[\d,]+(?:\.\d{2})?/);
        const price = priceMatch ? priceMatch[0] : null;
        
        // Extract location - look for "City, ST" pattern at end
        const locationMatch = text.match(/, ([A-Z]{2})\s*$/m);
        const location = locationMatch ? locationMatch[0].replace(', ', '').trim() : null;
        
        // Extract title - text before price/location, cleaned
        let title = text
          .replace(/\$[\d,]+(?:\.\d{2})?/g, '')
          .replace(/, [A-Z]{2}\s*$/m, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        // Clean common prefixes
        title = title
          .replace(/^(Just listed|Partner listing)\s*/i, '')
          .trim();
        
        // Truncate long titles
        if (title.length > 100) {
          title = title.slice(0, 100) + '...';
        }
        
        if (title && price) {
          results.push({
            title,
            price,
            location,
            url: href.startsWith('http') ? href : `https://www.facebook.com${href}`
          });
        }
      } catch (e) {
        // Skip bad card
      }
    }
  } catch (e) {
    // No results found
  }
  
  return results;
}

module.exports = marketplaceSearch;
