// event-handler.js

const fs = require("fs");
const path = require("path");

const events = new Map(); // সব ইভেন্ট এখানে সেভ থাকবে

// === ইভেন্ট লোডার ফাংশন ===
function loadEvents() {
  const eventFiles = fs
    .readdirSync(path.join(__dirname, "events"))
    .filter((file) => file.endsWith(".js"));

  for (const file of eventFiles) {
    try {
      const event = require(`./events/${file}`);
      if (event.name && event.run) {
        events.set(event.name, event);
        console.log(`[+] ইভেন্ট লোড হয়েছে: ${event.name}`);
      } else {
        console.warn(`[-] "${file}" ইভেন্ট ফাইলে 'name' বা 'run' ফাংশন নেই।`);
      }
    } catch (error) {
      console.error(`[-] "${file}" ইভেন্টটি লোড করা যায়নি:`, error);
    }
  }
  console.log(`✅ মোট ${events.size} টি ইভেন্ট সফলভাবে লোড হয়েছে।`);
}

// === ইভেন্ট হ্যান্ডলার ফাংশন ===
async function handleEvent({ api, message, config, messageCache }) {
  // message.type === 'event' এবং message.logMessageType দুটোই ইভেন্টের নাম হিসেবে আসতে পারে
  const eventName = message.logMessageType || message.type;

  const event = events.get(eventName);

  if (event) {
    try {
      // ইভেন্ট ফাইলটিকে প্রয়োজনীয় ডেটা পাস করা হচ্ছে
      await event.run({ api, message, config, messageCache });
      return true; // ইভেন্ট সফলভাবে হ্যান্ডেল করা হয়েছে
    } catch (error) {
      console.error(`"${eventName}" ইভেন্টটি রান করার সময় এরর হয়েছে:`, error);
      // অ্যাডমিনদের এরর নোটিফিকেশন (ঐচ্ছিক)
      config.ADMIN_IDS.forEach((adminId) => {
        api.sendMessage(
          `🚨 ইভেন্ট এরর 🚨\n\nইভেন্ট: ${eventName}\nগ্রুপ: ${
            message.threadID
          }\n\nসমস্যা: ${error.message || error}`,
          adminId,
          (err) => {
            if (err)
              console.error(
                `[Event Error Notify] অ্যাডমিন ${adminId}-কে মেসেজ পাঠাতে সমস্যা`
              );
          }
        );
      });
      return false; // ইভেন্ট হ্যান্ডেল করার সময় এরর হয়েছে
    }
  }

  return false; // এই নামের কোনো ইভেন্ট হ্যান্ডলার পাওয়া যায়নি
}

module.exports = {
  loadEvents,
  handleEvent,
};
