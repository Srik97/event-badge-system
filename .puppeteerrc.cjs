const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer so Render doesn't delete it
  // between the build step and the runtime step.
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
