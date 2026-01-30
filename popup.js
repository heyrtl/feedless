// Variables to track UI elements
let toggleCheckbox;
// let newsToggleCheckbox; // Commented out for future update
let statusText;
// let newsStatusText; // Commented out for future update

// Safe wrapper for chrome API calls
function safeExecute(fn) {
  try {
    return fn();
  } catch (error) {
    console.error('Error executing function:', error);
    return null;
  }
}

// Safe way to check if we're on LinkedIn
function isLinkedInPage(tab) {
  try {
    return tab && tab.url && tab.url.includes('linkedin.com');
  } catch (error) {
    console.error('Error checking LinkedIn page:', error);
    return false;
  }
}

// Safe Chrome API wrappers
function safeSendMessage(tabId, message, callback) {
  try {
    chrome.tabs.sendMessage(tabId, message, function(response) {
      if (chrome.runtime.lastError) {
        console.log('Message error:', chrome.runtime.lastError.message);
        if (callback) callback(null);
        return;
      }
      
      if (callback) callback(response);
    });
  } catch (error) {
    console.error('Error sending message:', error);
    if (callback) callback(null);
  }
}

function safeTabsQuery(callback) {
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (chrome.runtime.lastError) {
        console.error('Error querying tabs:', chrome.runtime.lastError);
        callback([]);
        return;
      }
      
      callback(tabs);
    });
  } catch (error) {
    console.error('Error in tabs query:', error);
    callback([]);
  }
}

function safeStorageGet(keys, callback) {
  try {
    chrome.storage.local.get(keys, function(result) {
      if (chrome.runtime.lastError) {
        console.error('Error getting from storage:', chrome.runtime.lastError);
        callback({});
        return;
      }
      
      callback(result);
    });
  } catch (error) {
    console.error('Error in storage get:', error);
    callback({});
  }
}

function safeStorageSet(data, callback) {
  try {
    chrome.storage.local.set(data, function() {
      if (chrome.runtime.lastError) {
        console.error('Error setting storage:', chrome.runtime.lastError);
        if (callback) callback(false);
        return;
      }
      
      if (callback) callback(true);
    });
  } catch (error) {
    console.error('Error in storage set:', error);
    if (callback) callback(false);
  }
}

// Initialize popup
function initializePopup() {
  // Get DOM elements
  toggleCheckbox = document.getElementById('feed-blocker-toggle');
  // newsToggleCheckbox = document.getElementById('news-blocker-toggle'); // Commented out for future update
  statusText = document.getElementById('status-text');
  // newsStatusText = document.getElementById('news-status-text'); // Commented out for future update
  
  if (!toggleCheckbox || !statusText) {
    console.error('Could not find required DOM elements');
    return;
  }
  
  // Set up event listeners
  toggleCheckbox.addEventListener('change', handleFeedToggle);
  // newsToggleCheckbox.addEventListener('change', handleNewsToggle); // Commented out for future update
  
  // Get current state
  getCurrentState();
}

// Handle feed toggle changes
function handleFeedToggle() {
  const isEnabled = toggleCheckbox.checked;
  
  // Update UI immediately for better UX
  updateStatusText(isEnabled);
  
  // Save state to storage first to ensure persistence
  safeStorageSet({ feedBlockerEnabled: isEnabled });
  
  // Send message to content script if on LinkedIn
  safeTabsQuery(function(tabs) {
    if (tabs.length === 0) return;
    
    if (isLinkedInPage(tabs[0])) {
      safeSendMessage(
        tabs[0].id, 
        { action: 'toggleFeedBlocker', enabled: isEnabled }
      );
    }
  });
}

/* 
// Handle news toggle changes - Commented out for future update
function handleNewsToggle() {
  const isEnabled = newsToggleCheckbox.checked;
  
  // Update UI immediately
  updateNewsStatusText(isEnabled);
  
  // Save state to storage
  safeStorageSet({ newsBlockerEnabled: isEnabled });
  
  // Send message to content script if on LinkedIn
  safeTabsQuery(function(tabs) {
    if (tabs.length === 0) return;
    
    if (isLinkedInPage(tabs[0])) {
      safeSendMessage(
        tabs[0].id, 
        { action: 'toggleNewsBlocker', enabled: isEnabled }
      );
    }
  });
}
*/

// Get current state from content script or storage
function getCurrentState() {
  safeTabsQuery(function(tabs) {
    if (tabs.length === 0) {
      fallbackToStorageState();
      return;
    }
    
    if (isLinkedInPage(tabs[0])) {
      // Ask content script for current state
      safeSendMessage(tabs[0].id, { action: 'getState' }, function(response) {
        if (!response) {
          // No response, fallback to storage
          fallbackToStorageState();
          return;
        }
        
        // Update UI based on response
        if (response.enabled !== undefined) {
          toggleCheckbox.checked = response.enabled;
          updateStatusText(response.enabled);
        } else {
          fallbackToStorageState();
        }
        
        /* Commented out for future update
        if (response.newsEnabled !== undefined) {
          newsToggleCheckbox.checked = response.newsEnabled;
          updateNewsStatusText(response.newsEnabled);
        } else {
          fallbackToNewsStorageState();
        }
        */
      });
    } else {
      // Not on LinkedIn, use storage
      fallbackToStorageState();
      // fallbackToNewsStorageState(); // Commented out for future update
    }
  });
}

// Fallback to storage for feed state
function fallbackToStorageState() {
  safeStorageGet(['feedBlockerEnabled'], function(result) {
    // Default to enabled if not set
    const isEnabled = result.feedBlockerEnabled === undefined ? true : result.feedBlockerEnabled;
    
    if (toggleCheckbox) {
      toggleCheckbox.checked = isEnabled;
      updateStatusText(isEnabled);
    }
  });
}

/*
// Fallback to storage for news state - Commented out for future update
function fallbackToNewsStorageState() {
  safeStorageGet(['newsBlockerEnabled'], function(result) {
    // Default to enabled if not set
    const isEnabled = result.newsBlockerEnabled === undefined ? true : result.newsBlockerEnabled;
    
    if (newsToggleCheckbox) {
      newsToggleCheckbox.checked = isEnabled;
      updateNewsStatusText(isEnabled);
    }
  });
}
*/

// Update feed status UI
function updateStatusText(isEnabled) {
  if (!statusText) return;
  
  statusText.textContent = isEnabled ? 'Feed blocker is enabled' : 'Feed blocker is disabled';
  statusText.className = 'status ' + (isEnabled ? 'enabled' : 'disabled');
}

/*
// Update news status UI - Commented out for future update
function updateNewsStatusText(isEnabled) {
  if (!newsStatusText) return;
  
  newsStatusText.textContent = isEnabled ? 'News blocker is enabled' : 'News blocker is disabled';
  newsStatusText.className = 'status ' + (isEnabled ? 'enabled' : 'disabled');
}
*/

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializePopup);

// Error handling for the entire popup
window.addEventListener('error', function(event) {
  console.error('Global error:', event.error);
});