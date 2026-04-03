const { clearChatHistory } = require("../gemini.js");

module.exports = {
  config: {
    name: "clear",
    aliases: ["reset", "forget", "c"],
    description: "বটের মেমরি বা চ্যাট হিস্ট্রি সম্পূর্ণ মুছে ফেলে।",
    permission: 0,
    cooldown: 5,
    usage: "/clear",
  },

  run: async function ({ api, message }) {
    try {
      const threadID = message.threadID;
      const success = await clearChatHistory(threadID);

      // ম্যাজিক ফিক্স: () => {} অ্যাড করা হয়েছে
      if (success) {
        api.sendMessage(
          "✅ আমার মেমরি সম্পূর্ণ রিস্টার্ট করা হয়েছে! আগের সব কথা ভুলে গেছি। নতুন করে শুরু করুন।",
          threadID,
          () => {},
          message.messageID,
        );
      } else {
        api.sendMessage(
          "⚠️ হিস্ট্রি ক্লিয়ার করা হয়েছে (বা আগে থেকেই খালি ছিল)।",
          threadID,
          () => {},
          message.messageID,
        );
      }
    } catch (error) {
      console.error("[Clear Command Error]:", error);
      api.sendMessage(
        "❌ মেমরি ক্লিয়ার করতে সমস্যা হয়েছে! সার্ভার লগ চেক করুন।",
        message.threadID,
        () => {},
        message.messageID,
      );
    }
  },
};
