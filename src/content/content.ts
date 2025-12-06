// Content script for PeerBeam
// Injected into all pages to enable cross-tab P2P communication

console.log("PeerBeam content script loaded");

// Listen for messages from the extension popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ status: "ok", url: window.location.href });
  }
  return true;
});
