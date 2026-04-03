const { clearChatHistory } = require("../gemini.js");

module.exports = {
  name: "clear",
  aliases: ["reset", "forget"],
  description: "বটের মেমরি বা চ্যাট হিস্ট্রি মুছে ফেলে।",
  async execute(api, event, args) {
    try {
      const threadID = event.threadID;

      // gemini.js থেকে হিস্ট্রি ক্লিয়ার করার ফাংশন কল করা হচ্ছে
      const success = await clearChatHistory(threadID);

      if (success) {
        api.sendMessage(
          "✅ আমার মেমরি সম্পূর্ণ রিস্টার্ট করা হয়েছে! আগের সব কথা ভুলে গেছি। নতুন করে শুরু করুন।",
          threadID,
          event.messageID,
        );
      } else {
        api.sendMessage(
          "⚠️ হিস্ট্রি ক্লিয়ার করা হয়েছে (বা আগে থেকেই খালি ছিল)।",
          threadID,
          event.messageID,
        );
      }
    } catch (error) {
      console.error("[Clear Command Error]:", error);
      api.sendMessage(
        "❌ মেমরি ক্লিয়ার করতে সমস্যা হয়েছে! সার্ভার লগ চেক করুন।",
        event.threadID,
        event.messageID,
      );
    }
  },
};
