// utils/eventManager.js (v3.0 - Elite Caching & Dual API System)

const fs = require("fs-extra");
const path = require("path");
const moment = require("moment-timezone");
const axios = require("axios"); // ইসলামিক API এর জন্য
const { GoogleGenerativeAI } = require("@google/generative-ai");

const eventsFilePath = path.join(__dirname, "..", "upcoming_events.json");
const lastFetchFile = path.join(__dirname, "..", "last_fetch_date.txt"); // ক্যাশিং ট্র্যাকার

let config,
  GEMINI_API_KEYS = [],
  currentApiKeyIndex_Event = 0;

try {
  config = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf8"),
  );
  GEMINI_API_KEYS = config.GEMINI_API_KEYS || [];
  if (!Array.isArray(GEMINI_API_KEYS) || GEMINI_API_KEYS.length === 0) {
    throw new Error(
      "config.json-এ 'GEMINI_API_KEYS' অ্যারে সঠিকভাবে সেট করা নেই।",
    );
  }
} catch (error) {
  console.error(
    "[EventManager] কনফিগারেশন বা API Key লোড করতে মারাত্মক ত্রুটি:",
    error,
  );
  GEMINI_API_KEYS = [];
}

function getNextEventApiKey() {
  if (GEMINI_API_KEYS.length === 0) return null;
  const key = GEMINI_API_KEYS[currentApiKeyIndex_Event];
  currentApiKeyIndex_Event =
    (currentApiKeyIndex_Event + 1) % GEMINI_API_KEYS.length;
  return key;
}

function loadEvents() {
  try {
    if (!fs.existsSync(eventsFilePath))
      fs.writeJsonSync(eventsFilePath, [], { spaces: 2 });
    return fs.readJsonSync(eventsFilePath, { throws: false }) || [];
  } catch {
    return [];
  }
}

function saveEvents(data) {
  try {
    fs.writeJsonSync(eventsFilePath, Array.isArray(data) ? data : [], {
      spaces: 2,
    });
  } catch (error) {
    console.error("[EventManager] Save Error:", error);
  }
}

// ইসলামিক ইভেন্ট কালেক্ট করার সাব-ফাংশন (Aladhan API)
async function getIslamicEvents(todayBD) {
  let islamicEvents = [];
  try {
    const year = moment().tz("Asia/Dhaka").year();
    const month = moment().tz("Asia/Dhaka").month() + 1;
    const res = await axios.get(
      `http://api.aladhan.com/v1/gToHCalendar/${month}/${year}`,
    );

    if (res.data && res.data.data) {
      res.data.data.forEach((day) => {
        if (day.hijri && day.hijri.holidays && day.hijri.holidays.length > 0) {
          const eventDate = moment(day.gregorian.date, "DD-MM-YYYY")
            .tz("Asia/Dhaka")
            .format("YYYY-MM-DD");
          const diffDays = moment(eventDate).diff(moment(todayBD), "days");

          if (diffDays >= 0 && diffDays <= 7) {
            day.hijri.holidays.forEach((holiday) => {
              islamicEvents.push({
                date: eventDate,
                name: holiday,
                type: "Islamic",
              });
            });
          }
        }
      });
    }
  } catch (err) {
    console.error("[EventManager] Aladhan API Error:", err.message);
  }
  return islamicEvents;
}

// মূল ফাংশন (Smart Caching যুক্ত)
async function fetchAndSaveUpcomingEvents() {
  const today = moment().tz("Asia/Dhaka").format("YYYY-MM-DD");

  // ⚡ ১. ক্যাশিং চেক (API কল বাঁচানোর জন্য)
  if (fs.existsSync(lastFetchFile)) {
    const lastFetch = fs.readFileSync(lastFetchFile, "utf8").trim();
    if (lastFetch === today) {
      console.log(
        "[EventManager] ⚡ আজকের ইভেন্ট অলরেডি ক্যাশ করা আছে। API কল স্কিপ করা হলো।",
      );
      return; // আজকের জন্য আর API কল হবে না!
    }
  }

  console.log("[EventManager] 🔄 নতুন দিনের ইভেন্ট খোঁজা হচ্ছে...");
  let newEvents = [];

  // 🌙 ২. ইসলামিক ইভেন্ট আনা (ফ্রি API)
  const islamicEvents = await getIslamicEvents(today);
  newEvents = newEvents.concat(islamicEvents);

  // 🇧🇩 ৩. ন্যাশনাল/গ্লোবাল ইভেন্ট আনা (Gemini API)
  const apiKey = getNextEventApiKey();
  if (apiKey) {
    const prompt = `Return a JSON array of notable public holidays, national days of Bangladesh, and major international days for the next 7 days from ${today}. Do NOT include Islamic/Hijri events. Format: [{"date": "YYYY-MM-DD", "name": "Event Name", "type": "National/International"}]. Only output the raw JSON array. If none, return [].`;

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemma-3-27b-it" });
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const cleanedResponse = responseText
        .replace(/^```json\s*|```\s*$/g, "")
        .trim();
      const geminiEvents = JSON.parse(cleanedResponse);

      if (Array.isArray(geminiEvents)) {
        newEvents = newEvents.concat(geminiEvents);
      }
    } catch (error) {
      console.error(
        `[EventManager] Gemini থেকে ইভেন্ট আনতে সমস্যা:`,
        error.message || error,
      );
    }
  }

  // ৪. পুরনো ইভেন্টের সাথে নতুন ইভেন্ট মার্জ করা এবং সেভ করা
  if (newEvents.length > 0) {
    let existingEvents = loadEvents();
    const sevenDaysLater = moment()
      .tz("Asia/Dhaka")
      .add(7, "days")
      .format("YYYY-MM-DD");

    existingEvents = existingEvents.filter(
      (event) => event.date >= today && event.date <= sevenDaysLater,
    );

    newEvents.forEach((newEvent) => {
      if (
        newEvent.date &&
        newEvent.name &&
        !existingEvents.some(
          (e) =>
            e.date === newEvent.date &&
            e.name.toLowerCase() === newEvent.name.toLowerCase(),
        )
      ) {
        existingEvents.push({
          date: newEvent.date,
          name: newEvent.name,
          type: newEvent.type || "Unknown",
        });
      }
    });

    existingEvents.sort((a, b) => a.date.localeCompare(b.date));
    saveEvents(existingEvents);
    console.log(
      `[EventManager] ইভেন্ট লিস্ট আপডেট হয়েছে। মোট ${existingEvents.length} টি ইভেন্ট।`,
    );
  }

  // ⚡ ৫. ক্যাশ ফাইল আপডেট করা (যাতে আজকে আর রান না হয়)
  fs.writeFileSync(lastFetchFile, today, "utf8");
}

// আগের ফাংশন অপরিবর্তিত রাখা হলো (যাতে বটের অন্যান্য সিস্টেম নষ্ট না হয়)
function getTodaysEvents() {
  const today = moment().tz("Asia/Dhaka").format("YYYY-MM-DD");
  const allEvents = loadEvents();
  const todaysEvents = allEvents.filter((event) => event.date === today);
  if (todaysEvents.length > 0) {
    const remainingEvents = allEvents.filter((event) => event.date !== today);
    saveEvents(remainingEvents);
  }
  return todaysEvents;
}

module.exports = {
  fetchAndSaveUpcomingEvents,
  getTodaysEvents,
};
