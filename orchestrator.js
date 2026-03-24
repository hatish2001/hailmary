/**
 * hailMARY Orchestrator v2
 * 
 * Designed to be spawned as a sub-agent via sessions_spawn.
 * Gets a goal + URL, maps the page, reasons with the model, executes.
 */

const { getPage } = require('./browser/manager');
const navigate = require('./actions/navigate');
const bn_map_page_deep = require('./actions/bn_map_page_deep');
const click = require('./actions/click');
const type = require('./actions/type');
const wait = require('./actions/wait');
const pressKey = require('./actions/pressKey');
const screenshot = require('./actions/screenshot');
const getUrl = require('./actions/getUrl');
const getText = require('./actions/getText');

// Map tool names to action functions
const ACTIONS = {
  navigate,
  bn_map_page_deep,
  click,
  type,
  wait,
  pressKey,
  screenshot,
  getUrl,
  getText,
};

// Aliases for model convenience
const ALIASES = {
  press: 'pressKey',
  enter: 'pressKey',
  submit: 'pressKey',
  pressEnter: 'pressKey',
};

// ─── ORCHESTRATOR PROMPT ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a browser automation orchestrator. You have:
1. A comprehensive map of ALL elements on the current page
2. A user goal in natural language

Your job:
1. Understand what the user wants
2. Look at the page map to find the RIGHT element
3. Decide the sequence of actions (navigate, click, type, screenshot, etc.)
4. Be precise — use exact selectors from the map

Output a JSON plan (no markdown, just raw JSON):
{
  "reasoning": "why I'm choosing this approach",
  "actions": [
    { "tool": "click", "params": { "selector": "CSS or ARIA selector" } },
    { "tool": "type", "params": { "selector": "CSS selector", "text": "what to type" } },
    { "tool": "wait", "params": { "ms": 2000 } },
    { "tool": "navigate", "params": { "url": "..." } },
    ...
  ],
  "done": false,
  "outcome": "what should happen after these actions"
}

Selectors (in order of preference):
1. \`[aria-label="Exact Label"]\` — most reliable
2. \`#elementId\` — if element has an ID
3. \`input[placeholder="Exact Placeholder"]\` — for form fields
4. \`button:has-text("Button Text")\` — for buttons
5. \`a:has-text("Link Text")\` — for links
6. \`[role="button"]\` — for clickable divs

IMPORTANT:
- If the goal is to SEARCH on a specific SITE, use that site's search input (e.g. "Search Marketplace" NOT "Search Facebook")
- If multiple similar elements exist, prefer the most specific one
- done=true means the task is complete
- max 5 action steps per plan`;

const USER_PROMPT = `=== USER GOAL ===
"{goal}"

=== CURRENT PAGE ===
URL: {url}
Title: {title}
Viewport: {viewport.width}x{viewport.height}
ScrollHeight: {scrollHeight}

=== ELEMENT MAP ===
Counts: {counts}

=== Inputs ===
{inputs}

=== Buttons ===
{buttons}

=== Links ===
{links}

=== Clickable (non-button/links) ===
{clickable}

=== Search Inputs ===
{searchInputs}

=== Modals/Open ===
{modals}

=== OUTPUT (JSON only) ===`;

// ─── BUILD CONTEXT ─────────────────────────────────────────────────────────

function buildContext({ goal, map, summary }) {
  const counts = Object.entries(summary.counts).filter(([,v]) => v > 0)
    .map(([k,v]) => `${k}: ${v}`).join(', ');

  const inputs = map.inputs.slice(0, 8).map(i => 
    `  [${i.type}] placeholder="${i.placeholder || ''}" name=${i.name} id="${i.attrs.id || ''}" role=${i.attrs.role || 'none'} aria-label="${i.attrs['aria-label'] || ''}"`
  ).join('\n');

  const buttons = map.buttons.slice(0, 8).map(b =>
    `  text="${b.text}" type=${b.type} aria-label="${b.ariaLabel || ''}" role=${b.role}`
  ).join('\n');

  const links = map.links.slice(0, 8).map(l =>
    `  text="${l.text}" href="${(l.href || '').substring(0,60)}"`
  ).join('\n');

  const clickable = map.clickable.filter(c => c.visible).slice(0, 5).map(c =>
    `  text="${c.text.substring(0,40)}" role=${c.role} aria-label="${c.ariaLabel || ''}"`
  ).join('\n');

  const searchInputs = map.inputs.filter(i => i.isSearch || i.type === 'search').map(i =>
    `  placeholder="${i.placeholder}" aria-label="${i.attrs['aria-label'] || ''}" role=${i.attrs.role || 'none'}`
  ).join('\n');

  const modals = map.modals.map(m =>
    `  ${m.tag} open=${m.open} aria-label="${m.ariaLabel || ''}"`
  ).join('\n');

  return USER_PROMPT
    .replace('{goal}', goal)
    .replace('{url}', map.url)
    .replace('{title}', map.title)
    .replace('{viewport.width}', map.viewport.width)
    .replace('{viewport.height}', map.viewport.height)
    .replace('{scrollHeight}', map.scrollHeight)
    .replace('{counts}', counts)
    .replace('{inputs}', inputs || '  (none)')
    .replace('{buttons}', buttons || '  (none)')
    .replace('{links}', links || '  (none)')
    .replace('{clickable}', clickable || '  (none)')
    .replace('{searchInputs}', searchInputs || '  (none)')
    .replace('{modals}', modals || '  (none)');
}

// ─── EXECUTE SINGLE ACTION ──────────────────────────────────────────────────

async function executeAction(toolName, params) {
  const resolved = ALIASES[toolName] || toolName;
  
  // Auto-fill params for special aliases
  let resolvedParams = { ...params };
  if (toolName === 'pressEnter' && Object.keys(resolvedParams).length === 0) {
    resolvedParams = { key: 'Enter' };
  }
  if ((toolName === 'press' || toolName === 'enter') && Object.keys(resolvedParams).length === 0) {
    resolvedParams = { key: 'Enter' };
  }
  
  const action = ACTIONS[resolved];
  if (!action) {
    return { success: false, error: 'UNKNOWN_TOOL', message: `Unknown tool: ${resolved} (tried ${toolName})` };
  }
  try {
    return await action(resolvedParams);
  } catch (e) {
    return { success: false, error: 'EXECUTION_ERROR', message: e.message };
  }
}

// ─── EXECUTE SEQUENCE ───────────────────────────────────────────────────────

async function executeSequence(actions) {
  const results = [];
  for (const { tool, params } of actions) {
    const result = await executeAction(tool, params);
    results.push({ tool, params, result });
    if (!result.success && result.error) {
      console.log(`[ORCHESTRATOR] ${tool} failed: ${result.message}`);
    }
  }
  return results;
}

// ─── CALL MODEL ─────────────────────────────────────────────────────────────

async function callModel({ baseUrl, model, apiKey, system, user }) {
  const isMinimax = baseUrl.includes('minimaxi');
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.1,
  };
  
  if (isMinimax) {
    body.tokens_to_generate = 400;
  } else {
    body.max_tokens = 600;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  let json = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) json = jsonMatch[1];
  const objectMatch = json.match(/\{[\s\S]*\}/);
  if (objectMatch) json = objectMatch[0];
  
  return JSON.parse(json.trim());
}

// ─── ORCHESTRATE STEP ───────────────────────────────────────────────────────

async function orchestrateStep({ goal, map, summary, apiKey, model }) {
  const context = buildContext({ goal, map, summary });
  const resolvedApiKey = apiKey || process.env.MINIMAX_API_KEY || process.env.MINIMAX_API_TOKEN;
  
  if (!resolvedApiKey) {
    return { error: 'No API key provided and MINIMAX_API_KEY not set in environment', actions: [] };
  }

  const isOpenAI = apiKey && apiKey.startsWith('sk-') && !apiKey.includes('minimax');
  
  let plan;
  if (isOpenAI) {
    try {
      plan = await callModel({ 
        baseUrl: 'https://api.openai.com/v1',
        model: model || 'gpt-4o',
        apiKey,
        system: SYSTEM_PROMPT,
        user: context
      });
    } catch (e) {
      return { error: `Model API failed: ${e.message}`, actions: [] };
    }
  } else {
    try {
      plan = await callModel({
        baseUrl: 'https://api.minimaxi.chat/v1',
        model: model || 'MiniMax-M2.7',
        apiKey: resolvedApiKey,
        system: SYSTEM_PROMPT,
        user: context
      });
    } catch (e) {
      return { error: `Minimax API failed: ${e.message}`, actions: [] };
    }
  }

  if (!plan || !plan.actions) {
    return { error: 'No valid plan from model', actions: [], done: true };
  }

  return {
    reasoning: plan.reasoning || '',
    actions: plan.actions,
    done: plan.done || false,
    outcome: plan.outcome || ''
  };
}

// ─── FULL ORCHESTRATION LOOP ────────────────────────────────────────────────

async function orchestrate({ goal, url, apiKey = null, model = null, maxSteps = 5 } = {}) {
  const stepResults = [];
  let currentUrl = url;
  let currentGoal = goal;

  for (let step = 0; step < maxSteps; step++) {
    // 1. Navigate if needed
    if (step === 0 || currentUrl !== url) {
      const nav = await executeAction('navigate', { url: currentUrl });
      if (!nav.success) {
        return { success: false, message: `Navigate failed: ${nav.message}`, steps: stepResults };
      }
      currentUrl = nav.url;
    }

    // 2. Map the page
    const mapResult = await executeAction('bn_map_page_deep', { maxScrolls: 10, scrollDelay: 800 });
    if (!mapResult.success) {
      return { success: false, message: `Map failed: ${mapResult.message}`, steps: stepResults };
    }

    const { map, summary } = mapResult;

    // 3. Get plan from model
    const planResult = await orchestrateStep({
      goal: currentGoal,
      map,
      summary,
      apiKey,
      model
    });

    if (planResult.error) {
      return { 
        success: false, 
        message: planResult.error, 
        steps: stepResults,
        map: summary 
      };
    }

    // 4. Execute actions
    const execResults = await executeSequence(planResult.actions);

    stepResults.push({
      step: step + 1,
      reasoning: planResult.reasoning,
      actions: planResult.actions.map((a, i) => ({
        tool: a.tool,
        params: a.params,
        success: execResults[i]?.result?.success
      })),
      execResults: execResults.map(r => ({
        tool: r.tool,
        success: r.result.success,
        message: r.result.message || r.result.url || ''
      }))
    });

    // 5. Check if done
    if (planResult.done) {
      return {
        success: true,
        goal,
        steps: stepResults.length,
        finalUrl: currentUrl,
        results: stepResults,
        outcome: planResult.outcome
      };
    }

    // 6. If navigate was called, update URL
    const navAction = planResult.actions.find(a => a.tool === 'navigate');
    if (navAction?.params?.url) {
      currentUrl = navAction.params.url;
    }

    // 7. Wait for page to settle
    await new Promise(r => setTimeout(r, 1500));
  }

  return {
    success: true,
    goal,
    steps: stepResults.length,
    finalUrl: currentUrl,
    results: stepResults,
    outcome: 'Max steps reached'
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node orchestrator.js "<goal>" "<url>" [apiKey]');
    console.log('Example: node orchestrator.js "search for ps5" "https://facebook.com/marketplace"');
    return;
  }
  
  const [goal, url, apiKey] = args;
  console.log(`[ORCHESTRATOR] Goal: ${goal}`);
  console.log(`[ORCHESTRATOR] URL: ${url}\n`);
  
  const result = await orchestrate({ goal, url, apiKey: apiKey || null });
  console.log(JSON.stringify({
    success: result.success,
    goal: result.goal,
    steps: result.steps,
    finalUrl: result.finalUrl,
    outcome: result.outcome,
    results: result.results
  }, null, 2));
}

module.exports = { orchestrate, orchestrateStep };

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
