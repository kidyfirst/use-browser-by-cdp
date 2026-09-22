#!/usr/bin/env node

/**
 * Reliable Chrome CDP Debugging Launcher CLI.
 * Usage: node scripts/start-chrome.js [--port=9222] [--headless]
 */

import { launchChrome, getCDPVersion, findChromeExecutable } from '../packages/cdp-driver/dist/index.js';

const args = process.argv.slice(2);
const portArg = args.find((a) => a.startsWith('--port='));
const port = portArg ? parseInt(portArg.split('=')[1], 10) : 9222;
const headless = args.includes('--headless');

async function main() {
  console.log('\n========================================');
  console.log('⚡ Moni Chrome CDP Debug Launcher');
  console.log('========================================\n');

  console.log(`🔍 Checking port ${port}...`);

  const existing = await getCDPVersion(port);
  if (existing) {
    console.log(`\n✅ Chrome is ALREADY running with CDP on port ${port}!`);
    console.log(`   Browser:   ${existing.Browser}`);
    console.log(`   WebSocket: ${existing.webSocketDebuggerUrl}`);
    console.log(`   HTTP:      http://127.0.0.1:${port}/json/version\n`);
    console.log('🎉 No need to launch again. You can now use @moni/cdp-driver or Chrome extension!\n');
    return;
  }

  const execPath = findChromeExecutable();
  if (!execPath) {
    console.error('❌ Could not locate Google Chrome or Chromium executable on your system.');
    console.error('   Please install Google Chrome or set CHROME_PATH environment variable.');
    process.exit(1);
  }

  console.log(`🚀 Found browser: ${execPath}`);
  console.log(`📦 Launching Chrome with --remote-debugging-port=${port} & --remote-allow-origins=* ...`);

  try {
    const result = await launchChrome({ port, headless });
    console.log(`\n✅ Chrome launched successfully!`);
    console.log(`   Browser:      ${result.browser}`);
    console.log(`   Port:         ${result.port}`);
    console.log(`   User Profile: ${result.userDataDir}`);
    console.log(`   WebSocket:    ${result.wsEndpoint}`);
    console.log(`   HTTP:         http://127.0.0.1:${result.port}/json/version\n`);
    console.log('🎉 Port is ready! Cookies and login state are safely preserved in ~/.moni-chrome-cdp-profile.\n');
  } catch (err) {
    console.error('\n❌ Failed to launch Chrome:', err.message);
    process.exit(1);
  }
}

main();
