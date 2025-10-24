// commands/unsend.js

module.exports = {
  config: {
    name: "unsend",
    aliases: ["uns", "delete", "removemsg"], // বিকল্প নাম
    description:
      "বটের পাঠানো কোনো মেসেজ আনসেন্ড/ডিলিট করার জন্য (রিপ্লাই করে ব্যবহার করতে হবে)।",
    permission: 1, // 1 = শুধু অ্যাডমিন (নিরাপত্তার জন্য)
    cooldown: 3,
    usage: "/unsend <বটের মেসেজের রিপ্লাই দিন>", // ব্যবহারের নিয়ম
  },

  run: async function ({ api, message }) {
    // ১. মেসেজটি রিপ্লাই কিনা চেক করা
    if (!message.messageReply) {
      return api.sendMessage(
        "❓ আপনি বটের যে মেসেজটি আনসেন্ড করতে চান, অনুগ্রহ করে সেটিতে রিপ্লাই করে এই কমান্ডটি ব্যবহার করুন।",
        message.threadID,
        message.messageID
      );
    }

    // ২. রিপ্লাই করা মেসেজটি বট নিজে পাঠিয়েছিল কিনা চেক করা
    const botID = api.getCurrentUserID(); // বটের নিজের আইডি
    const messageToUnsend = message.messageReply;

    if (String(messageToUnsend.senderID) !== botID) {
      return api.sendMessage(
        "⚠️ দুঃখিত, আমি শুধু আমার নিজের পাঠানো মেসেজ আনসেন্ড করতে পারি।",
        message.threadID,
        message.messageID
      );
    }

    // ৩. মেসেজটি আনসেন্ড করার চেষ্টা করা
    try {
      await api.unsendMessage(messageToUnsend.messageID);
      // ঐচ্ছিক: সফল হলে একটি কনফার্মেশন (খুব দ্রুত মুছে যাবে)
      // api.sendMessage("✅ মেসেজটি আনসেন্ড করা হয়েছে।", message.threadID);

      // সফলভাবে আনসেন্ড হলে, যে কমান্ডটি দিয়ে আনসেন্ড করা হলো (/unsend) সেটিও ডিলিট করে দেওয়া যেতে পারে (যদি চান)
      try {
        await api.unsendMessage(message.messageID);
      } catch (delErr) {
        // console.log("আনসেন্ড কমান্ডটি ডিলিট করতে সমস্যা:", delErr);
      }
    } catch (error) {
      console.error("আনসেন্ড করার সময় এরর:", error);
      api.sendMessage(
        "❌ দুঃখিত, মেসেজটি আনসেন্ড করার সময় একটি সমস্যা হয়েছে। সম্ভবত মেসেজটি অনেক পুরনো অথবা আমার পারমিশন নেই।",
        message.threadID,
        message.messageID
      );
    }
  },
};
