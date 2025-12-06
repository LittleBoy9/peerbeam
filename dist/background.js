// Background service worker for PeerBeam
// Handles extension lifecycle and tab coordination

chrome.runtime.onInstalled.addListener(() => {
  console.log("PeerBeam extension installed");

  // Initialize default storage values
  chrome.storage.local.get(["userName"], (result) => {
    if (!result.userName) {
      chrome.storage.local.set({ userName: "" });
    }
  });
});

// Handle extension icon click (opens popup by default)
chrome.action.onClicked.addListener((tab) => {
  // Popup is configured in manifest, this is a fallback
  console.log("Extension icon clicked");
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);

  if (message.type === "GET_TAB_ID") {
    sendResponse({ tabId: sender.tab?.id });
  }

  return true; // Keep message channel open for async response
});
