const { clearChatHistory } = require("../gemini.js");

module.exports.config = {
  name: "clear",
  aliases: ["reset", "forget", "c"],
  version: "1.0.0",
  role: 0,
  author: "Devil-X",
  description: "বটের মেমরি বা চ্যাট হিস্ট্রি সম্পূর্ণ মুছে ফেলে।",
  category: "system",
  usages: "/clear",
  cooldowns: 5,
};

// ম্যাজিক ফিক্স: ফাংশনটাকে সব ফ্রেমওয়ার্কের জন্য সাপোর্টেড (Bulletproof) করা হলো
module.exports.run = async function (context) {
  let api, event;

  // ফ্রেমওয়ার্ক কীভাবে ডেটা পাঠাচ্ছে সেটা চেক করে ভেরিয়েবল সেট করা হচ্ছে
  if (context && context.api && context.event) {
    api = context.api;
    event = context.event;
  } else {
    api = arguments[0];
    event = arguments[1];
  }

  try {
    if (!event || !event.threadID) {
      console.error("[Clear Command] Error: event.threadID is undefined.");
      return;
    }

    const threadID = event.threadID;
    const messageID = event.messageID;

    // gemini.js থেকে হিস্ট্রি ক্লিয়ার করার ফাংশন কল করা হচ্ছে
    const success = await clearChatHistory(threadID);

    if (success) {
      api.sendMessage(
        "✅ আমার মেমরি সম্পূর্ণ রিস্টার্ট করা হয়েছে! আগের সব কথা ভুলে গেছি। নতুন করে শুরু করুন।",
        threadID,
        messageID,
      );
    } else {
      api.sendMessage(
        "⚠️ হিস্ট্রি ক্লিয়ার করা হয়েছে (বা আগে থেকেই খালি ছিল)।",
        threadID,
        messageID,
      );
    }
  } catch (error) {
    console.error("[Clear Command Error]:", error);
    if (api && event && event.threadID) {
      api.sendMessage(
        "❌ মেমরি ক্লিয়ার করতে সমস্যা হয়েছে! সার্ভার লগ চেক করুন।",
        event.threadID,
      );
    }
  }
};
