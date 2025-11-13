// background.js
console.log("Gemini Forker Background Service Worker Started (v0.2.1)");

// Browser API compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Helper function to inject and run a script in a tab
// This function returns the result from the injected script.
async function injectScript(tabId, func, args) {
  const results = await browserAPI.scripting.executeScript({
    target: { tabId: tabId },
    func: func,
    args: args,
  });
  return results[0].result;
}

// Main listener for messages from the content script
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "GET_SUMMARY") {
    // This is an async operation, so we must return true
    (async () => {
      let tempTab = null;
      try {
        // 1. Create a new, *ACTIVE* tab. This is required for the page's JS to run.
        tempTab = await browserAPI.tabs.create({
          url: "https://gemini.google.com/",
          active: true // <-- FIX: Must be true
        });
        
        // 2. Wait for the tab to be fully loaded
        await new Promise((resolve, reject) => {
          const listener = (tabId, changeInfo) => {
            if (tabId === tempTab.id && changeInfo.status === 'complete') {
              browserAPI.tabs.onUpdated.removeListener(listener);
              // Give the app a moment to finish its own JS init
              setTimeout(resolve, 500);
            }
          };
          browserAPI.tabs.onUpdated.addListener(listener);
        });

        // 3. Inject turndown.js first, since our function relies on it
        await browserAPI.scripting.executeScript({
          target: { tabId: tempTab.id },
          files: ["turndown.js"],
        });

        // 4. Inject our summarization script
        const summary = await injectScript(tempTab.id, getSummaryInTab, [
          message.prompt,
          message.chatlog
        ]);
        
        sendResponse({ ok: true, summary: summary });

      } catch (err) {
        console.error("Error in GET_SUMMARY:", err);
        sendResponse({ ok: false, error: err.message });
      } finally {
        // 5. Clean up and close the temp tab
        if (tempTab) {
          await browserAPI.tabs.remove(tempTab.id);
        }
      }
    })();
    return true; // Keep the message channel open for async response

  } else if (message.action === "CREATE_FORK_TAB") {
    
    (async () => {
      let newTab = null;
      try {
        // 1. Create a new, *active* tab
        newTab = await browserAPI.tabs.create({
          url: "https://gemini.google.com/",
          active: true
        });

        // 2. Wait for it to be fully loaded
        await new Promise((resolve, reject) => {
          const listener = (tabId, changeInfo) => {
            if (tabId === newTab.id && changeInfo.status === 'complete') {
              browserAPI.tabs.onUpdated.removeListener(listener);
              setTimeout(resolve, 500);
            }
          };
          browserAPI.tabs.onUpdated.addListener(listener);
        });

        // 3. Inject the script to paste the final prompt
        await injectScript(newTab.id, pasteAndSubmitPrompt, [message.finalPrompt]);
        sendResponse({ ok: true });

      } catch (err) {
        console.error("Error in CREATE_FORK_TAB:", err);
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true; // Keep the message channel open
  }
});


/**
 * This function is NOT run in the background.
 * It is serialized and injected into the *temporary summary tab*.
 */
async function getSummaryInTab(prompt, chatlog) {
  // Wait for the prompt textarea to be available
  let promptTextarea = null;
  while (!promptTextarea) {
    promptTextarea = document.querySelector('rich-textarea [contenteditable="true"]');
    if (!promptTextarea) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  // Combine prompt and chatlog
  const fullPrompt = `${prompt}\n\n---\n\n${chatlog}`;
  promptTextarea.innerHTML = fullPrompt.replace(/\n/g, '<br>');
  // --- FIX: Dispatch an input event to enable the submit button ---
  promptTextarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

  // Find and click the submit button
  const submitButton = document.querySelector('button.send-button');
  if (!submitButton) throw new Error("Could not find submit button in temp tab.");
  
  // Wait a tick for the event to process
  await new Promise(r => setTimeout(r, 50));
  submitButton.click();

  // Wait for the response to appear
  let modelResponse = null;
  while (!modelResponse) {
    const responses = document.querySelectorAll('model-response');
    if (responses.length > 0) {
      modelResponse = responses[responses.length - 1]; // Get the last one
      // Check if it's done loading (spinner is gone)
      if (modelResponse.querySelector('.loading-animation, .spinner, [aria-busy="true"]')) {
        modelResponse = null; // Not done, keep waiting
      }
    }
    if (!modelResponse) {
      await new Promise(r => setTimeout(r, 250));
    }
  }

  // Scrape the summary text
  const contentNode = modelResponse.querySelector('message-content .markdown');
  if (!contentNode) throw new Error("Could not find response content node.");

  // Use Turndown, which was injected before this function
  const td = new TurndownService();
  return td.turndown(contentNode.innerHTML).trim();
}


/**
 * This function is NOT run in the background.
 * It is serialized and injected into the *new fork tab*.
 */
async function pasteAndSubmitPrompt(finalPrompt) {
  let promptTextarea = null;
  while (!promptTextarea) {
    promptTextarea = document.querySelector('rich-textarea [contenteditable="true"]');
    if (!promptTextarea) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // Paste the prompt. We set innerHTML as it's a contenteditable div.
  promptTextarea.innerHTML = finalPrompt.replace(/\n/g, '<br>');
  // --- FIX: Dispatch an input event to enable the submit button ---
  promptTextarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

  // Find and click the submit button
  const submitButton = document.querySelector('button.send-button');
  if (!submitButton) throw new Error("Could not find submit button in new tab.");
  
  // Wait a tick for the event to process
  await new Promise(r => setTimeout(r, 50));
  submitButton.click();
}