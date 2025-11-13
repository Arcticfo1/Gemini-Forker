/**
 * TESTER-INJECT.JS (FIXED VERSION v0.4.7)
 * Injected by gemini_fork.js to provide API access.
 * FIXES:
 * - More robust response text parsing that checks multiple possible paths
 * - Better handling of streamed responses
 * - More detailed logging for debugging
 */

// --- CONFIGURATION ---
const DELETE_RPC_ID = "GzXR5e";
const STREAM_GENERATE_URL = "/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate";
// ----------------------------------------------------

class GeminiAPITester {
    constructor() {
        this.originalXHROpen = XMLHttpRequest.prototype.open;
        this.originalXHRSend = XMLHttpRequest.prototype.send;
        this.originalFetch = window.fetch;
        this.requestCache = {};
        this.hookXHR();
        this.hookFetch();
        
        console.log("🚀 Gemini Forker API Injected (v0.4.7)");
        this.extractTokenFromGlobals();
        this.setupMessageListener();

        setTimeout(() => {
            console.log("Gemini Forker: Retrying token extraction...");
            this.extractTokenFromGlobals();
        }, 2000);
    }

    setupMessageListener() {
        window.addEventListener("message", async (event) => {
            const data = event.data;
            if (!data || data.type !== "FORKER_REQUEST" || !data.action) {
                return;
            }

            const { action, payload, requestId } = data;
            let response = {};

            try {
                let readyStatus = this.isReady();
                if (!readyStatus.all) {
                    this.extractTokenFromGlobals();
                    readyStatus = this.isReady();
                    
                    if (!readyStatus.all) {
                        let error = "Gemini API client is not ready. Try refreshing.";
                        if (!readyStatus.snlm0Token) error += " (Missing: SNlM0e Token)";
                        if (!readyStatus.at) error += " (Missing: 'at' Token - try sending a message)";
                        throw new Error(error);
                    }
                }
                
                if (action === "createChat") {
                    // Handle both old (string) and new (object) payload formats
                    const message = typeof payload === 'string' ? payload : payload.message;
                    const gemId = typeof payload === 'object' ? payload.gemId : null;
                    const result = await this.createChat(message, gemId);
                    response = { success: true, payload: result };
                } else if (action === "deleteChat") {
                    const result = await this.deleteChat(payload);
                    response = { success: true, payload: result };
                } else {
                    throw new Error(`Unknown action: ${action}`);
                }

            } catch (e) {
                const errorMsg = e.message || "Unknown error in tester-inject.js";
                console.error("Gemini Forker API Error:", e); 
                response = { success: false, error: errorMsg };
            }

            window.postMessage({
                type: "FORKER_RESPONSE",
                requestId: requestId,
                ...response
            }, window.location.origin);
        });
    }

    extractTokenFromGlobals() {
        try {
            if (window.WIZ_global_data && window.WIZ_global_data.SNlM0e) {
                const snlm0Token = window.WIZ_global_data.SNlM0e;
                if (!this.requestCache.streamGenerate) this.requestCache.streamGenerate = {};
                
                if (this.requestCache.streamGenerate.snlm0Token !== snlm0Token) {
                    this.requestCache.streamGenerate.snlm0Token = snlm0Token;
                    console.log("✅ SNlM0 token extracted from globals!");
                    console.log("   Token:", snlm0Token.substring(0, 30) + "...");
                }
                return true;
            }
        } catch (e) {
            console.warn("⚠️ Could not extract token from globals:", e.message);
        }
        return false;
    }

    cacheRequestParams(url, body) {
        if (typeof body === 'string' && url && url.includes('batchexecute')) {
            try {
                const params = new URLSearchParams(body);
                const at = params.get("at");
                if (at && !this.requestCache.at) {
                    this.requestCache.at = at;
                    this.requestCache.f_sid = params.get("f.sid");
                    this.requestCache.bl = params.get("bl");
                    this.requestCache.rt = params.get("rt");
                    this.requestCache._reqid_base = parseInt(params.get("_reqid"), 10) || Math.floor(Math.random() * 100000);
                    this.requestCache.targetUrl = url.split('?')[0];
                    console.log("✅ 'at' token and API params cached!");
                }
            } catch (e) {}
        }
        
        if (typeof body === 'string' && url && url.includes('StreamGenerate')) {
            try {
                const params = new URLSearchParams(body);
                const at = params.get("at");
                if (at) {
                    if (!this.requestCache.at) this.requestCache.at = at;
                    if (!this.requestCache.streamGenerate) this.requestCache.streamGenerate = {};
                    this.requestCache.streamGenerate.at = at;
                }
            } catch (e) {}
        }
    }

    hookXHR() {
        const self = this;
        XMLHttpRequest.prototype.open = function(method, url) {
            this._interceptor_url = url;
            self.originalXHROpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function(body) {
            self.cacheRequestParams(this._interceptor_url, body);
            self.originalXHRSend.apply(this, arguments);
        };
    }

    hookFetch() {
        const self = this;
        window.fetch = async function(url, options) {
            if (options && options.body) {
                self.cacheRequestParams(url, options.body);
            }
            return self.originalFetch.apply(this, arguments);
        };
    }

    sendApiRequest(rpcId, rpcPayload) {
        return new Promise((resolve, reject) => {
            if (!this.requestCache.at || !this.requestCache.targetUrl) {
                return reject(new Error("Cache is empty. Please refresh Gemini."));
            }
            const innerPayload = JSON.stringify(rpcPayload);
            const f_req = JSON.stringify([[[rpcId, innerPayload, null, "generic"]]]);
            const formData = new URLSearchParams();
            formData.append("f.req", f_req);
            formData.append("at", this.requestCache.at);
            formData.append("f.sid", this.requestCache.f_sid);
            formData.append("bl", this.requestCache.bl);
            formData.append("rt", this.requestCache.rt);
            formData.append("_reqid", this.requestCache._reqid_base + 1);
            this.requestCache._reqid_base++;
            const xhr = new XMLHttpRequest();
            this.originalXHROpen.call(xhr, "POST", this.requestCache.targetUrl, true);
            xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8");
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const cleanedResponse = xhr.responseText.substring(4);
                    resolve(JSON.parse(cleanedResponse));
                } else {
                    reject(new Error(`API request failed: ${xhr.status}`));
                }
            };
            xhr.onerror = () => reject(new Error("Network error"));
            this.originalXHRSend.call(xhr, formData.toString());
        });
    }

    async createChat(initialMessage = "Hello", gemId = null) {
        console.log(`📤 Creating chat: "${initialMessage.substring(0, 50)}..."`);
        if (gemId) {
            console.log(`💎 Attempting to use Gem ID: ${gemId}`);
        }
        
        // Rebuild payload to exactly match Gemini's structure from the captured request
        const innerPayload = [
            [initialMessage, 0, null, null, null, null, 0],     // [0] - message
            ["en"],                                              // [1] - language
            ["", "", "", null, null, null, null, null, null, ""], // [2] - context strings
            this.requestCache.streamGenerate.snlm0Token,         // [3] - SNlM0 token
            this.generateUUID(),                                 // [4] - UUID
            null,                                                // [5]
            [1],                                                 // [6]
            1,                                                   // [7]
            null, null,                                          // [8-9]
            1,                                                   // [10]
            0,                                                   // [11]
            null, null, null, null, null,                        // [12-16]
            [[0]],                                               // [17]
            0,                                                   // [18] - seems to be always 0
            gemId || null,                                       // [19] - GEM ID GOES HERE!
            null, null, null, null, null, null, null,            // [20-26]
            1,                                                   // [27]
            null, null,                                          // [28-29]
            [4],                                                 // [30]
            null, null, null, null, null, null, null, null, null, null, // [31-40]
            [1],                                                 // [41]
            null, null, null, null, null, null, null, null, null, null, null, // [42-52]
            0,                                                   // [53]
            null, null, null, null, null,                        // [54-58]
            this.generateUUID(),                                 // [59] - second UUID
            null, [],                                            // [60-61]
            null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, // [62-99]
            []                                                   // [100]
        ];
        
        if (gemId) {
            console.log(`💎 Inserted Gem ID "${gemId}" at payload[19]`);
        } else {
            console.log(`📝 No Gem ID - creating chat in default context`);
        }
        
        const freqPayload = [null, JSON.stringify(innerPayload)];
        
        // Also try adding gem to the URL path like the browser does
        let url = `https://gemini.google.com${STREAM_GENERATE_URL}?bl=${this.requestCache.bl}&f.sid=${this.requestCache.f_sid}&hl=en&_reqid=${this.requestCache._reqid_base++}&rt=c`;
        
        if (gemId) {
            // Add source-path parameter to mimic what the browser does
            url += `&source-path=${encodeURIComponent('/gem/' + gemId)}`;
            console.log(`💎 Added source-path to URL: /gem/${gemId}`);
        }
        
        const formData = new URLSearchParams();
        formData.append("f.req", JSON.stringify(freqPayload));
        formData.append("at", this.requestCache.streamGenerate.at || this.requestCache.at);
        
        console.log("🔍 Final URL:", url);
        
        const response = await this.originalFetch.call(window, url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: formData.toString()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("❌ StreamGenerate request failed:", response.status, errorText);
            throw new Error(`StreamGenerate failed: ${response.status}. Response: ${errorText.substring(0, 100)}...`);
        }
        
        const responseText = await response.text();
        console.log("🔥 Response received (length: %d chars)", responseText.length);
        
        const { chatId, responseText: aiResponse } = this.parseStreamResponse(responseText);

        if (chatId) {
            console.log(`✅ Chat created: ${chatId}`);
            console.log(`📝 Summary extracted: ${aiResponse ? 'YES' : 'NO'}`);
            if (aiResponse) {
                console.log(`📄 Summary preview: "${aiResponse.substring(0, 100)}..."`);
            }
            return { chatId: chatId, responseText: aiResponse };
        }
        
        console.error("❌ Could not parse chat ID. Response snippet:", responseText.substring(0, 500));
        throw new Error("Could not extract chat ID from API");
    }

    /**
     * FIXED v0.4.9: Debug version - let's see what we're actually getting
     */
    parseStreamResponse(responseText) {
        let chatId = null;
        let aiResponse = null;
        let longestResponse = ""; 
        let allFoundTexts = []; // DEBUG: Track all texts we find

        try {
            const lines = responseText.split('\n');
            console.log(`🔍 Parsing ${lines.length} lines from stream response`);
            
            for (const line of lines) {
                if (!line.startsWith('[["wrb.fr"')) {
                    continue;
                }

                try {
                    const json = JSON.parse(line);
                    const innerDataString = json[0][2];
                    if (!innerDataString) continue;

                    const innerData = JSON.parse(innerDataString);
                    
                    // --- Find Chat ID ---
                    if (!chatId) {
                        const foundChatId = innerData[1] && innerData[1][0];
                        if (foundChatId && foundChatId.startsWith('c_')) {
                            chatId = foundChatId.substring(2);
                            console.log("✅ Found chat ID:", chatId);
                        }
                    }

                    // --- Find AI Response - try ONLY path 1 for now ---
                    if (innerData[4]?.[0]?.[1]?.[0]) {
                        const text = innerData[4][0][1][0];
                        if (typeof text === 'string' && text.trim()) {
                            allFoundTexts.push({
                                length: text.length,
                                preview: text.substring(0, 80).replace(/\n/g, ' ')
                            });
                            
                            if (text.length > longestResponse.length) {
                                longestResponse = text;
                            }
                        }
                    }

                } catch (lineError) {
                    continue;
                }
            }
            
            // DEBUG: Show what we found
            console.log(`📊 Found ${allFoundTexts.length} text chunks:`);
            allFoundTexts.forEach((item, i) => {
                console.log(`  ${i + 1}. Length: ${item.length} | Preview: "${item.preview}..."`);
            });
            
            if (longestResponse.trim()) {
                aiResponse = longestResponse.trim();
                console.log(`✅ Using longest response: ${aiResponse.length} chars`);
                console.log(`📄 First 200 chars: "${aiResponse.substring(0, 200)}..."`);
                console.log(`📄 Last 200 chars: "...${aiResponse.substring(aiResponse.length - 200)}"`);
            } else {
                console.warn("⚠️ No response text found!");
            }

        } catch (e) {
            console.error("❌ Error parsing stream response:", e);
            console.log("Response snippet:", responseText.substring(0, 1000));
        }
        
        return { chatId: chatId, responseText: aiResponse };
    }
    
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16).toUpperCase();
        });
    }

    async deleteChat(chatId) {
        const apiChatId = chatId.startsWith('c_') ? chatId : `c_${chatId}`;
        console.log(`🗑️ Deleting chat: ${apiChatId}`);
        const response = await this.sendApiRequest(DELETE_RPC_ID, [apiChatId]); 
        console.log(`✅ Chat deleted`);
        return response;
    }

    isReady() {
        const status = {
            at: !!(this.requestCache.at || (this.requestCache.streamGenerate && this.requestCache.streamGenerate.at)),
            snlm0Token: !!(this.requestCache.streamGenerate && this.requestCache.streamGenerate.snlm0Token)
        };
        status.all = status.at && status.snlm0Token;
        return status;
    }
}

// --- INITIALIZATION ----------------------------------
if (!window.geminiApiTester) {
    window.geminiApiTester = new GeminiAPITester();
}