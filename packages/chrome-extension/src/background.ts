/**
 * Background Service Worker for Moni Browser Agent Helper.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Moni Chrome Extension] Installed successfully.');
});

// Bridge messages between popup and browser tabs if needed
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ status: 'PONG', timestamp: Date.now() });
    return true;
  }
  return false;
});
