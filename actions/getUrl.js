const { getPage } = require('../browser/manager');

async function getUrl() {
  const page = await getPage();
  return {
    success: true,
    url: page.url(),
    message: `Current URL: ${page.url()}`
  };
}

module.exports = getUrl;
