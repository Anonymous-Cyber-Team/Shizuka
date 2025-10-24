// utils/scheduler.js

const schedule = require("node-schedule");
const moment = require("moment-timezone");
const { getShizukaReply } = require("../gemini.js");
const groupManager = require("./groupManager");
const eventManager = require("./eventManager");

function initializeScheduler(api, config) {
  console.log("[Scheduler] শিডিউলার চালু করা হচ্ছে...");

  const COUNTDOWN_EVENTS = config.COUNTDOWN_EVENTS || [];

  // --- Daily Event Fetch Task ---
  schedule.scheduleJob("1 0 * * *", () => {
    console.log("[Scheduler] প্রতিদিনের ইভেন্ট খোঁজার কাজ শুরু হচ্ছে...");
    eventManager.fetchAndSaveUpcomingEvents();
  });
  // Fetch events once on startup after a small delay
  setTimeout(() => eventManager.fetchAndSaveUpcomingEvents(), 5000);

  let lastCheckedMinute = -1;

  // --- Main Interval for Timed Messages ---
  setInterval(async () => {
    const currentApproved = groupManager.getApprovedGroups();
    if (currentApproved.length === 0) return;

    const now = moment().tz("Asia/Dhaka");
    const hour = now.hour();
    const minute = now.minute();
    const dayOfWeek = now.day();

    if (minute === lastCheckedMinute) return;
    lastCheckedMinute = minute;

    let topic = null;
    const currentTime = now.format("h:mm A");

    // --- Specific Time Triggers ---
    if (hour === 6 && minute === 0) {
      const todaysEvents = eventManager.getTodaysEvents();
      if (todaysEvents.length > 0) {
        console.log(
          `[Scheduler] ${todaysEvents.length} টি আজকের ইভেন্ট পাওয়া গেছে।`
        );
        for (const event of todaysEvents) {
          const eventTopic = `আজ ${now.format("D MMM")} তারিখ, ${event.name} (${
            event.type
          } দিবস)। এই দিবসটি সম্পর্কে সিজুকা স্টাইলে মিষ্টি করে ছোট্ট একটি বার্তা দাও।`;
          await sendScheduledMessage(api, eventTopic, currentApproved);
          await new Promise((resolve) => setTimeout(resolve, 5000)); // Delay between multiple events
        }
      }
    }

    if (hour === 5 && minute === 0)
      topic = `এখন ভোর ৫টা (${currentTime})। ফজরের নামাজের জন্য একটি মিষ্টি ইসলামিক রিমাইন্ডার দাও।`;
    else if (hour === 7 && minute === 0)
      topic = `এখন সকাল ৭টা (${currentTime})। আজকের তারিখ (${now.format(
        "D MMM YYYY"
      )}), বার (${now.format(
        "dddd"
      )}) উল্লেখ করে সবাইকে 'শুভ সকাল' জানাও এবং দিনের জন্য একটি ছোট্ট অনুপ্রেরণামূলক উক্তি বা মজার ফ্যাক্ট যোগ করো।`;
    else if (hour === 13 && minute === 30)
      topic = `এখন দুপুর ১:৩০ (${currentTime})। যোহরের নামাজের জন্য একটি সুন্দর ইসলামিক রিমাইন্ডার দাও।`;
    else if (hour === 16 && minute === 30)
      topic = `এখন বিকাল ৪:৩০ (${currentTime})। আসরের নামাজের জন্য একটি রিমাইন্ডার দাও।`;
    else if (hour === 18 && minute === 0)
      topic = `এখন সন্ধ্যা ৬টা (${currentTime})। মাগরিবের নামাজের জন্য একটি রিমাইন্ডার দাও।`;
    else if (hour === 20 && minute === 0)
      topic = `এখন রাত ৮টা (${currentTime})। এশার নামাজের জন্য একটি রিমাইন্ডার দাও।`;
    else if (hour === 22 && minute === 0)
      topic = `এখন রাত ১০টা (${currentTime})। একটি ছোট, সহজে বোঝা যায় এমন ইসলামিক উক্তি বা হাদিসের অংশ শেয়ার করো।`;
    else if (hour === 0 && minute === 0)
      topic = `এখন রাত ১২টা (${currentTime})। সবাইকে মিষ্টি করে 'শুভ রাত্রি' জানাও।`;
    else if (hour === 2 && minute === 0)
      topic = `এখন রাত ২টা (${currentTime})। যারা এখনো জেগে আছে, তাদের সিজুকা স্টাইলে, খুব ফানি এবং মিষ্টি করে ঘুমাতে যাওয়ার জন্য একটি বার্তা দাও।`;
    else if (dayOfWeek === 5 && hour === 12 && minute === 0)
      topic = `আজ শুক্রবার, দুপুর ১২টা (${currentTime})। জুম্মার নামাজের গুরুত্ব সম্পর্কে একটি সুন্দর ইসলামিক বার্তা দাও।`;
    else if (dayOfWeek === 5 && hour === 12 && minute === 30)
      topic = `এখন সাড়ে ১২টা (${currentTime})। জুম্মার নামাজের সময় হয়ে যাচ্ছে! সিজুকা স্টাইলে সবাইকে একটু তাড়া দিয়ে মিষ্টি করে বলো নামাজে যেতে, ভাইয়া এবং আপু উভয়কেই।`;
    else if (hour > 7 && hour < 22 && minute === 0)
      topic = `এখন ${currentTime} বাজে। সময়টা মনে করিয়ে দাও।`;
    else if (hour === 14 && minute === 0)
      topic = `এখন দুপুর ২টা (${currentTime})। সিজুকা স্টাইলে, গ্রুপের সবার জন্য একটি মজার কিন্তু সহজ প্রশ্ন করো (যেমন বই, এনিমে বা সাধারণ জ্ঞান নিয়ে)।`;

    // --- Countdown Event Checker ---
    COUNTDOWN_EVENTS.forEach((event) => {
      const eventDate = moment.tz(event.date, "YYYY-MM-DD", "Asia/Dhaka");
      const daysLeft = eventDate.diff(now, "days");
      if ([7, 3, 1].includes(daysLeft) && hour === 8 && minute === 0) {
        topic = `"${event.name}" আসতে আর মাত্র ${daysLeft} দিন বাকি! 🎉 একটি ছোট্ট কাউন্টডাউন বার্তা দাও।`;
      } else if (daysLeft === 0 && hour === 8 && minute === 0) {
        topic = `আজ "${event.name}"! 🎉 সবাইকে শুভেচ্ছা জানাও।`;
      }
    });

    if (topic) {
      await sendScheduledMessage(api, topic, currentApproved);
    }
  }, 60 * 1000); // Check every minute
}

async function sendScheduledMessage(api, topic, groups) {
  const approvedGroupIds = groups
    .map((g) => g.id)
    .filter((id) => groupManager.isGroupApprovedAndActive(id)); // শুধু অ্যাক্টিভ গ্রুপে পাঠাবে
  if (approvedGroupIds.length === 0) return;

  try {
    const scheduledThreadID = "SCHEDULED_TASK_" + topic.substring(0, 15);
    const text = await getShizukaReply(scheduledThreadID, topic);

    for (const groupID of approvedGroupIds) {
      api.sendMessage(text, groupID, (err) => {
        if (err) console.error(`[Scheduled Msg Error] গ্রুপ ${groupID}:`, err);
      });
      await new Promise((resolve) => setTimeout(resolve, 500)); // স্প্যামিং এড়াতে ডিলে
    }
  } catch (e) {
    console.error(`[Scheduled Task] "${topic}" পাঠাতে সমস্যা:`, e);
  }
}

module.exports = {
  initializeScheduler,
};
