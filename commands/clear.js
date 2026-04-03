const { clearChatHistory } = require("../gemini.js");

module.exports = {
  // কমান্ডের কনফিগারেশন (তোমার ping.js এর মতো)
  config: {
    name: "clear", // কমান্ডের মূল নাম
    aliases: ["reset", "forget", "c"], // কমান্ডের অন্যান্য নাম
    description: "বটের মেমরি বা চ্যাট হিস্ট্রি সম্পূর্ণ মুছে ফেলে।", // কমান্ডের বর্ণনা
    permission: 0, // 0 = সবাই ব্যবহার করতে পারবে
    cooldown: 5, // ৫ সেকেন্ডের কুলডাউন
    usage: "/clear", // কমান্ডের ব্যবহার নির্দেশিকা
  },

  // কমান্ডটি রান করার মূল ফাংশন
  run: async function ({ api, message }) {
    try {
      // তোমার ফ্রেমওয়ার্ক অনুযায়ী message.threadID ব্যবহার করা হচ্ছে
      const threadID = message.threadID;

      // gemini.js থেকে হিস্ট্রি ক্লিয়ার করার ফাংশন কল করা হচ্ছে
      const success = await clearChatHistory(threadID);

      if (success) {
        api.sendMessage(
          "✅ আমার মেমরি সম্পূর্ণ রিস্টার্ট করা হয়েছে! আগের সব কথা ভুলে গেছি। নতুন করে শুরু করুন।",
          threadID,
          message.messageID,
        );
      } else {
        api.sendMessage(
          "⚠️ হিস্ট্রি ক্লিয়ার করা হয়েছে (বা আগে থেকেই খালি ছিল)।",
          threadID,
          message.messageID,
        );
      }
    } catch (error) {
      console.error("[Clear Command Error]:", error);
      api.sendMessage(
        "❌ মেমরি ক্লিয়ার করতে সমস্যা হয়েছে! সার্ভার লগ চেক করুন।",
        message.threadID,
        message.messageID,
      );
    }
  },
};
