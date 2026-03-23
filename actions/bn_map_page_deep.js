const { getPage } = require('../browser/manager');

/**
 * bn_map_page_deep — Comprehensive lightweight page mapper
 * 
 * Runs BEFORE any action on a page to build a complete map of all elements.
 * Triggers lazy loads via scrolling, extracts all semantic elements with
 * their attributes, text content, roles, and actionable properties.
 * 
 * This replaces screenshot-guessing with precise, structured data.
 */

async function bn_map_page_deep({ maxScrolls = 15, scrollDelay = 800 } = {}) {
  const page = await getPage();
  
  const startUrl = page.url();
  const startTitle = await page.title();
  const viewportSize = page.viewportSize();

  // ─── SCROLL TO TRIGGER LAZY LOADS ─────────────────────────────────────────
  // Scroll in increasing increments, triggering lazy-loaded content (infinite
  // scroll feeds, image lazy loads, "load more" triggers, etc.)
  let lastScrollHeight = 0;
  let scrollCount = 0;
  let totalScrolls = 0;

  while (scrollCount < maxScrolls) {
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    const scrollTop = await page.evaluate(() => window.pageYOffset);
    const clientHeight = await page.evaluate(() => window.innerHeight);

    // If we can't scroll further, stop
    if (scrollHeight <= scrollTop + clientHeight + 10) break;

    // Scroll by 3x viewport to catch lazy content
    const scrollBy = Math.min(clientHeight * 3, scrollHeight - scrollTop - clientHeight);
    if (scrollBy <= 0) break;

    await page.evaluate((by) => window.scrollBy(0, by), scrollBy);
    await page.waitForTimeout(scrollDelay);
    
    const newScrollHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newScrollHeight === lastScrollHeight && scrollCount > 2) {
      // Content has settled, no more lazy loads
      break;
    }
    lastScrollHeight = newScrollHeight;
    scrollCount++;
    totalScrolls++;
  }

  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  // ─── EXTRACT COMPREHENSIVE ELEMENT MAP ─────────────────────────────────────
  const map = await page.evaluate(() => {
    const result = {
      url: window.location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      scrollHeight: document.body.scrollHeight,
      inputs: [],
      textareas: [],
      selects: [],
      buttons: [],
      links: [],
      images: [],
      headings: [],
      forms: [],
      lists: [],
      iframes: [],
      tables: [],
      details: [],        // <details> expandables
      modals: [],         // dialog/modals
      clickable: [],      // divs/spans with click handlers or role=button
      searchable: [],     // elements that look like search
      nav: [],            // nav elements
      articles: [],       // article elements
      sections: [],       // section elements
      footers: [],        // footer elements
      lazyImages: [],     // images with loading="lazy" or not loaded yet
      lazyLoaded: [],     // images that were lazy loaded during scroll
      elementsWithHandlers: [],
      disabledElements: [],
      hiddenElements: [],
      ariaElements: [],   // elements with ARIA roles
    };

    // Helper: get visibility
    function isVisible(el) {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none') return false;
      if (style.visibility === 'hidden') return false;
      if (style.opacity === '0') return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      return true;
    }

    // Helper: get text content (trimmed, no excess whitespace)
    function getText(el) {
      if (!el) return '';
      return (el.textContent || '').replace(/\s+/g, ' ').trim();
    }

    // Helper: get all attributes
    function getAttrs(el) {
      const attrs = {};
      if (!el.attributes) return attrs;
      for (const attr of el.attributes) {
        attrs[attr.name] = attr.value;
      }
      return attrs;
    }

    // Helper: get bounding rect info
    function getRect(el) {
      try {
        const rect = el.getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          left: Math.round(rect.left),
          right: Math.round(rect.right)
        };
      } catch { return null; }
    }

    // Helper: check if element has event listeners
    function hasClickHandler(el) {
      // Check common event properties
      const clickProps = ['onclick', 'onmousedown', 'onmouseup', 'ontouchstart', 'ontouchend'];
      for (const prop of clickProps) {
        if (el[prop] !== null && el[prop] !== undefined) return true;
      }
      // Check if element has clickable role
      const role = (el.getAttribute('role') || '').toLowerCase();
      const clickableRoles = ['button', 'link', 'menuitem', 'tab', 'treeitem', 'menuitemcheckbox', 'menuitemradio'];
      if (clickableRoles.includes(role)) return true;
      const tagName = el.tagName.toLowerCase();
      if (['button', 'a', 'input', 'select', 'textarea'].includes(tagName)) return true;
      return false;
    }

    // Helper: get computed role
    function getRole(el) {
      const explicitRole = el.getAttribute('role');
      if (explicitRole) return explicitRole;
      const tagName = el.tagName.toLowerCase();
      const roleMap = {
        'a': 'link',
        'button': 'button',
        'input': 'textbox',
        'select': 'listbox',
        'textarea': 'textbox',
        'nav': 'navigation',
        'header': 'banner',
        'footer': 'contentinfo',
        'article': 'article',
        'aside': 'complementary',
        'main': 'main',
        'section': 'region',
        'details': 'details',
        'dialog': 'dialog',
        'form': 'form',
      };
      return roleMap[tagName] || null;
    }

    // Helper: summarize element for storage
    function summarize(el, extra = {}) {
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: el.className || null,
        text: getText(el).substring(0, 200),
        role: getRole(el),
        attrs: getAttrs(el),
        rect: getRect(el),
        visible: isVisible(el),
        ...extra
      };
    }

    // ── INPUTS ──
    document.querySelectorAll('input').forEach(el => {
      if (!isVisible(el)) {
        result.hiddenElements.push(summarize(el, { reason: 'hidden' }));
        return;
      }
      result.inputs.push({
        ...summarize(el),
        type: el.type || 'text',
        name: el.name || null,
        id: el.id || null,
        placeholder: el.placeholder || null,
        value: el.value || null,
        disabled: el.disabled,
        readonly: el.readOnly,
        required: el.required,
        ariaLabel: el.getAttribute('aria-label') || null,
        ariaLabelledby: el.getAttribute('aria-labelledby') || null,
        ariaDescribedby: el.getAttribute('aria-describedby') || null,
        autocomplete: el.getAttribute('autocomplete') || null,
        maxLength: el.maxLength > 0 ? el.maxLength : null,
        checked: el.checked,
        // For search inputs
        isSearch: (el.type === 'search' || el.className?.toLowerCase().includes('search') || el.placeholder?.toLowerCase().includes('search')),
      });
    });

    // ── TEXTAREAS ──
    document.querySelectorAll('textarea').forEach(el => {
      if (!isVisible(el)) {
        result.hiddenElements.push(summarize(el, { reason: 'hidden' }));
        return;
      }
      result.textareas.push({
        ...summarize(el),
        name: el.name || null,
        id: el.id || null,
        placeholder: el.placeholder || null,
        value: el.value || null,
        disabled: el.disabled,
        readonly: el.readOnly,
        required: el.required,
        rows: el.rows,
        maxLength: el.maxLength > 0 ? el.maxLength : null,
      });
    });

    // ── SELECTS ──
    document.querySelectorAll('select').forEach(el => {
      if (!isVisible(el)) {
        result.hiddenElements.push(summarize(el, { reason: 'hidden' }));
        return;
      }
      const options = Array.from(el.options).map(opt => ({
        value: opt.value,
        text: opt.text,
        selected: opt.selected,
        disabled: opt.disabled
      }));
      result.selects.push({
        ...summarize(el),
        name: el.name || null,
        id: el.id || null,
        disabled: el.disabled,
        required: el.required,
        multiple: el.multiple,
        options,
        selectedIndex: el.selectedIndex,
      });
    });

    // ── BUTTONS ──
    document.querySelectorAll('button').forEach(el => {
      if (!isVisible(el)) {
        result.hiddenElements.push(summarize(el, { reason: 'hidden' }));
        return;
      }
      result.buttons.push({
        ...summarize(el),
        type: el.type || 'submit',
        name: el.name || null,
        disabled: el.disabled,
        ariaLabel: el.getAttribute('aria-label') || null,
        ariaPressed: el.getAttribute('aria-pressed') || null,
        hasPopup: el.getAttribute('aria-haspopup') || null,
      });
    });

    // ── LINKS ──
    document.querySelectorAll('a').forEach(el => {
      if (!isVisible(el)) {
        result.hiddenElements.push(summarize(el, { reason: 'hidden' }));
        return;
      }
      result.links.push({
        ...summarize(el),
        href: el.href || null,
        target: el.target || null,
        rel: el.rel || null,
        download: el.download || null,
        ariaLabel: el.getAttribute('aria-label') || null,
      });
    });

    // ── IMAGES ──
    document.querySelectorAll('img').forEach(el => {
      const isLazy = el.loading === 'lazy' || !el.complete;
      const isVisibleImg = isVisible(el);
      
      if (isLazy) {
        result.lazyImages.push({
          ...summarize(el),
          alt: el.alt || null,
          src: el.src || null,
          currentSrc: el.currentSrc || null,
          naturalWidth: el.naturalWidth,
          naturalHeight: el.naturalHeight,
          loading: el.loading,
          complete: el.complete,
          lazy: true,
        });
      }
      
      if (isVisibleImg) {
        result.images.push({
          ...summarize(el),
          alt: el.alt || null,
          src: el.src || null,
          currentSrc: el.currentSrc || null,
          naturalWidth: el.naturalWidth,
          naturalHeight: el.naturalHeight,
          loading: el.loading,
          complete: el.complete,
          lazy: isLazy,
        });
      }
    });

    // ── HEADINGS ──
    ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(tag => {
      document.querySelectorAll(tag).forEach(el => {
        if (!isVisible(el)) return;
        result.headings.push({
          ...summarize(el),
          level: parseInt(tag[1]),
          text: getText(el),
        });
      });
    });

    // ── FORMS ──
    document.querySelectorAll('form').forEach(el => {
      result.forms.push({
        ...summarize(el),
        action: el.action || null,
        method: el.method || null,
        id: el.id || null,
        name: el.name || null,
        disabled: el.disabled,
        inputCount: el.querySelectorAll('input, textarea, select, button').length,
      });
    });

    // ── LISTS ──
    document.querySelectorAll('ul, ol').forEach(el => {
      const items = Array.from(el.querySelectorAll('li')).map(li => ({
        text: getText(li),
        index: li.index,
      }));
      result.lists.push({
        ...summarize(el),
        tag: el.tagName.toLowerCase(),
        itemCount: items.length,
        items: items.slice(0, 50), // Cap at 50 items
      });
    });

    // ── IFRAMES ──
    document.querySelectorAll('iframe').forEach(el => {
      result.iframes.push({
        ...summarize(el),
        src: el.src || null,
        name: el.name || null,
        title: el.title || null,
      });
    });

    // ── TABLES ──
    document.querySelectorAll('table').forEach(el => {
      const rows = Array.from(el.querySelectorAll('tr')).slice(0, 20).map(tr => ({
        cells: Array.from(tr.querySelectorAll('td, th')).map(cell => getText(cell))
      }));
      result.tables.push({
        ...summarize(el),
        rows: rows.length,
        cols: rows[0] ? rows[0].cells.length : 0,
        headers: Array.from(el.querySelectorAll('th')).map(th => getText(th)),
      });
    });

    // ── DETAILS/SUMMARY (expandables) ──
    document.querySelectorAll('details').forEach(el => {
      result.details.push({
        ...summarize(el),
        open: el.open,
        summary: getText(el.querySelector('summary')),
      });
    });

    // ── MODALS/DIALOGS ──
    document.querySelectorAll('dialog, [role="dialog"], [role="modal"]').forEach(el => {
      result.modals.push({
        ...summarize(el),
        open: el.open || el.getAttribute('aria-expanded') === 'true',
        ariaModal: el.getAttribute('aria-modal') || el.getAttribute('role') === 'modal',
      });
    });

    // ── NAV ──
    document.querySelectorAll('nav').forEach(el => {
      result.nav.push({
        ...summarize(el),
        ariaLabel: el.getAttribute('aria-label') || null,
      });
    });

    // ── ARTICLES ──
    document.querySelectorAll('article').forEach(el => {
      result.articles.push(summarize(el));
    });

    // ── SECTIONS ──
    document.querySelectorAll('section').forEach(el => {
      result.sections.push({
        ...summarize(el),
        ariaLabel: el.getAttribute('aria-label') || null,
      });
    });

    // ── FOOTERS ──
    document.querySelectorAll('footer').forEach(el => {
      result.footers.push(summarize(el));
    });

    // ── CLICKABLE (divs/spans with click handlers or role=button) ──
    document.querySelectorAll('div, span, a, section').forEach(el => {
      const role = (el.getAttribute('role') || '').toLowerCase();
      const clickableRoles = ['button', 'link', 'menuitem', 'tab', 'treeitem', 'menuitemcheckbox', 'menuitemradio', 'option'];
      if (clickableRoles.includes(role) || hasClickHandler(el)) {
        if (!isVisible(el)) return;
        result.clickable.push({
          ...summarize(el),
          role: role || 'button',
          tabIndex: el.tabIndex,
          ariaLabel: el.getAttribute('aria-label') || null,
          ariaExpanded: el.getAttribute('aria-expanded') || null,
          ariaHaspopup: el.getAttribute('aria-haspopup') || null,
        });
      }
    });

    // ── SEARCHABLE (search-like elements) ──
    document.querySelectorAll('input[type="search"], input[placeholder*="search" i], input[aria-label*="search" i], [role="search"]').forEach(el => {
      if (!isVisible(el)) return;
      result.searchable.push({
        ...summarize(el),
        type: el.type || 'search',
        placeholder: el.placeholder || null,
        ariaLabel: el.getAttribute('aria-label') || null,
      });
    });

    // ── ARIA ELEMENTS (elements with explicit ARIA roles) ──
    document.querySelectorAll('[role]').forEach(el => {
      if (!isVisible(el)) return;
      const role = el.getAttribute('role');
      result.ariaElements.push({
        ...summarize(el),
        role,
        ariaLabel: el.getAttribute('aria-label') || null,
        ariaDescribedby: el.getAttribute('aria-describedby') || null,
        ariaExpanded: el.getAttribute('aria-expanded') || null,
        ariaSelected: el.getAttribute('aria-selected') || null,
        ariaChecked: el.getAttribute('aria-checked') || null,
        ariaDisabled: el.getAttribute('aria-disabled') || null,
      });
    });

    // ── DISABLED ELEMENTS ──
    document.querySelectorAll('[disabled], [aria-disabled="true"]').forEach(el => {
      result.disabledElements.push(summarize(el, { disabled: true }));
    });

    return result;
  });

  // ─── BUILD SUMMARY STATS ───────────────────────────────────────────────────
  const summary = {
    url: startUrl,
    title: startTitle,
    viewport: viewportSize,
    scrollsPerformed: totalScrolls,
    scrollHeight: map.scrollHeight,
    counts: {
      inputs: map.inputs.length,
      textareas: map.textareas.length,
      selects: map.selects.length,
      buttons: map.buttons.length,
      links: map.links.length,
      images: map.images.length,
      lazyImages: map.lazyImages.length,
      headings: map.headings.length,
      forms: map.forms.length,
      lists: map.lists.length,
      iframes: map.iframes.length,
      tables: map.tables.length,
      details: map.details.length,
      modals: map.modals.length,
      clickable: map.clickable.length,
      searchable: map.searchable.length,
      nav: map.nav.length,
      articles: map.articles.length,
      sections: map.sections.length,
      footers: map.footers.length,
      ariaElements: map.ariaElements.length,
      disabledElements: map.disabledElements.length,
      hiddenElements: map.hiddenElements.length,
    },
    // Top-level headings as quick reference
    topHeadings: map.headings.filter(h => h.level <= 2).map(h => ({ level: h.level, text: h.text })),
    // Search inputs
    searchInputs: map.inputs.filter(i => i.isSearch),
    // Primary form inputs
    formInputs: map.inputs.filter(i => !['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(i.type)),
  };

  return {
    success: true,
    summary,
    map,
    message: `Mapped ${startUrl} — ${totalScrolls} scrolls, found ${map.inputs.length} inputs, ${map.buttons.length} buttons, ${map.links.length} links, ${map.images.length} images`
  };
}

module.exports = bn_map_page_deep;
