const { getPage } = require('../browser/manager');

/**
 * Facebook Marketplace Search Action
 * 
 * Navigates to Facebook Marketplace and performs a search with optional filters.
 * 
 * INPUT PARAMETERS:
 * {
 *   query: "ps5",                    // REQUIRED: Search term
 *   category: "electronics",          // OPTIONAL: vehicles|electronics|clothing|furniture|property|rentals
 *   location: "San Jose, CA",        // OPTIONAL: Location to search in
 *   priceMin: 100,                   // OPTIONAL: Minimum price
 *   priceMax: 500,                   // OPTIONAL: Maximum price
 *   condition: "used",               // OPTIONAL: new|used_like_new|used
 *   radius: 25,                     // OPTIONAL: Search radius in miles
 *   sortBy: "newest"                // OPTIONAL: newest|price_asc|price_desc|relevance
 * }
 * 
 * OUTPUT:
 * {
 *   success: true,
 *   query: "ps5",
 *   resultsCount: 24,
 *   results: [
 *     { title: "PlayStation 5 Console", price: "$175", location: "San Jose, CA", url: "...", image: "..." },
 *     ...
 *   ],
 *   screenshot: "/path/to/screenshot.png"
 * }
 */

const MARKETPLACE_URL = 'https://www.facebook.com/marketplace';

// Category to URL mapping
const CATEGORY_URLS = {
  vehicles: 'https://www.facebook.com/marketplace/san-jose/vehicles',
  electronics: 'https://www.facebook.com/marketplace/san-jose/electronics',
  clothing: 'https://www.facebook.com/marketplace/san-jose/clothing',
  furniture: 'https://www.facebook.com/marketplace/san-jose/furniture',
  property: 'https://www.facebook.com/marketplace/san-jose/property',
  rentals: 'https://www.facebook.com/marketplace/san-jose/rentals',
};

// Search input selectors (tried in order)
const SEARCH_INPUT_SELECTORS = [
  'input[aria-label="Search Marketplace"]',
  'input[role="combobox"][aria-label*="Search"]',
  'input[type="search"][placeholder*="Marketplace"]',
];

// Filter button selectors
const FILTER_SELECTORS = {
  location: '[aria-label*="Location"]',
  price: '[aria-label*="Price"]',
  category: '[aria-label*="Category"]',
  condition: '[aria-label*="Condition"]',
};

// Results selectors
const RESULT_SELECTORS = [
  '[role="article"]',
  'a[href*="/marketplace/item/"]',
  '[data-testid="marketplace-listings-card"]',
  'div[aria-label*="$"]',
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
  
  // Validate required params
  if (!query) {
    return {
      success: false,
      error: 'MISSING_QUERY',
      message: 'Search query is required. Provide a "query" parameter.'
    };
  }
  
  // Determine URL to navigate to
  let targetUrl = MARKETPLACE_URL;
  if (category && CATEGORY_URLS[category]) {
    targetUrl = CATEGORY_URLS[category];
  }
  if (location) {
    // Replace "san-jose" placeholder with actual location slug
    const locationSlug = location.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    targetUrl = targetUrl.replace('/marketplace', `/marketplace/${locationSlug}`);
    if (category && CATEGORY_URLS[category]) {
      targetUrl = CATEGORY_URLS[category].replace('/san-jose', `/${locationSlug}`);
    }
  }
  
  // Navigate to marketplace
  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2500);
  } catch (e) {
    // Fallback to main marketplace
    await page.goto(MARKETPLACE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2500);
  }
  
  // Find and fill the search input
  let searchInput = null;
  for (const selector of SEARCH_INPUT_SELECTORS) {
    try {
      if (await page.isVisible(selector)) {
        searchInput = page.locator(selector).first();
        break;
      }
    } catch (e) {
      // Try next selector
    }
  }
  
  if (!searchInput) {
    return {
      success: false,
      error: 'SEARCH_INPUT_NOT_FOUND',
      message: 'Could not find the Marketplace search input',
      hint: 'Try waiting longer for the page to load'
    };
  }
  
  // Clear and fill search
  await searchInput.clear();
  await searchInput.fill(query);
  await page.waitForTimeout(500);
  
  // Press Enter to search
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);
  
  // Apply filters if provided
  if (priceMin !== undefined || priceMax !== undefined || condition || radius) {
    await applyFilters(page, { priceMin, priceMax, condition, radius });
  }
  
  // Apply sort if provided
  if (sortBy) {
    await applySort(page, sortBy);
  }
  
  // Wait for results to load
  await page.waitForTimeout(2000);
  
  // Extract results
  const results = await extractResults(page);
  
  // Take verification screenshot
  let screenshotPath = null;
  if (verifyScreenshot) {
    const timestamp = Date.now();
    screenshotPath = `/home/ubuntu/.openclaw/workspace/data/screenshots/marketplace_search_${query.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.png`;
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

async function applyFilters(page, { priceMin, priceMax, condition, radius }) {
  try {
    // Click on "Filters" button if visible
    const filterBtn = page.locator('text=Filters').or(page.locator('[aria-label*="Filter"]')).first();
    if (await filterBtn.isVisible({ timeout: 2000 })) {
      await filterBtn.click();
      await page.waitForTimeout(1000);
      
      // Apply price filters if provided
      if (priceMin !== undefined) {
        const minInput = page.locator('input[placeholder*="Min"]').or(page.locator('input[id*="min"]'));
        if (await minInput.isVisible({ timeout: 1000 })) {
          await minInput.fill(String(priceMin));
        }
      }
      
      if (priceMax !== undefined) {
        const maxInput = page.locator('input[placeholder*="Max"]').or(page.locator('input[id*="max"]'));
        if (await maxInput.isVisible({ timeout: 1000 })) {
          await maxInput.fill(String(priceMax));
        }
      }
      
      // Apply condition if provided
      if (condition) {
        const conditionMap = {
          'new': 'New',
          'used': 'Used',
          'used_like_new': 'Used - Like New'
        };
        const conditionText = conditionMap[condition] || condition;
        const conditionBtn = page.locator(`text="${conditionText}"`).first();
        if (await conditionBtn.isVisible({ timeout: 1000 })) {
          await conditionBtn.click();
        }
      }
      
      // Click Apply
      const applyBtn = page.locator('text=Apply').or(page.locator('[aria-label*="Apply"]')).first();
      if (await applyBtn.isVisible({ timeout: 1000 })) {
        await applyBtn.click();
        await page.waitForTimeout(1500);
      }
    }
  } catch (e) {
    // Filters not available, continue without them
  }
}

async function applySort(page, sortBy) {
  try {
    const sortBtn = page.locator('text=Sort').or(page.locator('[aria-label*="Sort"]')).first();
    if (await sortBtn.isVisible({ timeout: 2000 })) {
      await sortBtn.click();
      await page.waitForTimeout(1000);
      
      const sortMap = {
        'newest': 'Newest',
        'price_asc': 'Price: Low to High',
        'price_desc': 'Price: High to Low',
        'relevance': 'Relevance'
      };
      
      const sortText = sortMap[sortBy] || sortBy;
      const option = page.locator(`text="${sortText}"`).first();
      if (await option.isVisible({ timeout: 1000 })) {
        await option.click();
        await page.waitForTimeout(1500);
      }
    }
  } catch (e) {
    // Sort not available, continue
  }
}

async function extractResults(page) {
  const results = [];
  
  try {
    // Find all listing links
    const listingLinks = await page.locator('a[href*="/marketplace/item/"]').all();
    
    for (const link of listingLinks.slice(0, 50)) { // Limit to 50 results
      try {
        const href = await link.getAttribute('href');
        const text = await link.textContent();
        
        // Step 1: Extract price first (before messing with location)
        const allPrices = text.match(/\$[\d,]+(?:\.\d{2})?/g) || [];
        // Use the price closest to the start of text (usually the listing price)
        const price = allPrices.length > 0 ? allPrices[0] : null;
        
        // Step 2: Remove price from text to simplify location extraction
        let textWithoutPrice = text;
        for (const p of allPrices) {
          textWithoutPrice = textWithoutPrice.replace(p, ' ');
        }
        
        // Step 3: Find location at end (using cleaned text)
        const stateMatch = textWithoutPrice.match(/, ([A-Z]{2})$/);
        let location = null;
        let beforeLocation = '';
        
        if (stateMatch) {
          const commaIndex = stateMatch.index;
          const state = stateMatch[1];
          const beforeComma = textWithoutPrice.slice(0, commaIndex);
          
          // Find city start by looking backwards for transition
          let cityStart = -1;
          
          for (let i = commaIndex - 1; i >= 0; i--) {
            const curr = beforeComma[i];
            const next = beforeComma[i + 1];
            
            if (curr === ' ' && /[A-Z]/.test(next)) {
              cityStart = i + 1;
              break;
            }
            if (/[a-z]/.test(curr) && /[A-Z]/.test(next)) {
              cityStart = i + 1;
              break;
            }
          }
          
          if (cityStart < 0) {
            const lastSpace = beforeComma.lastIndexOf(' ');
            cityStart = Math.max(0, lastSpace + 1);
          }
          
          location = beforeComma.slice(cityStart) + ', ' + state;
          beforeLocation = beforeComma.slice(0, cityStart);
        }
        
        // Step 4: Title = everything before location
        let title = beforeLocation || textWithoutPrice;
        
        // Clean up
        title = title
          .replace(/^Just listed\s*/i, '')
          .replace(/^Partner listing\s*/i, '')
          .replace(/^[\s—–-]+/, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 100);
        
        if (title && price) {
          results.push({
            title,
            price,
            location,
            url: href?.startsWith('http') ? href : `https://www.facebook.com${href}`
          });
        }
      } catch (e) {
        // Skip this card
      }
    }
  } catch (e) {
    // No results found
  }
  
  return results;
}

module.exports = marketplaceSearch;
