// utils/eventManager.js (v2.3 - Use 2.5 Flash Model)

const fs = require("fs-extra");
const path = require("path");
const moment = require("moment-timezone");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const eventsFilePath = path.join(__dirname, "..", "upcoming_events.json");

let config,
  GEMINI_API_KEYS = [],
  currentApiKeyIndex_Event = 0;

try {
  config = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf8")
  );
  GEMINI_API_KEYS = config.GEMINI_API_KEYS || [];
  if (!Array.isArray(GEMINI_API_KEYS) || GEMINI_API_KEYS.length === 0) {
    throw new Error(
      "config.json-এ 'GEMINI_API_KEYS' অ্যারে সঠিকভাবে সেট করা নেই।"
    );
  }
} catch (error) {
  console.error(
    "[EventManager] কনফিগারেশন বা API Key লোড করতে মারাত্মক ত্রুটি:",
    error
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

async function fetchAndSaveUpcomingEvents() {
  console.log("[EventManager] আগামী ৭ দিনের ইভেন্ট খোঁজা হচ্ছে...");
  const today = moment().tz("Asia/Dhaka").format("YYYY-MM-DD");
  const prompt = `Return a JSON array of notable public holidays, religious festivals (especially Islamic), international days, awareness days, and astronomical events in Bangladesh and globally for the next 7 days from ${today}. Format: {"date": "YYYY-MM-DD", "name": "Event Name", "type": "Religious/National/International/etc"}. If none, return []. Only output the raw JSON array.`;

  const apiKey = getNextEventApiKey();
  if (!apiKey) {
    return console.error("[EventManager] কোনো ভ্যালিড API Key পাওয়া যায়নি।");
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // <-- কমেন্ট অনুযায়ী আসল মডেল ব্যবহার করা হচ্ছে

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const cleanedResponse = responseText
      .replace(/^```json\s*|```\s*$/g, "")
      .trim();
    const newEvents = JSON.parse(cleanedResponse);

    if (!Array.isArray(newEvents) || newEvents.length === 0) return;

    let existingEvents = loadEvents();
    const sevenDaysLater = moment()
      .tz("Asia/Dhaka")
      .add(7, "days")
      .format("YYYY-MM-DD");
    existingEvents = existingEvents.filter(
      (event) => event.date >= today && event.date <= sevenDaysLater
    );

    newEvents.forEach((newEvent) => {
      if (
        newEvent.date &&
        newEvent.name &&
        !existingEvents.some(
          (e) =>
            e.date === newEvent.date &&
            e.name.toLowerCase() === newEvent.name.toLowerCase()
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
      `[EventManager] ইভেন্ট লিস্ট আপডেট হয়েছে। মোট ${existingEvents.length} টি ইভেন্ট।`
    );
  } catch (error) {
    console.error(
      `[EventManager] Gemini থেকে ইভেন্ট আনতে সমস্যা:`,
      error.message || error
    );
  }
}

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
