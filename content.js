// Global variables for resource tracking
let observers = [];
let intervals = [];
let timeouts = [];
let initialized = false;

// We need to ensure Chrome APIs are available before accessing them
function isChromeAPIAvailable() {
  try {
    return typeof chrome !== 'undefined' && 
           typeof chrome.storage !== 'undefined' && 
           typeof chrome.storage.local !== 'undefined' &&
           typeof chrome.runtime !== 'undefined';
  } catch (e) {
    return false;
  }
}

// Safe wrapper for chrome.storage.local.get
function safeGet(keys, callback, retries = 1) {
  try {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        if (retries > 0 && chrome.runtime.lastError.message?.includes('Extension context invalidated')) {
          // Wait briefly and retry
          setTimeout(() => safeGet(keys, callback, retries - 1), 100);
          return;
        }
        
        console.error('Error in storage.get:', chrome.runtime.lastError);
        callback({});
        return;
      }
      
      callback(result);
    });
  } catch (e) {
    console.error('Exception in safeGet:', e);
    callback({});
  }
}

// Safe wrapper for chrome.storage.local.set
function safeSet(data, callback) {
  try {
    if (!isChromeAPIAvailable()) {
      console.log('Chrome APIs not available for storage.set');
      return false;
    }
    
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        console.log('Error in storage.set:', chrome.runtime.lastError);
        return;
      }
      if (typeof callback === 'function') {
        callback();
      }
    });
    return true;
  } catch (e) {
    console.error('Exception in safeSet:', e);
    return false;
  }
}

// Safe setTimeout wrapper that tracks timeouts
function safeSetTimeout(callback, delay) {
  try {
    const timeoutId = setTimeout(() => {
      try {
        // Remove from tracking array when executed
        const index = timeouts.indexOf(timeoutId);
        if (index > -1) {
          timeouts.splice(index, 1);
        }
        
        // Execute callback
        callback();
      } catch (e) {
        console.error('Error in timeout callback:', e);
      }
    }, delay);
    
    // Track the timeout
    timeouts.push(timeoutId);
    return timeoutId;
  } catch (e) {
    console.error('Error setting timeout:', e);
    return null;
  }
}

// Safe setInterval wrapper that tracks intervals
function safeSetInterval(callback, delay) {
  try {
    const intervalId = setInterval(() => {
      try {
        // Check if extension is still valid before executing
        if (!isChromeAPIAvailable()) {
          clearSafeInterval(intervalId);
          return;
        }
        
        // Execute callback
        callback();
      } catch (e) {
        console.error('Error in interval callback:', e);
        clearSafeInterval(intervalId);
      }
    }, delay);
    
    // Track the interval
    intervals.push(intervalId);
    return intervalId;
  } catch (e) {
    console.error('Error setting interval:', e);
    return null;
  }
}

// Clear a safely set interval
function clearSafeInterval(intervalId) {
  try {
    clearInterval(intervalId);
    const index = intervals.indexOf(intervalId);
    if (index > -1) {
      intervals.splice(index, 1);
    }
  } catch (e) {
    console.error('Error clearing interval:', e);
  }
}

// Clear a safely set timeout
function clearSafeTimeout(timeoutId) {
  try {
    clearTimeout(timeoutId);
    const index = timeouts.indexOf(timeoutId);
    if (index > -1) {
      timeouts.splice(index, 1);
    }
  } catch (e) {
    console.error('Error clearing timeout:', e);
  }
}

// Clean up all resources
function cleanupResources() {
  try {
    // Clear all intervals
    intervals.forEach(id => {
      try {
        clearInterval(id);
      } catch (e) {}
    });
    intervals = [];
    
    // Clear all timeouts
    timeouts.forEach(id => {
      try {
        clearTimeout(id);
      } catch (e) {}
    });
    timeouts = [];
    
    // Disconnect all observers
    observers.forEach(obs => {
      try {
        obs.disconnect();
      } catch (e) {}
    });
    observers = [];
    
    console.log('All resources cleaned up');
  } catch (e) {
    console.error('Error during cleanup:', e);
  }
}

// Safe DOM manipulation function
function safeManipulateElement(element, actions) {
  if (!element) return false;
  
  try {
    // Apply each action safely
    if (actions.display !== undefined) {
      element.style.display = actions.display;
    }
    
    if (actions.visibility !== undefined) {
      element.style.visibility = actions.visibility;
    }
    
    if (actions.opacity !== undefined) {
      element.style.opacity = actions.opacity;
    }
    
    if (actions.addClass) {
      element.classList.add(actions.addClass);
    }
    
    if (actions.removeClass) {
      element.classList.remove(actions.removeClass);
    }
    
    if (actions.setAttribute) {
      element.setAttribute(actions.setAttribute.name, actions.setAttribute.value);
    }
    
    if (actions.removeAttribute) {
      element.removeAttribute(actions.removeAttribute);
    }
    
    return true;
  } catch (e) {
    console.error('Error manipulating element:', e);
    return false;
  }
}

// Initialize the feed and news blockers
function initFeedBlocker() {
  // Prevent multiple initializations
  if (initialized) return;
  initialized = true;
  
  // Only run if we have access to Chrome storage API
  if (!isChromeAPIAvailable()) {
    console.log('Chrome storage API not available, aborting initialization');
    return;
  }

  // Check storage for user preferences (default to enabled)
  safeGet(['feedBlockerEnabled', 'newsBlockerEnabled'], function(result) {
    const feedEnabled = result.feedBlockerEnabled === undefined ? true : result.feedBlockerEnabled;
    const newsEnabled = result.newsBlockerEnabled === undefined ? true : result.newsBlockerEnabled;
    
    updateBlockerState(feedEnabled);
    updateNewsBlockerState(newsEnabled);
  });
  
  // Listen for messages from the popup
  try {
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
      // Verify extension context is still valid
      if (!isChromeAPIAvailable()) return;
      
      if (request.action === 'toggleFeedBlocker') {
        updateBlockerState(request.enabled);
        sendResponse({ success: true });
      } else if (request.action === 'toggleNewsBlocker') {
        updateNewsBlockerState(request.enabled);
        sendResponse({ success: true });
      } else if (request.action === 'getState') {
        safeGet(['feedBlockerEnabled', 'newsBlockerEnabled'], function(result) {
          const feedEnabled = result.feedBlockerEnabled === undefined ? true : result.feedBlockerEnabled;
          const newsEnabled = result.newsBlockerEnabled === undefined ? true : result.newsBlockerEnabled;
          sendResponse({ 
            enabled: feedEnabled,
            newsEnabled: newsEnabled
          });
        });
        return true; // Keep the message channel open for the async response
      }
    });
  } catch (e) {
    console.error('Error setting up message listener:', e);
  }
  
  // Create and inject the replacement content
  createReplacementContent();
  
  // Set up a MutationObserver to handle dynamic feed loading
  setupMutationObserver();
}

// Update the blocker state (enabled/disabled)
function updateBlockerState(isEnabled) {
  if (!isChromeAPIAvailable()) return;
  
  // Save the state to storage
  safeSet({ feedBlockerEnabled: isEnabled });
  
  // Safely apply changes to body and elements
  const applyChanges = () => {
    try {
      // Skip if document or body doesn't exist
      if (!document || !document.body) return;
      
      // Update body classes
      if (isEnabled) {
        document.body.classList.add('feed-blocker-active');
        document.body.classList.remove('feed-blocker-disabled');
      } else {
        document.body.classList.add('feed-blocker-disabled');
        document.body.classList.remove('feed-blocker-active');
      }
      
      // Update replacement element
      const replacementEl = document.getElementById('feed-replacement');
      if (replacementEl) {
        safeManipulateElement(replacementEl, {
          display: isEnabled ? 'flex' : 'none'
        });
      }
      
      // Update feed elements
      try {
        const feedElements = document.querySelectorAll('.feed-container, .core-rail, div[data-test-id="feed-container"], .scaffold-finite-scroll, .scaffold-finite-scroll__content, div[role="main"] div[data-test-id="main-feed"]');
        
        feedElements.forEach(element => {
          if (isEnabled) {
            // Hide feed
            safeManipulateElement(element, {
              display: 'none',
              setAttribute: { name: 'data-hidden-by-focus-mode', value: 'true' }
            });
          } else {
            // Show feed
            safeManipulateElement(element, {
              display: '',
              visibility: 'visible',
              opacity: '1',
              removeAttribute: 'data-hidden-by-focus-mode'
            });
          }
        });
      } catch (error) {
        console.error('Error updating feed elements:', error);
      }
    } catch (error) {
      console.error('Error in applyChanges:', error);
    }
  };
  
  // Apply changes at different points to ensure they take effect
  if (document.body) {
    applyChanges();
  }
  
  // Also try after a delay
  safeSetTimeout(applyChanges, 100);
  
  // And when DOM is fully loaded
  if (document.readyState !== 'complete') {
    document.addEventListener('DOMContentLoaded', applyChanges, { once: true });
  }
}
/*
// Function to specifically identify and hide LinkedIn News elements
function hideLinkedInNews(enable) {
  try {
    // First approach: Look for elements that contain "LinkedIn News" text
    const findNewsElements = () => {
      // News elements often have these specific identifiers
      const newsSelectors = [
        // Specific news module selectors
        "div[data-test-id='news-module']",
        "aside div[aria-label='LinkedIn News']",
        "aside section[data-test-id='today-news-module']",
        ".news-module",
        ".news-recirc-module"
      ];
      
      // Look for elements matching these selectors
      let newsElements = [];
      newsSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          newsElements.push(...elements);
        }
      });
      
      // If we don't find elements with selectors, look for elements with "LinkedIn News" text
      if (newsElements.length === 0) {
        // Get all headings and span elements that might contain "LinkedIn News"
        const headings = document.querySelectorAll('h2, h3, span, div');
        
        headings.forEach(element => {
          if (element.textContent && element.textContent.includes('LinkedIn News')) {
            // Found a heading, now get its parent container (likely a module or section)
            let parent = element.parentElement;
            
            // Go up to find a substantial container (usually 2-3 levels up)
            for (let i = 0; i < 3; i++) {
              if (parent && parent.tagName.toLowerCase() !== 'aside' && 
                  parent.tagName.toLowerCase() !== 'section' && 
                  parent.tagName.toLowerCase() !== 'div') {
                break;
              }
              if (parent && parent.parentElement) {
                parent = parent.parentElement;
              } else {
                break;
              }
            }
            
            // If we found a good container, add it to our list
            if (parent && !newsElements.includes(parent)) {
              newsElements.push(parent);
            }
          }
        });
      }
      
      return newsElements;
    };
    
    // Find all news elements
    const newsElements = findNewsElements();
    console.log(`Found ${newsElements.length} LinkedIn News elements`);
    
    // Apply visibility changes
    newsElements.forEach(element => {
      if (enable) {
        // Hide the news element
        element.setAttribute('data-hidden-by-news-blocker', 'true');
        element.style.display = 'none';
        element.style.visibility = 'hidden';
        element.style.opacity = '0';
        element.style.height = '0';
        element.style.overflow = 'hidden';
      } else {
        // Show the news element
        element.removeAttribute('data-hidden-by-news-blocker');
        element.style.display = '';
        element.style.visibility = '';
        element.style.opacity = '';
        element.style.height = '';
        element.style.overflow = '';
      }
    });
    
    // Update body class for CSS targeting
    if (enable) {
      document.body.classList.add('news-blocker-active');
    } else {
      document.body.classList.remove('news-blocker-active');
    }
    
    return newsElements.length > 0;
  } catch (error) {
    console.error('Error in hideLinkedInNews:', error);
    return false;
  }
}
*/

// To use this function:
// hideLinkedInNews(true) - to hide LinkedIn News
// hideLinkedInNews(false) - to show LinkedIn News

/*
// Update the news blocker state (enabled/disabled)
function updateNewsBlockerState(isEnabled) {
  if (!isChromeAPIAvailable()) return;
  
  // Save the state to storage
  safeSet({ newsBlockerEnabled: isEnabled });
  
  // Use the targeted news hiding function
  safeSetTimeout(() => {
    hideLinkedInNews(isEnabled);
  }, 100);
}
  

  // Apply changes to DOM
  const applyChanges = () => {
    try {
      // Skip if document or body doesn't exist
      if (!document || !document.body) return;
      
      // Update body classes
      if (isEnabled) {
        document.body.classList.add('news-blocker-active');
      } else {
        document.body.classList.remove('news-blocker-active');
      }
      
      // Update news elements with targeted selectors
      const newsSelector = `
        .news-module, 
        .news-module-v2, 
        div[data-test-id="news-module"], 
        .news-module-headline, 
        aside div[aria-label="LinkedIn News"], 
        .scaffold-layout__aside .news-module-container,
        aside .news-module,
        aside section[data-test-id="today-news-module"],
        .news-recirc-module,
        .aside-module-aside,
        .scaffold-layout__aside > div > div > div[data-view-name="news-module"],
        .scaffold-layout__aside section div[data-control-name^="news"],
        .aside-content-module
      `;
      
      try {
        const newsElements = document.querySelectorAll(newsSelector);
        
        newsElements.forEach(element => {
          if (isEnabled) {
            safeManipulateElement(element, {
              display: 'none',
              visibility: 'hidden',
              opacity: '0',
              setAttribute: { name: 'data-hidden-by-focus-mode', value: 'true' }
            });
          } else {
            if (element.getAttribute('data-hidden-by-focus-mode') === 'true') {
              safeManipulateElement(element, {
                display: '',
                visibility: '',
                opacity: '',
                removeAttribute: 'data-hidden-by-focus-mode'
              });
            }
          }
        });
      } catch (error) {
        console.error('Error updating news elements:', error);
      }
    } catch (error) {
      console.error('Error in news blocker:', error);
    }
  };
 
  // Apply changes at different points to ensure they take effect
  if (document.body) {
    applyChanges();
  }
  
  // Also try after a delay
  safeSetTimeout(applyChanges, 100);
  
  // And when DOM is fully loaded
  if (document.readyState !== 'complete') {
    document.addEventListener('DOMContentLoaded', applyChanges, { once: true });
  }

 */



  
// Create and inject the replacement content for the feed
function createReplacementContent() {
  // Create an ID for the interval so we can clear it
  let checkIntervalId = null;
  
  // Clear any existing check interval
  if (checkIntervalId) {
    clearSafeInterval(checkIntervalId);
  }
  
  // Function to create the replacement element
  const createReplacement = () => {
    try {
      // Look for the feed container
      const feedContainer = document.querySelector('div[role="main"] div[data-test-id="main-feed"]');
      if (!feedContainer) return false;
      
      // Clear the interval as we found the container
      if (checkIntervalId) {
        clearSafeInterval(checkIntervalId);
        checkIntervalId = null;
      }
      
      // Check if replacement already exists
      if (document.getElementById('feed-replacement')) return true;
      
      // Create replacement element
      const replacementEl = document.createElement('div');
      replacementEl.id = 'feed-replacement';
      replacementEl.className = 'feed-replacement';
      
      // Motivational quotes
      const quotes = [
        "Focus on your goals, not on your feed.",
        "Networking is about making connections, not endless scrolling.",
        "Your productivity matters more than your feed.",
        "Connect with purpose, not with distraction."
      ];
      
      // Randomly select a quote
      const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
      
      // Set content
      replacementEl.innerHTML = `
        <h2>LinkedIn Focus Mode</h2>
        <p>The feed has been hidden to help you stay productive and focused.</p>
        <div class="quote">${randomQuote}</div>
        <p>You can use LinkedIn for networking, job searching, and messaging without the distraction of the feed.</p>
      `;
      
      // Insert before the feed container
      try {
        feedContainer.parentNode.insertBefore(replacementEl, feedContainer);
      } catch (e) {
        console.error('Error inserting replacement element:', e);
        return false;
      }
      
      // Update visibility based on current setting
      try {
        if (isChromeAPIAvailable()) {
          safeGet(['feedBlockerEnabled'], function(result) {
            const isEnabled = result.feedBlockerEnabled === undefined ? true : result.feedBlockerEnabled;
            if (replacementEl) {
              replacementEl.style.display = isEnabled ? 'flex' : 'none';
            }
          });
        } else {
          if (replacementEl) {
            replacementEl.style.display = 'flex';
          }
        }
      } catch (e) {
        console.error('Error setting replacement visibility:', e);
      }
      
      return true;
    } catch (e) {
      console.error('Error creating replacement content:', e);
      return false;
    }
  };
  
  // Try to create immediately if possible
  const created = createReplacement();
  
  // If not created, set up interval to check periodically
  if (!created) {
    checkIntervalId = safeSetInterval(createReplacement, 500);
    
    // Set a timeout to clear interval after 10 seconds to prevent infinite checking
    safeSetTimeout(() => {
      if (checkIntervalId) {
        clearSafeInterval(checkIntervalId);
        checkIntervalId = null;
      }
    }, 10000);
  }
}

// Set up MutationObserver to handle dynamic content loading
function setupMutationObserver() {
  // Create a new observer
  const observer = new MutationObserver((mutations) => {
    try {
      // Check if extension is still valid
      if (!isChromeAPIAvailable()) {
        observer.disconnect();
        const index = observers.indexOf(observer);
        if (index > -1) {
          observers.splice(index, 1);
        }
        return;
      }
      
      // Skip if document or body isn't available
      if (!document || !document.body) return;
      
      // Throttle updates - use a timeout to avoid excessive processing
      if (observer.timeout) {
        return;
      }
      
      observer.timeout = safeSetTimeout(() => {
        observer.timeout = null;
        
        // Check current state of feed and news blockers
        safeGet(['feedBlockerEnabled', 'newsBlockerEnabled'], function(result) {
          const feedEnabled = result.feedBlockerEnabled === undefined ? true : result.feedBlockerEnabled;
          const newsEnabled = result.newsBlockerEnabled === undefined ? true : result.newsBlockerEnabled;
          
          // Process news blocking if enabled
          if (newsEnabled) {
            try {
              // Update body class
              document.body.classList.add('news-blocker-active');
              
              // Hide any newly added news elements
              const newsSelector = `
                .news-module, 
                .news-module-v2, 
                div[data-test-id="news-module"], 
                .news-module-headline, 
                aside div[aria-label="LinkedIn News"], 
                .scaffold-layout__aside .news-module-container,
                aside .news-module,
                aside section[data-test-id="today-news-module"],
                .news-recirc-module,
                .aside-module-aside,
                .scaffold-layout__aside > div > div > div[data-view-name="news-module"],
                .scaffold-layout__aside section div[data-control-name^="news"],
                .aside-content-module
              `;
              
              const newsElements = document.querySelectorAll(newsSelector);
              newsElements.forEach(element => {
                if (!element.hasAttribute('data-hidden-by-focus-mode')) {
                  safeManipulateElement(element, {
                    display: 'none',
                    visibility: 'hidden',
                    opacity: '0',
                    setAttribute: { name: 'data-hidden-by-focus-mode', value: 'true' }
                  });
                }
              });
            } catch (e) {
              console.error('Error in news blocking:', e);
            }
          }
          
          // Process feed blocking if enabled
          if (feedEnabled) {
            try {
              // Update body classes
              document.body.classList.add('feed-blocker-active');
              document.body.classList.remove('feed-blocker-disabled');
              
              // Hide feed elements
              const feedElements = document.querySelectorAll('.feed-container, .core-rail, div[data-test-id="feed-container"], .scaffold-finite-scroll, .scaffold-finite-scroll__content, div[role="main"] div[data-test-id="main-feed"]');
              feedElements.forEach(element => {
                if (!element.hasAttribute('data-hidden-by-focus-mode')) {
                  safeManipulateElement(element, {
                    display: 'none',
                    setAttribute: { name: 'data-hidden-by-focus-mode', value: 'true' }
                  });
                }
              });
              
              // Show replacement element if it exists
              const replacementEl = document.getElementById('feed-replacement');
              if (replacementEl) {
                safeManipulateElement(replacementEl, { display: 'flex' });
              }
            } catch (e) {
              console.error('Error in feed blocking:', e);
            }
          } else {
            try {
              // If feed blocking is disabled, show feed
              document.body.classList.add('feed-blocker-disabled');
              document.body.classList.remove('feed-blocker-active');
              
              // Show feed elements
              const feedElements = document.querySelectorAll('.feed-container, .core-rail, div[data-test-id="feed-container"], .scaffold-finite-scroll, .scaffold-finite-scroll__content, div[role="main"] div[data-test-id="main-feed"]');
              feedElements.forEach(element => {
                if (element.hasAttribute('data-hidden-by-focus-mode')) {
                  safeManipulateElement(element, {
                    display: '',
                    visibility: 'visible',
                    opacity: '1',
                    removeAttribute: 'data-hidden-by-focus-mode'
                  });
                }
              });
              
              // Hide replacement element
              const replacementEl = document.getElementById('feed-replacement');
              if (replacementEl) {
                safeManipulateElement(replacementEl, { display: 'none' });
              }
            } catch (e) {
              console.error('Error showing feed:', e);
            }
          }
        });
      }, 200); // Throttle to once every 200ms
      
    } catch (e) {
      console.error('Error in MutationObserver:', e);
    }
  });
  
  // Track this observer
  observers.push(observer);
  
  // Function to start observing
  const startObserving = () => {
    try {
      if (document.body) {
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      }
    } catch (e) {
      console.error('Error starting observer:', e);
    }
  };
  
  // Try to start observing now if possible
  startObserving();
  
  // Try again when DOM is ready
  document.addEventListener('DOMContentLoaded', startObserving, { once: true });
  
  // Set up click handler for "See more" links
  const clickHandler = (event) => {
    try {
      // Return if Chrome APIs aren't available
      if (!isChromeAPIAvailable()) {
        document.removeEventListener('click', clickHandler);
        return;
      }
      
      // Short delay to let LinkedIn process the click
      safeSetTimeout(() => {
        safeGet(['feedBlockerEnabled'], function(result) {
          const feedEnabled = result.feedBlockerEnabled === undefined ? true : result.feedBlockerEnabled;
          
          // If feed blocking is disabled, ensure feed is visible
          if (!feedEnabled) {
            const feedElements = document.querySelectorAll('.feed-container, .core-rail, div[data-test-id="feed-container"], .scaffold-finite-scroll, .scaffold-finite-scroll__content, div[role="main"] div[data-test-id="main-feed"]');
            feedElements.forEach(element => {
              if (element.style.display === 'none' || element.hasAttribute('data-hidden-by-focus-mode')) {
                safeManipulateElement(element, {
                  display: '',
                  visibility: 'visible',
                  opacity: '1',
                  removeAttribute: 'data-hidden-by-focus-mode'
                });
              }
            });
          }
        });
      }, 500);
    } catch (e) {
      console.error('Error in click handler:', e);
      // Remove listener on error
      document.removeEventListener('click', clickHandler);
    }
  };
  
  // Add click handler
  document.addEventListener('click', clickHandler);
  
  // Set up periodic check for feed visibility
  const checkIntervalId = safeSetInterval(() => {
    try {
      // If Chrome APIs aren't available, clear interval
      if (!isChromeAPIAvailable()) {
        clearSafeInterval(checkIntervalId);
        return;
      }
      
      safeGet(['feedBlockerEnabled'], function(result) {
        const feedEnabled = result.feedBlockerEnabled === undefined ? true : result.feedBlockerEnabled;
        
        // If feed blocking is disabled, ensure feed is visible
        if (!feedEnabled) {
          const feedElements = document.querySelectorAll('.feed-container, .core-rail, div[data-test-id="feed-container"], .scaffold-finite-scroll, .scaffold-finite-scroll__content, div[role="main"] div[data-test-id="main-feed"]');
          feedElements.forEach(element => {
            if (element.style.display === 'none' || element.hasAttribute('data-hidden-by-focus-mode')) {
              safeManipulateElement(element, {
                display: '',
                visibility: 'visible',
                opacity: '1',
                removeAttribute: 'data-hidden-by-focus-mode'
              });
            }
          });
        }
      });
    } catch (e) {
      console.error('Error in visibility check:', e);
      clearSafeInterval(checkIntervalId);
    }
  }, 1000);
}

// Handle extension context invalidation
function handleExtensionInvalidation() {
  document.addEventListener('error', (event) => {
    if (event.error && event.error.message && event.error.message.includes('Extension context invalidated')) {
      console.log('Extension context invalidated, cleaning up resources');
      cleanupResources();
    }
  });
  
  // Also check periodically if Chrome APIs are available
  const watchdogId = safeSetInterval(() => {
    if (!isChromeAPIAvailable()) {
      console.log('Chrome APIs no longer available, cleaning up');
      cleanupResources();
      clearSafeInterval(watchdogId);
    }
  }, 5000);
}

// Initialize the extension safely
function safeInit() {
  try {
    if (!isChromeAPIAvailable()) {
      console.log('Chrome APIs not available for initialization');
      return;
    }
    
    // Set up error handling
    handleExtensionInvalidation();
    
    // Initialize with a delay
    safeSetTimeout(() => {
      try {
        if (isChromeAPIAvailable()) {
          initFeedBlocker();
        }
      } catch (e) {
        console.error('Error in delayed init:', e);
      }
    }, 200);
  } catch (e) {
    console.error('Error in safeInit:', e);
  }
}

// Start initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', safeInit, { once: true });
} else {
  safeInit();
}

// Also try initialization after page load as fallback
window.addEventListener('load', () => {
  if (!initialized && isChromeAPIAvailable()) {
    safeInit();
  }
}, { once: true });

// Clean up when page unloads
window.addEventListener('beforeunload', cleanupResources);