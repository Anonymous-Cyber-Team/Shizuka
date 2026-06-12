/* ===================================================
 * প্রজেক্ট সিজুকা - ব্রেইন (gemini.js -> openai) v2.0
 * Migrated to OpenAI SDK / FreeLLMAPI Proxy
 * ===================================================
 */

const { OpenAI } = require("openai");
const moment = require("moment-timezone");
const fs = require("fs-extra");
const path = require("path");
const teachManager = require("./utils/teachManager");

// === Helper Function for Response Sanitization ===
function sanitizeAIResponse(text) {
  if (!text) return "";
  let segments = text.split(/(?<=[।?!.])/);
  let uniqueSegments = [];
  let seen = new Set();
  for (let seg of segments) {
    let trimmed = seg.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      uniqueSegments.push(trimmed);
    }
  }
  let cleanedText = uniqueSegments.join(" ").trim();
  return cleanedText;
}

// === ১. কনফিগারেশন লোড ===
let config;
let FREE_LLM_API_KEYS = [];
let currentApiKeyIndex = 0;

try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
  FREE_LLM_API_KEYS = config.FREE_LLM_API_KEYS || [];

  if (!Array.isArray(FREE_LLM_API_KEYS) || FREE_LLM_API_KEYS.length === 0) {
    console.error("[LLM Config Error] 'FREE_LLM_API_KEYS' is not properly set in config.json.");
    FREE_LLM_API_KEYS = [];
  } else {
    console.log(`[LLM Keys] Loaded ${FREE_LLM_API_KEYS.length} API Keys.`);
  }
} catch (error) {
  console.error("[LLM Config Error] Failed to load 'config.json':", error);
  config = {};
  FREE_LLM_API_KEYS = [];
}

let shizukaPersona = "আমি সিজুকা, আপনার বন্ধু।";
try {
  shizukaPersona = fs.readFileSync(path.join(__dirname, "persona.txt"), "utf8");
} catch (error) {
  console.warn("[LLM Warn] 'persona.txt' not found. Using default persona.");
}

function getNextApiKey() {
  if (FREE_LLM_API_KEYS.length === 0) {
    console.error("[LLM Error] No API Key loaded!");
    return null;
  }
  const key = FREE_LLM_API_KEYS[currentApiKeyIndex];
  currentApiKeyIndex = (currentApiKeyIndex + 1) % FREE_LLM_API_KEYS.length;
  return key;
}

// === ৩. কনভারসেশন ক্যাশ ===
const conversationHistory = new Map();
const HISTORY_MAX_AGE_MS = 1 * 60 * 60 * 1000;
const HISTORY_MAX_LENGTH = 10; 

function clearOldHistory() {
  const now = Date.now();
  conversationHistory.forEach((data, threadID) => {
    if (now - data.timestamp > HISTORY_MAX_AGE_MS) {
      conversationHistory.delete(threadID);
      console.log(`[History] Deleted history for thread ${threadID} after 1 hour.`);
    }
  });
}
setInterval(clearOldHistory, 5 * 60 * 1000);

// === ৪. সময় ও দিনের অংশ বের করার ফাংশন ===
function getCurrentTimeInfo() {
  const now = moment().tz("Asia/Dhaka");
  const time = now.format("h:mm A");
  const date = now.format("D MMMM YYYY");
  const day = now.format("dddd");
  let dayPart = "দিন";
  const hour = now.hour();
  if (hour >= 5 && hour < 12) dayPart = "সকাল";
  else if (hour >= 12 && hour < 17) dayPart = "দুপুর";
  else if (hour >= 17 && hour < 20) dayPart = "সন্ধ্যা";
  else dayPart = "রাত";
  return { time, date, day, dayPart };
}

// === ৫. মূল রিপ্লাই জেনারেটর ফাংশন ===
async function getShizukaReply(threadID, userPrompt, senderName = null) {
  console.log(`\n--- [LLM Call Start - Thread: ${threadID}] ---`);

  const SALAM_PROMPT_KEY = "##SALAM_REPLY_REQUEST##";
  const REPLY_PROMPT_KEY = "##REPLY_PROMPT_REQUEST##";
  const BAD_WORD_PROMPT_KEY = "##BAD_WORD_WARNING##";
  let specialPromptInstruction = null;

  if (userPrompt.startsWith(SALAM_PROMPT_KEY)) {
    specialPromptInstruction = `[System Note: Greet with a proper Islamic greeting reply based on persona.txt.]`;
    userPrompt = "কেউ সালাম দিয়েছে, উত্তর দাও।";
  } else if (userPrompt.startsWith(REPLY_PROMPT_KEY)) {
    specialPromptInstruction = `[System Note: Ask for a reply following persona.txt style.]`;
    userPrompt = "আমাকে কিছু একটা জিজ্ঞেস করো বা রিপ্লাই দিতে বলো।";
  } else if (userPrompt.startsWith(BAD_WORD_PROMPT_KEY)) {
    const badWordContext = userPrompt.substring(BAD_WORD_PROMPT_KEY.length).trim();
    specialPromptInstruction = `[System Note: Someone used a bad word (${badWordContext || "unknown"}). Say 'Astaghfirullah' and politely but firmly warn them following your Shizuka persona.]`;
    userPrompt = `আমি একটি গালি দিয়েছি: ${badWordContext}`;
  }

  if (!specialPromptInstruction) {
    const taughtAnswer = teachManager.findAnswer(userPrompt);
    if (taughtAnswer) {
      console.log(`[LLM Teach] Found taught answer. Returning immediately.`);
      return taughtAnswer + " 😊";
    }
  }

  const { time, date, day, dayPart } = getCurrentTimeInfo();
  const timeContextNote = `[System Note: Current time is ${time}, ${dayPart}. Date is ${date}, ${day}. Use this context naturally if needed.]`;

  let eventContextNote = "";
  try {
    const eventsPath = path.join(__dirname, "upcoming_events.json");
    if (fs.existsSync(eventsPath)) {
      const eventsData = JSON.parse(fs.readFileSync(eventsPath, "utf8"));
      if (eventsData.length > 0) {
        const eventNames = eventsData.map((e) => `${e.date}: ${e.name} (${e.type})`).join(", ");
        eventContextNote = `[System Note: Upcoming events for the next 7 days: ${eventNames}. Use if relevant.]`;
      }
    }
  } catch (e) {
    console.error("[LLM Event Context Error]:", e.message);
  }

  const isScheduledTask = String(threadID).startsWith("SCHEDULED_TASK_");
  let finalUserPromptForHistory = userPrompt;
  let systemInstruction = "";
  let fullPromptForAI = "";

  if (specialPromptInstruction) {
    systemInstruction = specialPromptInstruction;
    fullPromptForAI = userPrompt;
  } else if (isScheduledTask) {
    systemInstruction = `[System Note: Address everyone in plural. No specific gender references.]`;
    fullPromptForAI = `Task: "${userPrompt}"`;
  } else if (senderName) {
    systemInstruction = `[System Note: User's name is "${senderName}".]`;
    fullPromptForAI = userPrompt;
  } else {
    fullPromptForAI = userPrompt;
  }

  const combinedSystemInstruction = `${shizukaPersona}\n\n${timeContextNote}\n${eventContextNote}\n${systemInstruction}`;

  const historyKey = String(threadID);
  let currentHistory = conversationHistory.get(historyKey)?.history || [];

  // Construct OpenAI messages array
  const messages = [
    { role: "system", content: combinedSystemInstruction }
  ];

  // Conversation history
  for (const msg of currentHistory) {
    messages.push(msg);
  }

  // Current user message
  const userMessageObj = { role: "user", content: fullPromptForAI };
  messages.push(userMessageObj);

  let botReply = "";
  try {
    const apiKeyUsed = getNextApiKey();
    if (!apiKeyUsed) throw new Error("No valid API Key found.");

    const openai = new OpenAI({
      apiKey: apiKeyUsed,
      baseURL: config.FREE_LLM_BASE_URL || "https://api.freellmapi.com/v1"
    });

    const modelList = config.AI_MODEL_NAMES || ["gpt-3.5-turbo"];
    let success = false;
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      const modelName = modelList[Math.floor(Math.random() * modelList.length)];
      console.log(`[LLM Debug] Attempt ${attempt}: Calling OpenAI with model: ${modelName}`);

      try {
        const response = await openai.chat.completions.create({
          model: modelName,
          messages: messages,
          temperature: 0.6
        });

        botReply = response.choices[0]?.message?.content || "";
        success = true;
        break;
      } catch (err) {
        lastError = err;
        console.warn(`[LLM Warn] Attempt ${attempt} failed with model ${modelName}:`, err.message);
      }
    }

    if (!success) {
      throw lastError;
    }

    botReply = sanitizeAIResponse(botReply);

    if (!botReply) throw new Error("Received empty reply from LLM.");

    // Save to history (User + Assistant)
    if (!isScheduledTask && !specialPromptInstruction) {
      currentHistory.push({ role: "user", content: finalUserPromptForHistory });
      currentHistory.push({ role: "assistant", content: botReply });
      
      if (currentHistory.length > HISTORY_MAX_LENGTH * 2) {
        currentHistory = currentHistory.slice(-(HISTORY_MAX_LENGTH * 2));
      }
      
      conversationHistory.set(historyKey, {
        history: currentHistory,
        timestamp: Date.now(),
      });
    }

    console.log(`--- [LLM Call End - Thread: ${threadID} (Success)] ---`);
    return botReply;

  } catch (error) {
    console.error(`❌ [LLM Error - Thread: ${historyKey}] Call failed!`);
    console.error("[LLM Error Details]:", error.message);

    let specificErrorMessage = "উফফ! আমার উত্তর খুঁজে আনতে একটু সমস্যা হচ্ছে। 😥 আবার চেষ্টা করবেন?";
    
    if (error.status === 401 || error.status === 403) {
      specificErrorMessage = "একটি API Key তে সমস্যা হয়েছে। অ্যাডমিন শীঘ্রই ঠিক করবেন।";
    } else if (error.status === 429) {
      specificErrorMessage = "দুঃখিত, আমি এখন একটু বেশি ব্যস্ত। 😥 কিছুক্ষণ পর আবার চেষ্টা করুন।";
    }

    throw new Error(specificErrorMessage);
  }
}

async function clearChatHistory(threadID) {
  const historyKey = String(threadID);
  conversationHistory.delete(historyKey);
  console.log(`[LLM Debug] Cleared chat history for Thread: ${historyKey}`);
}

module.exports = {
  getShizukaReply,
  clearChatHistory,
};
