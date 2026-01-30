
# LinkedFocus

A Chrome extension that blocks the LinkedIn feed to help you stay productive and avoid endless scrolling.

## Features

- **Feed Blocker**: Hide the LinkedIn feed and replace it with a motivational message
- **Focus Mode**: Stay distracted-free while still accessing LinkedIn's core features
- **Easy Toggle**: Simple on/off switch in the extension popup
- **Persistent State**: Your preference is saved across sessions
- **Smart Detection**: Only activates on LinkedIn pages

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the project folder
5. The LinkedFocus icon will appear in your extensions menu

## Usage

1. Click the LinkedFocus icon in your Chrome toolbar
2. Toggle "Block Feed" on/off
3. Refresh your LinkedIn page to see changes
4. Use LinkedIn for messaging, job search, and networking without feed distractions

## How It Works

- **popup.js**: Manages the extension popup UI and communicates with content scripts
- **content.js**: Injects blocking logic into LinkedIn pages using MutationObservers
- **blocker.css**: Hides feed elements and styles the replacement content
- **manifest.json**: Configures extension permissions and scripts

## Technical Details

- Uses Chrome Storage API for persistent state
- Safe error handling for extension context invalidation
- Resource cleanup (intervals, timeouts, observers)
- Dynamic content detection and blocking

## Permissions

- `storage`: Saves your blocker preferences
- `activeTab`: Detects current tab for LinkedIn pages
- `https://*.linkedin.com/*`: Runs on all LinkedIn domains

---

*Created by [Ratul Rahman](https://x.com/heyrtl"Ratul on Twitter") © 2025-26*
