(function(){"use strict";console.log("PeerBeam content script loaded"),chrome.runtime.onMessage.addListener((e,n,t)=>(e.type==="PING"&&t({status:"ok",url:window.location.href}),!0))})();
