/* ===================================================
 * প্রজেক্ট সিজুকা - ব্রেইন (gemini.js) v1.7 - Enhanced Logging
 * - Added detailed logs for API key usage, prompts, and errors.
 * ===================================================
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const moment = require("moment-timezone");
const fs = require("fs-extra");
const path = require("path");
const teachManager = require("./utils/teachManager");

// === ১. কনফিগারেশন লোড ===
let config;
let GEMINI_API_KEYS = []; // Initialize as empty array
let currentApiKeyIndex = 0; // Initialize index

try {
  config = JSON.parse(
    fs.readFileSync(path.join(__dirname, "config.json"), "utf8"),
  );
  GEMINI_API_KEYS = config.GEMINI_API_KEYS; // Assign from config

  // Validate API Keys
  if (
    !Array.isArray(GEMINI_API_KEYS) ||
    GEMINI_API_KEYS.length === 0 ||
    GEMINI_API_KEYS.some((key) => !key || typeof key !== "string")
  ) {
    console.error(
      "[Gemini Config Error] 'GEMINI_API_KEYS' অ্যারে সঠিকভাবে config.json এ সেট করা নেই বা খালি।",
    );
    GEMINI_API_KEYS = []; // Reset to empty if invalid
  } else {
    console.log(
      `[Gemini Keys] ${GEMINI_API_KEYS.length} টি API Key লোড হয়েছে।`,
    );
  }
} catch (error) {
  console.error(
    "[Gemini Config Error] 'config.json' ফাইলটি লোড করা যায়নি:",
    error,
  );
  config = {}; // Set empty config on error
  GEMINI_API_KEYS = []; // Ensure keys array is empty on error
}

// Default persona
let shizukaPersona = "আমি সিজুকা, আপনার বন্ধু।";
try {
  shizukaPersona = fs.readFileSync(path.join(__dirname, "persona.txt"), "utf8");
} catch (error) {
  console.warn(
    "[Gemini Warn] 'persona.txt' ফাইলটি পাওয়া যায়নি। ডিফল্ট পার্সোনা ব্যবহার করা হচ্ছে।",
  );
}

// --- Round Robin পদ্ধতিতে পরবর্তী API Key পাওয়ার ফাংশন ---
function getNextApiKey() {
  // Handle case where no keys are loaded
  if (GEMINI_API_KEYS.length === 0) {
    console.error("[Gemini Error] কোনো API Key লোড হয়নি!");
    return null;
  }
  const keyIndexToUse = currentApiKeyIndex; // Log the index being used *now*
  const key = GEMINI_API_KEYS[keyIndexToUse];
  currentApiKeyIndex = (currentApiKeyIndex + 1) % GEMINI_API_KEYS.length; // Calculate next index
  console.log(
    `[Gemini Debug] Using API Key Index: ${keyIndexToUse}, Next Index Will Be: ${currentApiKeyIndex}`,
  );
  return key;
}

// === ৩. কনভারসেশন ক্যাশ ===
const conversationHistory = new Map();
const HISTORY_MAX_AGE_MS = 1 * 60 * 60 * 1000; // ১ ঘণ্টা
const HISTORY_MAX_LENGTH = 10; // শেষ ১০টি মেসেজ (User + Model pairs)

function clearOldHistory() {
  /* ... (অপরিবর্তিত) ... */ const now = Date.now();
  conversationHistory.forEach((data, threadID) => {
    if (now - data.timestamp > HISTORY_MAX_AGE_MS) {
      conversationHistory.delete(threadID);
      console.log(
        `[History] ১ ঘণ্টা পার হওয়ায় ${threadID} গ্রুপের/ইনবক্সের স্মৃতি মুছে ফেলা হলো।`,
      );
    }
  });
}
setInterval(clearOldHistory, 5 * 60 * 1000);

// === ৪. সময় ও দিনের অংশ বের করার ফাংশন ===
function getCurrentTimeInfo() {
  /* ... (অপরিবর্তিত) ... */ const now = moment().tz("Asia/Dhaka");
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
  console.log(`\n--- [Gemini Call Start - Thread: ${threadID}] ---`);
  console.log(
    `[Gemini Debug] Initial User Prompt: "${userPrompt.substring(0, 100)}..."`,
  );
  console.log(`[Gemini Debug] Sender Name: ${senderName}`);

  // ক. বিশেষ প্রম্পট কী শনাক্তকরণ
  const SALAM_PROMPT_KEY = "##SALAM_REPLY_REQUEST##";
  const REPLY_PROMPT_KEY = "##REPLY_PROMPT_REQUEST##";
  const BAD_WORD_PROMPT_KEY = "##BAD_WORD_WARNING##";
  let specialPromptInstruction = null; // AI-কে দেওয়া বিশেষ নির্দেশনা

  if (userPrompt.startsWith(SALAM_PROMPT_KEY)) {
    /* ... (অপরিবর্তিত) ... */ specialPromptInstruction = `[সিস্টেম নোট: persona.txt-তে "সালামের উত্তর" নির্দেশিকা অনুযায়ী একটি সুন্দর, ভ্যারিয়েড এবং সিজুকা-স্টাইলের সালামের উত্তর তৈরি করো।]`;
    console.log(`[Gemini Special] সালামের উত্তর তৈরি হচ্ছে...`);
    userPrompt = "";
  } else if (userPrompt.startsWith(REPLY_PROMPT_KEY)) {
    /* ... (অপরিবর্তিত) ... */ specialPromptInstruction = `[সিস্টেম নোট: persona.txt এর চরিত্র ও নিয়মাবলি কঠোরভাবে অনুসরণ করে ব্যবহারকারীর কাছ থেকে একটি রিপ্লাই চাওয়ার মেসেজ তৈরি করো।]`;
    console.log(`[Gemini Special] রিপ্লাই চাওয়ার বার্তা তৈরি হচ্ছে...`);
    userPrompt = "";
  } else if (userPrompt.startsWith(BAD_WORD_PROMPT_KEY)) {
    /* ... (অপরিবর্তিত) ... */ const badWordContext = userPrompt
      .substring(BAD_WORD_PROMPT_KEY.length)
      .trim();
    specialPromptInstruction = `[সিস্টেম নোট: একজন ব্যবহারকারী গ্রুপে একটি খারাপ শব্দ (${
      badWordContext || "অজানা"
    }) ব্যবহার করেছে। তুমি **"আস্তাগফিরুল্লাহ" দিয়ে শুরু** করে, শিজুকা স্টাইলে মিষ্টি করে কিন্তু দৃঢ়ভাবে বলো যে গ্রুপে গালিগালাজ করা বা খারাপ ভাষা ব্যবহার করা উচিত নয়, এতে আল্লাহ গুনাহ দেন এবং গ্রুপের পরিবেশ নষ্ট হয়। তাকে ভদ্রভাবে কথা বলতে অনুরোধ করো। **প্রতিবার ভিন্ন ভিন্ন বাক্য** ব্যবহার করবে।]`;
    console.log(`[Gemini Special] গালি ওয়ার্নিং তৈরি হচ্ছে...`);
    userPrompt = "";
  }

  // খ. Teach ডেটা চেক করা (যদি না এটা বিশেষ প্রম্পট হয়)
  if (!specialPromptInstruction) {
    console.log("[Gemini Debug] Checking Teach data...");
    const taughtAnswer = teachManager.findAnswer(userPrompt);
    if (taughtAnswer) {
      console.log(
        `[Gemini Teach] Found taught answer for "${userPrompt.substring(
          0,
          30,
        )}...". Returning immediately.`,
      );
      console.log(`--- [Gemini Call End - Thread: ${threadID} (Teach)] ---`);
      return taughtAnswer + " 😊";
    }
    console.log("[Gemini Debug] No taught answer found.");
  } else {
    console.log("[Gemini Debug] Skipping Teach check due to special prompt.");
  }

  // গ. সর্বদা সময় ও দিনের অংশ ইনজেক্ট করা
  const { time, date, day, dayPart } = getCurrentTimeInfo();
  const timeContextNote = `[সিস্টেম নোট (সর্বদা প্রযোজ্য): বর্তমান সময় ${time}, ${dayPart} বেলা। আজকের তারিখ ${date}, ${day}। এই সময়জ্ঞান তোমার উত্তরে প্রাসঙ্গিকভাবে ব্যবহার করতে পারো। এই নোটটি ব্যবহারকারীকে দেখাবে না।]`;

  // ঘ. স্বয়ংক্রিয়/ব্যক্তিগত বার্তা নির্ধারণ ও চূড়ান্ত প্রম্পট তৈরি
  const isScheduledTask = threadID.startsWith("SCHEDULED_TASK_");
  let finalUserPromptForHistory = userPrompt; // Save original prompt for history if needed
  let systemInstruction = "";
  let fullPromptForAI = ""; // This will hold the final text sent to the API

  if (specialPromptInstruction) {
    fullPromptForAI = `${timeContextNote}\n${specialPromptInstruction}`;
    console.log("[Gemini Debug] Using Special Prompt Instruction for AI.");
  } else if (isScheduledTask) {
    systemInstruction = `[সিস্টেম নোট: এটি একটি স্বয়ংক্রিয় বার্তা যা গ্রুপের **সবার উদ্দেশ্যে** বলা হচ্ছে। উত্তরে অবশ্যই 'আপনারা', 'আপনাদের', 'সবাই' ইত্যাদি **বহুবচন** ব্যবহার করবে। **কোনো নির্দিষ্ট লিঙ্গবাচক সম্বোধন (ভাইয়া/আপু) ব্যবহার করবে না**। STRICTLY follow the personality and behavioral rules defined in the external persona.txt file. এই নোটটি ব্যবহারকারীকে দেখাবে না।]`;
    fullPromptForAI = `${timeContextNote}\n${systemInstruction}\n\nমূল টপিক: "${userPrompt}"`;
    console.log("[Gemini Debug] Using Scheduled Task Instruction for AI.");
  } else if (senderName) {
    systemInstruction = `[সিস্টেম নোট: ব্যবহারকারীর নাম "${senderName}"। STRICTLY follow the personality and behavioral rules defined in the external persona.txt file. এই নোটটি ব্যবহারকারীকে দেখাবে না।]`;
    fullPromptForAI = `${timeContextNote}\n${systemInstruction}\n\nকাজ/প্রশ্ন: "${userPrompt}"`;
    finalUserPromptForHistory = userPrompt; // Keep original prompt separately for history
    console.log("[Gemini Debug] Using User-Specific Instruction for AI.");
  } else {
    // General case (likely admin in inbox or other scenarios without sender name)
    systemInstruction =
      "[সিস্টেম নোট: STRICTLY follow the personality and behavioral rules defined in the external persona.txt file.]";
    fullPromptForAI = `${timeContextNote}\n${systemInstruction}\n\nকাজ/প্রশ্ন: "${userPrompt}"`;
    console.log("[Gemini Debug] Using General Instruction for AI.");
  }
  console.log(
    `[Gemini Debug] Final Prompt For AI (first 100 chars): "${fullPromptForAI.substring(
      0,
      100,
    )}..."`,
  );

  // ঙ. পুরনো ইতিহাস লোড করা
  const historyKey = String(threadID);
  let currentHistory = conversationHistory.get(historyKey)?.history || [
    { role: "user", parts: [{ text: shizukaPersona }] },
    {
      role: "model",
      parts: [
        { text: "আমি সিজুকা, আপনার বন্ধু। বলুন কিভাবে সাহায্য করতে পারি? 🌸" },
      ],
    },
  ];
  console.log(
    `[Gemini Debug] Loaded history length: ${currentHistory.length} parts.`,
  );

  // চ. নতুন মেসেজ ইতিহাসে যোগ করা (Use original prompt for history)
  // Use the actual user's message here, not the system instructions
  const userMessageForHistory = specialPromptInstruction
    ? "[বিশেষ নির্দেশনা]"
    : finalUserPromptForHistory;
  currentHistory.push({
    role: "user",
    parts: [{ text: userMessageForHistory }],
  });
  console.log(
    `[Gemini Debug] Added user message to history. New length: ${currentHistory.length}`,
  );

  // ছ. ইতিহাস ছাঁটাই
  if (currentHistory.length > HISTORY_MAX_LENGTH * 2) {
    // Allow for user+model pairs
    const oldLength = currentHistory.length;
    currentHistory = [
      currentHistory[0], // Persona
      currentHistory[1], // Initial model response
      ...currentHistory.slice(-(HISTORY_MAX_LENGTH * 2 - 2)), // Keep last N pairs
    ];
    console.log(
      `[Gemini Debug] Pruned history from ${oldLength} to ${currentHistory.length} parts.`,
    );
  }

  // জ. জেমিনিকে কল করা (মাল্টি-কী ব্যবহার করে)
  let botReply = "";
  let apiKeyUsed = null; // Track the key for logging
  try {
    apiKeyUsed = getNextApiKey(); // Get the key *before* using it
    if (!apiKeyUsed) {
      throw new Error("কোনো ভ্যালিড API Key পাওয়া যায়নি।");
    }
    console.log(
      `[Gemini Debug] Attempting API call with key index ${
        currentApiKeyIndex - 1 < 0
          ? GEMINI_API_KEYS.length - 1
          : currentApiKeyIndex - 1
      }...`,
    ); // Log index used

    const genAI = new GoogleGenerativeAI(apiKeyUsed);

    // ============ [PERMANENT FIX FOR REPETITION] ============
    const model = genAI.getGenerativeModel({
      model: "models/gemma-3-27b-it",
      generationConfig: {
        temperature: 0.6,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 150,
        frequencyPenalty: 1.0,
        presencePenalty: 0.5,
      },
    });
    // ========================================================

    console.log(
      `[Gemini Debug] Starting chat with history (length ${currentHistory.length})...`,
    );
    const chat = model.startChat({ history: currentHistory });

    // Send the constructed prompt (which includes instructions etc.)
    const result = await chat.sendMessage(fullPromptForAI);
    console.log("[Gemini Debug] API call successful. Waiting for response...");
    const response = await result.response;

    if (!response || typeof response.text !== "function") {
      console.error(
        "[Gemini Error] Invalid response structure received from API:",
        response,
      );
      throw new Error("Gemini থেকে একটি অপ্রত্যাশিত উত্তর এসেছে।");
    }

    botReply = response.text();
    console.log(
      `[Gemini Debug] Received text response: "${botReply.substring(
        0,
        100,
      )}..."`,
    );

    if (!botReply) {
      console.warn("[Gemini Warn] Received an EMPTY text response from API.");
      // Decide if you want to throw an error or return a default message
      throw new Error("Gemini থেকে খালি উত্তর এসেছে।");
    }

    // ঝ. বটের উত্তর ইতিহাসে সেভ করা (যদি না শিডিউলড/স্পেশাল টাস্ক হয়)
    if (!isScheduledTask && !specialPromptInstruction) {
      currentHistory.push({ role: "model", parts: [{ text: botReply }] });
      // Re-prune if adding the model reply exceeded the limit again (edge case)
      if (currentHistory.length > HISTORY_MAX_LENGTH * 2 + 1) {
        // +1 for the just added model reply
        const oldLen = currentHistory.length;
        currentHistory = [
          currentHistory[0],
          currentHistory[1],
          ...currentHistory.slice(-(HISTORY_MAX_LENGTH * 2 - 2)),
        ];
        console.log(
          `[Gemini Debug] Pruned history AGAIN after adding model reply from ${oldLen} to ${currentHistory.length}`,
        );
      }
      conversationHistory.set(historyKey, {
        history: currentHistory,
        timestamp: Date.now(),
      });
      console.log(
        `[Gemini Debug] Saved model reply to history for Thread: ${historyKey}. History length: ${currentHistory.length}`,
      );
    } else {
      console.log(
        `[Gemini Debug] Skipping history save for scheduled/special task.`,
      );
    }

    console.log(`--- [Gemini Call End - Thread: ${threadID} (Success)] ---`);
    return botReply;
  } catch (error) {
    console.error(
      `❌ [Gemini Error - Thread: ${historyKey}] Call failed! Key Index Used: ${
        apiKeyUsed
          ? currentApiKeyIndex - 1 < 0
            ? GEMINI_API_KEYS.length - 1
            : currentApiKeyIndex - 1
          : "N/A"
      }`,
    );
    // Log the full error object for more details
    console.error("[Gemini Error Details]:", error);

    let specificErrorMessage =
      "উফফ! আমার উত্তর খুঁজে আনতে একটু সমস্যা হচ্ছে। 😥 আবার চেষ্টা করবেন?";
    // Check error properties carefully
    const errorMessage = error.message || "";
    const errorStatus = error.status || error.code; // Some errors use 'code'
    const errorDetails =
      error.details || (error.response ? error.response.data : null); // Look deeper for details

    console.log(
      `[Gemini Error Debug] Message: "${errorMessage}", Status: ${errorStatus}`,
    );
    // console.log("[Gemini Error Debug] Details:", JSON.stringify(errorDetails, null, 2)); // Uncomment for very detailed error data

    if (
      errorMessage.includes("API key not valid") ||
      errorStatus === 400 ||
      errorStatus === 403
    ) {
      console.error(
        `FATAL: API Key at index ${
          apiKeyUsed
            ? currentApiKeyIndex - 1 < 0
              ? GEMINI_API_KEYS.length - 1
              : currentApiKeyIndex - 1
            : "N/A"
        } might be invalid or blocked! Please check config.json.`,
      );
      specificErrorMessage =
        "একটি API Key তে সমস্যা হয়েছে। অ্যাডমিন শীঘ্রই ঠিক করবেন।";
    } else if (
      errorMessage.includes("429") ||
      errorStatus === 429 ||
      errorMessage.includes("rate limit")
    ) {
      specificErrorMessage =
        "দুঃখিত, আমি এখন একটু বেশি ব্যস্ত। 😥 কিছুক্ষণ পর আবার চেষ্টা করুন। (API Limit)";
      console.warn(
        `[Gemini Warn] Rate limit likely exceeded for key index ${
          apiKeyUsed
            ? currentApiKeyIndex - 1 < 0
              ? GEMINI_API_KEYS.length - 1
              : currentApiKeyIndex - 1
            : "N/A"
        }.`,
      );
    } else if (
      errorMessage.includes("SAFETY") ||
      (errorDetails && JSON.stringify(errorDetails).includes("SAFETY"))
    ) {
      specificErrorMessage =
        "দুঃখিত, আপনার প্রশ্নটি আমি বুঝতে পারছি না বা উত্তর দিতে পারছি না। 🥺 অন্যভাবে জিজ্ঞাসা করবেন?";
      console.warn(`[Gemini Warn] Safety settings blocked the response.`);
    } else if (
      errorMessage.includes("content") &&
      errorMessage.includes("empty")
    ) {
      // This case might be handled by the earlier !botReply check, but added for robustness
      specificErrorMessage = "Gemini থেকে খালি উত্তর এসেছে। আবার চেষ্টা করুন।";
      console.warn(`[Gemini Warn] Explicit empty content error.`);
    }
    // Add more specific checks based on observed errors if needed

    console.log(
      `[Gemini Debug] Throwing error with message: "${specificErrorMessage}"`,
    );
    console.log(`--- [Gemini Call End - Thread: ${threadID} (Error)] ---`);
    throw new Error(specificErrorMessage); // Throw the user-friendly message
  }
}

// === ৫.৫. চ্যাট হিস্টরি ক্লিয়ার ফাংশন ===
async function clearChatHistory(threadID) {
  const historyKey = String(threadID);
  conversationHistory.delete(historyKey);
  console.log(`[Gemini Debug] Cleared chat history for Thread: ${historyKey}`);
}

// === ৬. ফাংশন এক্সপোর্ট ===
module.exports = {
  getShizukaReply,
  clearChatHistory,
};
