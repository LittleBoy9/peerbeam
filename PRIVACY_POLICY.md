# Privacy Policy for PeerBeam

**Last Updated:** December 7, 2024

## Overview

PeerBeam is a peer-to-peer (P2P) chat extension that enables direct communication between browser tabs using WebRTC technology. We are committed to protecting your privacy and being transparent about our data practices.

## Data Collection

### What We Collect

**PeerBeam does not collect, store, or transmit any personal data to external servers.**

The only data stored locally on your device:
- **Username:** Your chosen display name, stored locally in your browser using Chrome's storage API

### What We Do NOT Collect

- No chat messages are stored or logged
- No browsing history
- No personal information
- No analytics or tracking data
- No cookies

## How PeerBeam Works

PeerBeam uses:

1. **WebRTC (Web Real-Time Communication):** Messages are sent directly between browsers (peer-to-peer) without passing through any central server. Your messages go directly from your browser to the recipient's browser.

2. **BroadcastChannel API:** Used for signaling between tabs on the same device. This data never leaves your computer.

3. **Google STUN Servers:** Used only to establish the initial peer-to-peer connection (NAT traversal). STUN servers help peers discover their public IP addresses to establish direct connections. No message content is ever sent through these servers.

## Data Storage

- **Local Storage Only:** Your username is stored locally on your device using Chrome's storage.local API
- **No Cloud Storage:** We do not store any data on external servers
- **No Accounts:** PeerBeam does not require account creation

## Data Sharing

We do not share any data with third parties because we do not collect any data.

## Permissions Explained

PeerBeam requests the following browser permissions:

| Permission | Purpose |
|------------|---------|
| `storage` | To save your username locally on your device |
| `<all_urls>` | Required for content script to enable P2P communication across different websites |

## Security

- All WebRTC connections are encrypted by default using DTLS (Datagram Transport Layer Security)
- Messages are transmitted directly between peers without intermediary servers
- No data is stored on external servers

## Children's Privacy

PeerBeam does not knowingly collect any information from children under 13 years of age.

## Changes to This Policy

We may update this Privacy Policy from time to time. Any changes will be reflected in the "Last Updated" date at the top of this policy.

## Contact

If you have any questions about this Privacy Policy, please contact us by opening an issue on our GitHub repository.

## Your Rights

Since we don't collect personal data, there is no personal data to access, modify, or delete. Your locally stored username can be cleared by:
1. Clearing extension data in your browser settings
2. Uninstalling the extension

---

**Summary:** PeerBeam is designed with privacy in mind. Your messages are sent directly to other users via encrypted peer-to-peer connections. We don't collect, store, or have access to your messages or personal data.
