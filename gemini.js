/* ===================================================
 * প্রজেক্ট সিজুকা - ব্রেইন (gemini.js) v1.6 - মার্জ করা সংস্করণ
 * - সর্বদা সময় ও দিনের অংশ AI-কে জানানো হয়
 * - সালাম, রিপ্লাই আবদার, এবং সাধারণ গালি ওয়ার্নিংয়ের জন্য বিশেষ প্রম্পট হ্যান্ডলিং
 * - সিজুকাকে উদ্দেশ্য করে গালি দিলে রোস্টিং নির্দেশনা ব্যবহার
 * - মাল্টি-কী, Teach ডেটা চেক, ব্যক্তিত্ব ইত্যাদি অন্তর্ভুক্ত
 * ===================================================
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const moment = require("moment-timezone");
const fs = require("fs-extra");
const path = require("path");
const teachManager = require("./utils/teachManager"); // Teach Manager ইম্পোর্ট

// === ১. কনফিগারেশন লোড ===
let config;
try {
  config = JSON.parse(
    fs.readFileSync(path.join(__dirname, "config.json"), "utf8")
  );
} catch (error) {
  console.error("Gemini.js: 'config.json' ফাইলটি লোড করা যায়নি।");
  process.exit(1);
}

// *** API Key-এর লিস্ট লোড করা ***
const GEMINI_API_KEYS = config.GEMINI_API_KEYS;

// API Key লিস্ট ভ্যালিড কিনা চেক করা
if (
  !Array.isArray(GEMINI_API_KEYS) ||
  GEMINI_API_KEYS.length === 0 ||
  GEMINI_API_KEYS.some((key) => !key || key.startsWith("YOUR_"))
) {
  console.error(
    "Gemini.js: 'config.json' ফাইলে 'GEMINI_API_KEYS' অ্যারে সঠিকভাবে সেট করা হয়নি।"
  );
  process.exit(1);
}
console.log(`[Gemini Keys] ${GEMINI_API_KEYS.length} টি API Key লোড হয়েছে।`);

let currentApiKeyIndex = 0; // কোন Key ব্যবহার করা হবে তার ইনডেক্স

// --- Round Robin পদ্ধতিতে পরবর্তী API Key পাওয়ার ফাংশন ---
function getNextApiKey() {
  const key = GEMINI_API_KEYS[currentApiKeyIndex];
  currentApiKeyIndex = (currentApiKeyIndex + 1) % GEMINI_API_KEYS.length; // পরবর্তী ইনডেক্স (চক্রাকারে)
  return key;
}

// === ২. জেমিনি মডেল ও ব্যক্তিত্ব সেটআপ ===
const modelName = "gemini-2.5-flash";
let shizukaPersona = "আমি সিজুকা, আপনার বন্ধু।"; // ডিফল্ট পার্সোনা
try {
  shizukaPersona = fs.readFileSync(path.join(__dirname, "persona.txt"), "utf8");
} catch (error) {
  console.warn(
    "Gemini.js: 'persona.txt' ফাইলটি পাওয়া যায়নি। ডিফল্ট পার্সোনা ব্যবহার করা হচ্ছে।"
  );
}

// === ৩. কনভারসেশন ক্যাশ ===
const conversationHistory = new Map();
const HISTORY_MAX_AGE_MS = 1 * 60 * 60 * 1000; // ১ ঘণ্টা
const HISTORY_MAX_LENGTH = 10; // শেষ ১০টি মেসেজ

function clearOldHistory() {
  const now = Date.now();
  conversationHistory.forEach((data, threadID) => {
    if (now - data.timestamp > HISTORY_MAX_AGE_MS) {
      conversationHistory.delete(threadID);
      console.log(
        `[History] ১ ঘণ্টা পার হওয়ায় ${threadID} গ্রুপের/ইনবক্সের স্মৃতি মুছে ফেলা হলো।`
      );
    }
  });
}
setInterval(clearOldHistory, 5 * 60 * 1000);

// === ৪. সময় ও দিনের অংশ বের করার ফাংশন ===
function getCurrentTimeInfo() {
  const now = moment().tz("Asia/Dhaka");
  const time = now.format("h:mm A"); // ১২-ঘণ্টা ফরম্যাট
  const date = now.format("D MMMM YYYY");
  const day = now.format("dddd");
  let dayPart = "দিন"; // ডিফল্ট
  const hour = now.hour();
  if (hour >= 5 && hour < 12) dayPart = "সকাল";
  else if (hour >= 12 && hour < 17) dayPart = "দুপুর";
  else if (hour >= 17 && hour < 20) dayPart = "সন্ধ্যা";
  else dayPart = "রাত"; // ২০ থেকে ৪ পর্যন্ত রাত

  return { time, date, day, dayPart };
}

// === ৫. মূল রিপ্লাই জেনারেটর ফাংশন ===
async function getShizukaReply(threadID, userPrompt, senderName = null) {
  // ক. বিশেষ প্রম্পট কী শনাক্তকরণ
  const SALAM_PROMPT_KEY = "##SALAM_REPLY_REQUEST##";
  const REPLY_PROMPT_KEY = "##REPLY_PROMPT_REQUEST##";
  const BAD_WORD_PROMPT_KEY = "##BAD_WORD_WARNING##";

  let specialPromptInstruction = null; // AI-কে দেওয়া বিশেষ নির্দেশনা

  if (userPrompt.startsWith(SALAM_PROMPT_KEY)) {
    specialPromptInstruction = `[সিস্টেম নোট: persona.txt-তে "সালামের উত্তর" নির্দেশিকা অনুযায়ী একটি সুন্দর, ভ্যারিয়েড এবং সিজুকা-স্টাইলের সালামের উত্তর তৈরি করো।]`;
    console.log(`[Gemini Special] সালামের উত্তর তৈরি হচ্ছে...`);
    userPrompt = ""; // মূল প্রম্পট খালি, শুধু নির্দেশনা ব্যবহৃত হবে
  } else if (userPrompt.startsWith(REPLY_PROMPT_KEY)) {
    specialPromptInstruction = `[সিস্টেম নোট: persona.txt-তে "রিপ্লাই করে বলো" কৌশলের নির্দেশনা অনুযায়ী একটি মিষ্টি, বাচ্চার মতো আবদারের বার্তা তৈরি করো।]`;
    console.log(`[Gemini Special] রিপ্লাই চাওয়ার বার্তা তৈরি হচ্ছে...`);
    userPrompt = "";
  } else if (userPrompt.startsWith(BAD_WORD_PROMPT_KEY)) {
    const badWordContext = userPrompt
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
    const taughtAnswer = teachManager.findAnswer(userPrompt);
    if (taughtAnswer) {
      console.log(
        `[Teach System] "${userPrompt.substring(
          0,
          30
        )}..." এর জন্য শেখানো উত্তর ব্যবহার করা হচ্ছে।`
      );
      return taughtAnswer + " 😊";
    }
  }

  // গ. সর্বদা সময় ও দিনের অংশ ইনজেক্ট করা
  const { time, date, day, dayPart } = getCurrentTimeInfo();
  const timeContextNote = `[সিস্টেম নোট (সর্বদা প্রযোজ্য): বর্তমান সময় ${time}, ${dayPart} বেলা। আজকের তারিখ ${date}, ${day}। এই সময়জ্ঞান তোমার উত্তরে প্রাসঙ্গিকভাবে ব্যবহার করতে পারো। এই নোটটি ব্যবহারকারীকে দেখাবে না।]`;

  // ঘ. স্বয়ংক্রিয়/ব্যক্তিগত বার্তা নির্ধারণ ও চূড়ান্ত প্রম্পট তৈরি
  const isScheduledTask = threadID.startsWith("SCHEDULED_TASK_");
  let finalUserPrompt = userPrompt;
  let systemInstruction = "";

  if (specialPromptInstruction) {
    // বিশেষ প্রম্পটের ক্ষেত্রে শুধু সেই নির্দেশনা এবং সময় জ্ঞান
    finalUserPrompt = `${timeContextNote}\n${specialPromptInstruction}`;
  } else if (isScheduledTask) {
    systemInstruction = `[সিস্টেম নোট: এটি একটি স্বয়ংক্রিয় বার্তা যা গ্রুপের **সবার উদ্দেশ্যে** বলা হচ্ছে। উত্তরে অবশ্যই 'আপনারা', 'আপনাদের', 'সবাই' ইত্যাদি **বহুবচন** ব্যবহার করবে। **কোনো নির্দিষ্ট লিঙ্গবাচক সম্বোধন (ভাইয়া/আপু) ব্যবহার করবে না**। সিজুকার মূল ব্যক্তিত্ব (৭ বছর বয়সী, মিষ্টি, প্রচুর ইমোজি ও স্টাইল) বজায় রাখবে। এই নোটটি ব্যবহারকারীকে দেখাবে না।]`;
    finalUserPrompt = `${timeContextNote}\n${systemInstruction}\n\nমূল টপিক: "${finalUserPrompt}"`;
  } else if (senderName) {
    // গালি/অপমান চেক ও রোস্টিং নির্দেশনা
    systemInstruction = `[সিস্টেম নোট: ব্যবহারকারীর নাম "${senderName}"। **প্রথমে** তার প্রশ্নটি ("${finalUserPrompt}") বিশ্লেষণ করে দেখো এতে কোনো **গালিগালাজ, অপমান বা অশ্লীল ইঙ্গিত** আছে কিনা।
        * **যদি থাকে:** সরাসরি persona.txt-এর **"রোস্টিং (আত্মরক্ষা)"** নির্দেশনা অনুযায়ী একটি বুদ্ধিদীপ্ত, স্যাভেজ কিন্তু ভদ্র উত্তর দাও (উদাহরণ কপি না করে)।
        * **যদি না থাকে:** তাহলে স্বাভাবিকভাবে লিঙ্গ অনুমান করে ('আপু'/'ভাইয়া') তার প্রশ্নের উত্তর দাও।
        সর্বদা সিজুকার মূল ব্যক্তিত্ব (মিষ্টি, ইমোজি, স্টাইল, AI পরিচয় গোপন) বজায় রাখবে। সময় জ্ঞান (${timeContextNote}) ব্যবহার করতে পারো। এই নোটটি ব্যবহারকারীকে দেখাবে না।]`;
    finalUserPrompt = systemInstruction; // চূড়ান্ত প্রম্পট এখন শুধু নির্দেশনা
  } else {
    systemInstruction =
      "[সিস্টেম নোট: সিজুকার মূল ব্যক্তিত্ব (মিষ্টি, ইমোজি, স্টাইল) বজায় রেখে উত্তর দাও। সম্ভব হলে 'ভাইয়া' সম্বোধন ব্যবহার করো।]";
    finalUserPrompt = `${timeContextNote}\n${systemInstruction}\n\nকাজ/প্রশ্ন: "${finalUserPrompt}"`;
  }

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

  // চ. নতুন মেসেজ ইতিহাসে যোগ করা
  currentHistory.push({ role: "user", parts: [{ text: finalUserPrompt }] });

  // ছ. ইতিহাস ছাঁটাই
  if (currentHistory.length > HISTORY_MAX_LENGTH * 2) {
    currentHistory = [
      currentHistory[0],
      currentHistory[1],
      ...currentHistory.slice(-(HISTORY_MAX_LENGTH * 2 - 2)),
    ];
  }

  // জ. জেমিনিকে কল করা (মাল্টি-কী ব্যবহার করে)
  try {
    const apiKey = getNextApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const chat = model.startChat({ history: currentHistory });
    const messageToSend = specialPromptInstruction ? "..." : userPrompt;
    const result = await chat.sendMessage(messageToSend);
    const response = await result.response;

    if (!response || !response.text) {
      throw new Error("Gemini থেকে খালি উত্তর এসেছে।");
    }
    const botReply = response.text();

    // ঝ. বটের উত্তর ইতিহাসে সেভ করা (যদি না শিডিউলড/স্পেশাল টাস্ক হয়)
    if (!isScheduledTask && !specialPromptInstruction) {
      currentHistory.push({ role: "model", parts: [{ text: botReply }] });
      if (currentHistory.length > HISTORY_MAX_LENGTH * 2) {
        currentHistory = [
          currentHistory[0],
          currentHistory[1],
          ...currentHistory.slice(-(HISTORY_MAX_LENGTH * 2 - 2)),
        ];
      }
      conversationHistory.set(historyKey, {
        history: currentHistory,
        timestamp: Date.now(),
      });
    }
    return botReply;
  } catch (error) {
    console.error(
      `❌ Gemini AI Error (gemini.js) | Key Index: ${currentApiKeyIndex} | Thread: ${historyKey}`
    );
    let specificErrorMessage =
      "উফফ! আমার উত্তর খুঁজে আনতে একটু সমস্যা হচ্ছে। 😥 আবার চেষ্টা করবেন?";
    if (error.message && error.message.includes("429")) {
      specificErrorMessage =
        "দুঃখিত, আমি এখন একটু বেশি ব্যস্ত। 😥 কিছুক্ষণ পর আবার চেষ্টা করুন। (API Limit)";
    } else if (error.message && error.message.includes("SAFETY")) {
      specificErrorMessage =
        "দুঃখিত, আপনার প্রশ্নটি আমি বুঝতে পারছি না বা উত্তর দিতে পারছি না। 🥺 অন্যভাবে জিজ্ঞাসা করবেন?";
    } else if (error.message && error.message.includes("API key not valid")) {
      console.error(
        `FATAL: API Key at index ${currentApiKeyIndex} is invalid! Please check config.json.`
      );
      specificErrorMessage =
        "একটি API Key তে সমস্যা হয়েছে। অ্যাডমিন শীঘ্রই ঠিক করবেন।";
    } else {
      console.error("Unknown Gemini Error Details:", error);
    }
    throw new Error(specificErrorMessage);
  }
}

// === ৬. ফাংশন এক্সপোর্ট ===
module.exports = {
  getShizukaReply,
};
