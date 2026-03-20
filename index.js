const { launchBrowser, closeBrowser, getPage } = require('./browser/manager');
const tools = require('./schema/tools.json');

// Import actions
const actions = {
  login: require('./actions/login'),
  marketplaceSearch: require('./actions/marketplaceSearch'),
  navigate: require('./actions/navigate'),
  click: require('./actions/click'),
  type: require('./actions/type'),
  screenshot: require('./actions/screenshot'),
  getText: require('./actions/getText'),
  getUrl: require('./actions/getUrl'),
  wait: require('./actions/wait'),
  pressKey: require('./actions/pressKey'),
  close: closeBrowser,
};

// Execute a tool by name with parameters
async function executeTool(toolName, params = {}) {
  if (!actions[toolName]) {
    return {
      success: false,
      error: 'UNKNOWN_TOOL',
      message: `Unknown tool: ${toolName}. Available tools: ${Object.keys(actions).join(', ')}`
    };
  }

  try {
    const result = await actions[toolName](params);
    return result;
  } catch (e) {
    return { 
      success: false, 
      error: 'EXECUTION_ERROR',
      message: `Error executing ${toolName}: ${e.message}` 
    };
  }
}

// Execute multiple tools in sequence
async function executeSequence(toolsToRun) {
  const results = [];
  for (const { tool, params } of toolsToRun) {
    const result = await executeTool(tool, params);
    results.push({ tool, params, result });
    if (!result.success && result.error) {
      console.log(`[HAILMARY] ${tool} failed: ${result.message}`);
    }
  }
  return results;
}

// CLI interface for testing
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node index.js <tool> [params-json]');
    console.log('Example: node index.js navigate \'{"url":"https://google.com"}\'');
    console.log('Example: node index.js login \'{"site":"facebook"}\'');
    console.log('\nAvailable tools:', Object.keys(actions).join(', '));
    return;
  }

  const [tool, paramsJson] = args;
  let params = {};
  if (paramsJson) {
    try {
      params = JSON.parse(paramsJson);
    } catch (e) {
      console.error('Invalid JSON params:', e.message);
      return;
    }
  }

  console.log(`[HAILMARY] Executing: ${tool}`);
  const result = await executeTool(tool, params);
  console.log(JSON.stringify(result, null, 2));
}

module.exports = {
  executeTool,
  executeSequence,
  tools,
  launchBrowser,
  closeBrowser
};

// Run if called directly
if (require.main === module) {
  main();
}
