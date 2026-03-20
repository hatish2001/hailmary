# Hailmary

**Structured browser automation framework with deterministic tool calls.**

The goal: Make browser automation feel like natural tool use — the model reads a clear tool definition, passes structured input, gets predictable output. No more brittle ad-hoc scripts.

## The Problem

Current browser automation is messy:
- Scripts scattered everywhere, inconsistent interfaces
- Hard to predict what will happen
- No clear schema for what actions are available
- Model has to guess/hope instead of knowing

## The Solution

Hailmary provides:
1. **Clean tool definitions** — JSON schema describing every available action
2. **Deterministic execution** — same input → same action → same result
3. **Modular actions** — each action is a standalone module
4. **Model-first design** — designed to be called by an AI, not written by one

## Structure

```
hailmary/
├── index.js           # Main entry - executeTool(toolName, params)
├── browser/
│   └── manager.js    # Browser lifecycle (launch/close/getPage)
├── actions/
│   ├── navigate.js   # Go to URL
│   ├── click.js      # Click elements
│   ├── type.js       # Type into inputs
│   ├── screenshot.js # Take screenshots
│   ├── getText.js    # Extract text
│   ├── getUrl.js     # Get current URL
│   ├── wait.js       # Wait/delay
│   └── pressKey.js   # Press keyboard keys
├── schema/
│   └── tools.json    # Tool definitions for the model
└── examples/
    └── ...
```

## Available Tools

| Tool | Description | Key Params |
|------|-------------|------------|
| `navigate` | Go to a URL | `url`, `waitUntil`, `timeout` |
| `click` | Click element | `text` OR `selector`, `index` |
| `type` | Type text | `selector`, `text`, `pressEnter` |
| `screenshot` | Take screenshot | `filename`, `fullPage` |
| `getText` | Get text content | `selector` (optional) |
| `getUrl` | Get current URL | - |
| `wait` | Wait time | `milliseconds` |
| `pressKey` | Press key | `key` |

## Usage

```javascript
const { executeTool, executeSequence, launchBrowser, closeBrowser } = require('hailmary');

async function main() {
  await launchBrowser({ headless: false, cookieFile: 'facebook' });

  await executeTool('navigate', { url: 'https://facebook.com/messages' });
  await executeTool('click', { text: 'John Smith' });
  await executeTool('screenshot', { filename: 'chat.png' });

  await closeBrowser();
}

main();
```

### CLI

```bash
node index.js navigate '{"url":"https://google.com"}'
node index.js screenshot '{"filename":"test.png"}'
node index.js getUrl '{}'
```

## Design Principles

1. **Deterministic** — No randomness. If something can fail, say so clearly.
2. **Schema-first** — The tool definition IS the contract.
3. **Fail fast** — Return clear error messages, don't silently swallow issues.
4. **Composable** — Actions can be chained in sequences.
5. **No magic** — Explicit is better than implicit.

## Status

🚧 Under active development. Currently supporting basic actions. More coming.
