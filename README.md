# Hailmary

**Structured browser automation framework with deterministic tool calls — and an intelligent orchestrator that maps pages and reasons through them.**

## The Problem

Current browser automation is messy:
- Scripts scattered everywhere, inconsistent interfaces
- Model has to guess/hope instead of knowing exactly what elements exist
- No comprehensive page map — tools work blind, taking screenshots and hoping

## The Solution

1. **Clean tool definitions** — every action has a clear contract
2. **Deterministic execution** — same input → same action → same result
3. **`bn_map_page_deep`** — comprehensive page mapper that runs BEFORE any action
   - Triggers lazy loads via scrolling
   - Extracts ALL elements: inputs, buttons, links, images, headings, forms, lists, modals, ARIA elements
   - Every element has exact attributes, selectors, visibility, position
   - No more guessing — tools read the map and act precisely
4. **Orchestrator** — sub-agent that takes a goal, maps the page, reasons, and executes

## Structure

```
hailmary/
├── index.js              # Main entry - executeTool(), orchestrate()
├── orchestrator.js       # AI orchestrator - goal → map → reason → act
├── browser/
│   └── manager.js       # Browser lifecycle (launch/close/getPage)
├── actions/
│   ├── bn_map_page_deep.js  # ⭐ Comprehensive page mapper
│   ├── navigate.js       # Go to URL
│   ├── click.js          # Click element (selector or text)
│   ├── type.js           # Type into inputs
│   ├── screenshot.js     # Take screenshots
│   ├── getText.js        # Extract text
│   ├── getUrl.js         # Get current URL
│   ├── wait.js           # Wait/delay
│   ├── pressKey.js       # Press keyboard keys
│   ├── login.js          # Facebook login
│   ├── marketplaceSearch.js  # FB Marketplace search
│   └── analyzeProduct.js # Analyze listing details
└── schema/
    └── tools.json        # Tool definitions for the model
```

## Core Loop

```
User goal → bn_map_page_deep → Get full page map → Reason with model → Execute actions → Done
```

**Every action on a new page starts with `bn_map_page_deep`.** The orchestrator maps first, then decides.

## bn_map_page_deep

Comprehensive page mapper. Extracts:

| Category | Details |
|----------|---------|
| `inputs` | type, name, id, placeholder, value, disabled, aria-label, autocomplete |
| `buttons` | text, type, disabled, aria-label, aria-pressed |
| `links` | href, target, text, aria-label |
| `images` | src, alt, naturalWidth/Height, lazy status |
| `headings` | h1-h6 with text and position |
| `forms` | action, method, input count |
| `lists` | ul/ol with up to 50 items |
| `modals` | dialog elements, open state |
| `clickable` | divs/spans with click handlers or role=button |
| `searchable` | search inputs with exact selectors |
| `ariaElements` | all elements with ARIA roles |
| `disabledElements` | disabled form controls |
| `lazyImages` | not-yet-loaded images |

Returns `summary` (quick stats + top headings + search inputs) and full `map` (all elements with rect positions and attributes).

## Orchestrator

Sub-agent that takes a natural language goal and executes browser actions autonomously.

```javascript
const { orchestrate } = require('hailmary');

const result = await orchestrate({
  goal: 'search for ps5 in los angeles on facebook marketplace',
  url: 'https://www.facebook.com/marketplace',
  apiKey: 'your-openai-or-minimax-api-key',  // optional — falls back to env
  model: 'MiniMax-M2.7',                      // optional
  maxSteps: 5                                 // optional, default 5
});

console.log(result.success);     // true/false
console.log(result.finalUrl);    // final URL after all steps
console.log(result.results);     // array of step results with reasoning
```

The orchestrator:
1. Navigates to URL
2. Runs `bn_map_page_deep`
3. Sends map + goal to the model
4. Model outputs a JSON plan with reasoning + actions
5. Executes the actions
6. Repeats until done or max steps

## Available Tools

| Tool | Description | Key Params |
|------|-------------|------------|
| `navigate` | Go to a URL | `url`, `waitUntil`, `timeout` |
| `bn_map_page_deep` | ⭐ Map all page elements | `maxScrolls`, `scrollDelay` |
| `click` | Click element | `selector` OR `text`, `index` |
| `type` | Type text | `selector`, `text`, `pressEnter` |
| `screenshot` | Take screenshot | `filename`, `fullPage` |
| `getText` | Get text content | `selector` (optional) |
| `getUrl` | Get current URL | - |
| `wait` | Wait time | `milliseconds` |
| `pressKey` | Press key | `key` |
| `login` | Facebook login | `cookieFile` (auto) |
| `loginAndSearch` | Login + search | `site`, `searchTerm` |
| `marketplaceSearch` | Search Marketplace | `query`, `location` |
| `analyzeProduct` | Analyze listing | `url` |
| `enterPin` | Enter 2FA PIN | `pin` |

## CLI Usage

```bash
# Direct tool execution
node index.js navigate '{"url":"https://facebook.com/marketplace"}'
node index.js bn_map_page_deep '{}'
node index.js screenshot '{"filename":"page.png"}'

# Orchestrator (goal + url)
node orchestrator.js "search for ps5" "https://www.facebook.com/marketplace"
```

## Design Principles

1. **Map first, act second** — Never guess what elements exist
2. **Deterministic** — No randomness. Clear success/failure.
3. **Schema-first** — The tool definition IS the contract.
4. **Fail fast** — Return clear error messages.
5. **Composable** — Actions chain in sequences.
6. **No magic** — Explicit is better than implicit.

## Status

🚧 Under active development. `bn_map_page_deep` and orchestrator are new.
