// gemini_fork.js
console.log("Gemini Forker v0.5.3 Loaded"); // v0.5.3 - Fixed 404 and summary extraction

// Browser API compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

/**
 * Helper function to inject the API script into the page's main world.
 * This is necessary to access window.WIZ_global_data.
 */
function injectApiScript() {
  try {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('tester-inject.js');
    s.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(s);
    console.log('Gemini Forker: Injected tester-inject.js');
  } catch (e) {
    console.error('Gemini Forker: Failed to inject API script:', e);
  }
}

/** ---------- Turndown Setup ---------- **/
function makeTurndownInstance() {
  if (typeof TurndownService === "undefined") {
    console.error("Gemini Forker: TurndownService not found!");
    return { turndown: (html) => html }; // Fallback
  }

  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "*",
  });

  // Add a rule for tables (optional, but good to have)
  td.addRule("tables", {
    filter: ["table"],
    replacement: function (_content, node) {
      const rows = Array.from(node.querySelectorAll("tr"));
      if (!rows.length) return "";
      const table = rows.map((row, i) => {
        const cells = Array.from(row.children).map(c => c.textContent.trim());
        const line = `| ${cells.join(" | ")} |`;
        if (i === 0) {
          const sep = `| ${cells.map(() => "---").join(" | ")} |`;
          return [line, sep].join("\n");
        }
        return line;
      });
      return "\n" + table.join("\n") + "\n";
    }
  });
  return td;
}

const td = makeTurndownInstance();

const defaultSummaryPrompt =
  `I've attached a chatlog from a previous conversation. Please create a complete, detailed summary of the conversation that covers all important points, questions, and responses. This summary will be used to continue the conversation in a new chat, so make sure it provides enough context to understand the full discussion. Be thorough, and think things through. Make it lengthy.
If this is a technical discussion, include any relevant technical details, code snippets, or explanations that were part of the conversation, maintaining information concerning only the latest version of any code discussed.
If this is a writing or creative discussion, include sections for characters, plot points, setting info, etcetera.`;

/**
 * This is our new "Bridge". It sends a request to the injected script
 * and waits for a response.
 */
function callInjectedApi(action, payload) {
  return new Promise((resolve, reject) => {
    const requestId = `forker-${Math.random().toString(36).substr(2, 9)}`;

    // Listener for the response
    const responseListener = (event) => {
      const data = event.data;
      if (data && data.type === "FORKER_RESPONSE" && data.requestId === requestId) {
        window.removeEventListener("message", responseListener);
        if (data.success) {
          resolve(data.payload);
        } else {
          reject(new Error(data.error));
        }
      }
    };
    window.addEventListener("message", responseListener);

    // Send the request
    window.postMessage({
      type: "FORKER_REQUEST",
      action: action,
      requestId: requestId,
      payload: payload
    }, window.location.origin);
  });
}

/**
 * Try to detect the current Gem ID from the page
 */
function detectCurrentGem() {
  try {
    // Method 1: Check URL path for /gem/XXXX pattern
    const gemMatch = window.location.pathname.match(/\/gem\/([a-f0-9]+)/);
    if (gemMatch) {
      const gemId = gemMatch[1];
      console.log("💎 Detected Gem from URL:", gemId);
      return gemId;
    }
    
    // Method 2: Check URL search params as fallback
    const urlParams = new URLSearchParams(window.location.search);
    const gemFromUrl = urlParams.get('gem') || urlParams.get('gem_id');
    if (gemFromUrl) {
      console.log("💎 Detected Gem from URL params:", gemFromUrl);
      return gemFromUrl;
    }
    
    console.log("💎 No Gem detected - creating chat in default context");
    return null;
  } catch (e) {
    console.warn("Error detecting Gem:", e);
    return null;
  }
}


/** ---------- Phase 1: UI Injection ---------- **/

function addForkButtonToMessage(messageNode) {
  const buttonGroup = messageNode.querySelector('message-actions .actions-container-v2');
  if (!buttonGroup || buttonGroup.querySelector('.fork-button')) {
    return; // Already injected or no button group found
  }

  const svgContent = `
    <div style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 22 22" class="shrink-0" aria-hidden="true">
        <path d="M7 5C7 3.89543 7.89543 3 9 3C10.1046 3 11 3.89543 11 5C11 5.74028 10.5978 6.38663 10 6.73244V14.0396H11.7915C12.8961 14.0396 13.7915 13.1441 13.7915 12.0396V10.7838C13.1823 10.4411 12.7708 9.78837 12.7708 9.03955C12.7708 7.93498 13.6662 7.03955 14.7708 7.03955C15.8753 7.03955 16.7708 7.93498 16.7708 9.03955C16.7708 9.77123 16.3778 10.4111 15.7915 10.7598V12.0396C15.7915 14.2487 14.0006 16.0396 11.7915 16.0396H10V17.2676C10.5978 17.6134 11 18.2597 11 19C11 20.1046 10.1046 21 9 21C7.89543 21 7 20.1046 7 19C7 18.2597 7.4022 17.6134 8 17.2676V6.73244C7.4022 6.38663 7 5.74028 7 5Z"/>
      </svg>
    </div>
  `;

  // Create a button that mimics Gemini's icon buttons
  const button = document.createElement('button');
  button.className = 'mdc-icon-button mat-mdc-icon-button mat-mdc-button-base mat-unthemed fork-button';
  button.setAttribute('aria-label', 'Fork from here');
  button.innerHTML = svgContent;
  
  // Add our own simple tooltip
  button.addEventListener('mouseenter', () => createTooltip(button, 'Fork from here'));
  button.addEventListener('mouseleave', removeTooltip);

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    createForkModal(messageNode);
  });

  buttonGroup.prepend(button);
}

function createForkModal(messageNode) {
  // Remove existing modal if any
  document.getElementById('fork-modal-backdrop')?.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'fork-modal-backdrop';

  const modal = document.createElement('div');
  modal.id = 'fork-modal-content';

  modal.innerHTML = `
    <h3 id="fork-modal-title">Fork Conversation</h3>
    
    <div class="fork-modal-section">
      <div class="fork-slider-header">
        <label for="fork-slider-input">Preserve Recent Messages</label>
        <span id="fork-slider-value">100%</span>
      </div>
      <p classs="fork-slider-desc">
        <b>100%</b> = Keep all messages (no summary).<br>
        <b>0%</b> = Summarize all messages.
      </p>
      <input type="range" id="fork-slider-input" min="0" max="100" value="100" step="5">
    </div>
    
    <div class="fork-modal-section" id="fork-summary-prompt-container">
      <label for="fork-summary-prompt">Summary Prompt</label>
      <textarea id="fork-summary-prompt">${defaultSummaryPrompt}</textarea>
    </div>
    
    <div id="fork-modal-footer">
      <button id="fork-modal-cancel" class="fork-button-secondary">Cancel</button>
      <button id="fork-modal-confirm" class="fork-button-primary">Fork Chat</button>
    </div>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  // --- Add Listeners ---
  const slider = document.getElementById('fork-slider-input');
  const sliderValue = document.getElementById('fork-slider-value');
  const summaryContainer = document.getElementById('fork-summary-prompt-container');

  const updateTotal = (value) => {
    sliderValue.textContent = `${value}%`;
    // Hide summary prompt if we are keeping 100% of the chat
    summaryContainer.style.display = value < 100 ? 'block' : 'none';
  };
  
  slider.addEventListener('input', (e) => updateTotal(e.target.value));
  updateTotal(slider.value); // Set initial state

  // Close modal
  const closeModal = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
  document.getElementById('fork-modal-cancel').addEventListener('click', closeModal);

  // Confirm
  document.getElementById('fork-modal-confirm').addEventListener('click', () => {
    const percentage = parseInt(slider.value);
    const promptText = document.getElementById('fork-summary-prompt').value;
    
    // Disable button to prevent double-click
    const confirmBtn = document.getElementById('fork-modal-confirm');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Forking...";
    }
    
    handleForkConfirm(messageNode, percentage, promptText)
      .catch(err => {
        console.error("Forking failed:", err);
        alert(`Forking failed: ${err.message}. See console for details.`);
      })
      .finally(() => {
        closeModal();
      });
  });
}

function createTooltip(parent, text) {
  removeTooltip(); // Remove any existing
  const rect = parent.getBoundingClientRect();
  
  const tooltip = document.createElement('div');
  tooltip.id = 'fork-tooltip';
  tooltip.textContent = text;
  
  document.body.appendChild(tooltip);
  
  // Position it
  tooltip.style.left = `${rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2)}px`;
  tooltip.style.top = `${rect.bottom + 8}px`; // 8px below the button
}

function removeTooltip() {
  document.getElementById('fork-tooltip')?.remove();
}

/** ---------- Phase 2: Core Logic (FIXED VERSION) ---------- **/

async function handleForkConfirm(anchorNode, rawTextPercentage, summaryPrompt) {
  console.log(`Forking at ${rawTextPercentage}%`);
  
  // Detect current Gem
  const currentGemId = detectCurrentGem();
  console.log("🔍 Current Gem ID for this fork:", currentGemId || "NONE");
  
  const { messages } = extractGemini(anchorNode); // 1. Scrape History

  // 2. Split History
  const splitPoint = Math.floor(messages.length * (1 - (rawTextPercentage / 100)));
  const messagesToSummarize = messages.slice(0, splitPoint);
  const messagesToKeep = messages.slice(splitPoint);

  console.log("To Summarize:", messagesToSummarize.length, "messages");
  console.log("To Keep:", messagesToKeep.length, "messages");

  let summaryText = "";
  try {
    // 3. Summarize (if needed)
    if (messagesToSummarize.length > 0) {
      
      const chatlog = messagesToSummarize.map(msg => `**${msg.role}:**\n${msg.text}`).join("\n\n---\n\n");
      const fullSummaryPrompt = `${summaryPrompt}\n\n---\n\n${chatlog}`;
      
      console.log("Sending summary request to API...");
      const summaryResult = await callInjectedApi("createChat", { 
        message: fullSummaryPrompt,
        gemId: currentGemId 
      });
      
      if (summaryResult && summaryResult.responseText) {
          console.log("Summary chat created, ID:", summaryResult.chatId);
          summaryText = summaryResult.responseText;
          console.log("Summary text length:", summaryText.length);
          console.log("Summary preview:", summaryText.substring(0, 200));
      } else {
          console.warn("Summary chat created, but no summary text was returned.");
          summaryText = "[Summary was generated, but text could not be extracted.]";
      }
      
      console.log("Deleting summary chat...");
      await callInjectedApi("deleteChat", summaryResult.chatId);
      console.log("Summary chat deleted.");
      
      // CRITICAL: Wait for deletion to fully propagate
      await new Promise(r => setTimeout(r, 500));
    }

    // 4. Create New Chat
    console.log("Creating final new chat...");
    console.log("💎 Passing Gem ID to createNewChat:", currentGemId || "NONE");
    const newChatId = await createNewChat(summaryText, messagesToKeep, currentGemId);
    console.log(`New chat created: ${newChatId}`);
    
    // 5. CRITICAL: Wait longer for the chat to fully propagate in Gemini's system
    console.log("Waiting for chat to propagate in backend...");
    await new Promise(r => setTimeout(r, 1500));
    
    // 6. Navigate to the new chat (with gem path if applicable)
    let targetUrl;
    if (currentGemId) {
      targetUrl = `https://gemini.google.com/gem/${currentGemId}/${newChatId}`;
      console.log(`🎯 Navigating to new chat in Gem: ${targetUrl}`);
    } else {
      targetUrl = `https://gemini.google.com/app/${newChatId}`;
      console.log(`🎯 Navigating to new chat (no gem): ${targetUrl}`);
    }
    
    console.log("📍 Final navigation URL:", targetUrl);
    window.location.href = targetUrl;

  } catch (e) {
    console.error("Forking failed:", e);
    alert(`Forking failed: ${e.message}. See console for details.`);
  }
}

 

async function createNewChat(summaryText, messagesToKeep, gemId = null) {
  console.log("Creating final new chat...");
  if (gemId) {
    console.log("💎 Creating chat with Gem:", gemId);
  }
  
  const summaryLog = summaryText ? `**Assistant (Summary):**\n${summaryText}` : "";
  const keepLog = messagesToKeep.map(msg => `**${msg.role}:**\n${msg.text}`).join("\n\n---\n\n");
  const chatContext = [summaryLog, keepLog].filter(Boolean).join("\n\n---\n\n");
  
  const finalPrompt = `This conversation is forked from a previous chat. The context is provided below. 
Please read it, respond only with "Acknowledged", and then wait for my next prompt.

---
[START CONTEXT]
${chatContext}
[END CONTEXT]
---

Please respond only with "Acknowledged".`;
  
  const result = await callInjectedApi("createChat", {
    message: finalPrompt,
    gemId: gemId
  });
  
  if (!result || !result.chatId) {
    console.error("Failed to create final chat. API response was missing a chat ID.", result);
    throw new Error("Failed to create the final chat. The API did not return a chat ID.");
  }
  
  return result.chatId; 
}

/** ---------- Phase 3: The Scraper ---------- **/
function extractGemini(anchorNode = null) {
  const messages = [];
  
  // Use the anchorNode to find the end of the scrape
  // If no anchorNode, scrape everything
  let allMessageNodes = Array.from(document.querySelectorAll('user-query, model-response'));
  
  if (anchorNode) {
    // Find the 'model-response' that contains the button that was clicked
    const anchorParent = anchorNode.closest('model-response');
    const endIndex = allMessageNodes.indexOf(anchorParent);
    if (endIndex > -1) {
      allMessageNodes = allMessageNodes.slice(0, endIndex + 1);
    }
  }

  allMessageNodes.forEach(node => {
    let role = null;
    let text = "";
    let html = "";

    if (node.tagName === 'USER-QUERY') {
      role = 'user';
      const contentNode = node.querySelector('.query-text p, .query-text-line');
      if (contentNode) {
        text = contentNode.innerText;
      }
    } else if (node.tagName === 'MODEL-RESPONSE') {
      role = 'model';
      // Find the message content, avoid scraping the "Share/Export" buttons
      const contentNode = node.querySelector('message-content .markdown, message-content');
      if (contentNode) {
        // Clone the node to safely remove buttons before turndown
        const clone = contentNode.cloneNode(true);
        // Safely remove known button/tool containers
        clone.querySelectorAll('message-actions, .response-options, .model-tools, .citation-chip-container').forEach(el => el.remove());
        html = clone.innerHTML;
        text = td.turndown(html).trim();
      }
    }

    if (role && text) {
      // Standardize role names for clarity in the prompt
      messages.push({ role: role === 'user' ? 'User' : 'Assistant', text });
    }
  });
  
  return { messages }; // We don't need the title for this
}


/** ---------- Initialization & Styling ---------- **/

function injectStyles() {
  const styleId = 'gemini-forker-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .fork-button {
      padding: 0;
      width: 40px;
      height: 40px;
      min-width: 40px;
      color: var(--mat-option-unselected-state-label-text-color, #C4C7C5);
    }
    .fork-button:hover {
      background-color: rgba(255, 255, 255, 0.1);
      color: var(--mat-option-label-text-color, #E3E3E3);
    }
    
    #fork-tooltip {
      position: fixed;
      background-color: #333;
      color: white;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 99999;
      pointer-events: none;
    }
    
    #fork-modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.6);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    #fork-modal-content {
      background-color: var(--mat-app-background-color, #131314);
      color: var(--mat-on-surface-variant-color, #C4C7C5);
      border-radius: 8px;
      border: 1px solid #444;
      box-shadow: 0 5px 20px rgba(0, 0, 0, 0.5);
      width: 90%;
      max-width: 550px;
      display: flex;
      flex-direction: column;
      font-family: 'Google Sans', sans-serif;
    }
    
    #fork-modal-title {
      font-size: 20px;
      font-weight: 600;
      color: var(--mat-on-surface-color, #E3E3E3);
      padding: 20px;
      margin: 0;
      border-bottom: 1px solid var(--mat-divider-color, #303030);
    }
    
    .fork-modal-section {
      padding: 20px;
    }
    
    .fork-slider-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    
    .fork-slider-header label {
      font-size: 16px;
      font-weight: 500;
      color: var(--mat-on-surface-color, #E3E3E3);
    }
    
    #fork-slider-value {
      font-size: 16px;
      font-weight: 500;
      color: var(--mat-primary-color, #8AB4F8);
    }
    
    .fork-slider-desc {
      font-size: 13px;
      opacity: 0.8;
      margin-bottom: 16px;
      margin-top: 0;
    }
    
    #fork-slider-input {
      width: 100%;
    }
    
    #fork-summary-prompt-container {
      border-top: 1px solid var(--mat-divider-color, #303030);
    }
    
    #fork-summary-prompt-container label {
      display: block;
      font-size: 16px;
      font-weight: 500;
      color: var(--mat-on-surface-color, #E3E3E3);
      margin-bottom: 12px;
    }
    
    #fork-summary-prompt {
      width: 100%;
      height: 150px;
      background-color: var(--mat-text-field-container-color, #1E1F20);
      border: 1px solid #444;
      border-radius: 4px;
      color: var(--mat-on-surface-color, #E3E3E3);
      padding: 10px;
      box-sizing: border-box; /* Important */
      font-family: inherit;
      resize: vertical;
    }
    
    #fork-modal-footer {
      display: flex;
      justify-content: flex-end;
      padding: 20px;
      border-top: 1px solid var(--mat-divider-color, #303030);
    }
    
    .fork-button-primary, .fork-button-secondary {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-weight: 600;
      cursor: pointer;
      margin-left: 10px;
    }
    
    .fork-button-primary {
      background-color: var(--mat-primary-color, #8AB4F8);
      color: var(--mat-on-primary-color, #202124);
    }
    .fork-button-primary:hover {
      opacity: 0.9;
    }
    .fork-button-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .fork-button-secondary {
      background-color: transparent;
      color: var(--mat-primary-color, #8AB4F8);
    }
    .fork-button-secondary:hover {
      background-color: rgba(138, 180, 248, 0.1);
    }
  `;
  document.head.appendChild(style);
}


function initialize() {
  injectApiScript(); // <-- NEW: Inject the API script
  injectStyles();
  
  // Main loop to find and add buttons
  setInterval(() => {
    const messages = document.querySelectorAll('model-response');
    messages.forEach(msg => {
      addForkButtonToMessage(msg);
    });
  }, 2000);
}

initialize();