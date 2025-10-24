// commands/ascii.js
const { getShizukaReply } = require("../gemini.js"); // AI কল করার জন্য

module.exports = {
  config: {
    name: "ascii",
    aliases: ["art"],
    description: "যেকোনো কিছুর একটি সাধারণ ASCII আর্ট তৈরি করে।",
    permission: 0, // সবার জন্য
    cooldown: 15,
    usage: "/ascii <বিষয়>",
  },

  run: async function ({ api, message, args }) {
    const subject = args.join(" ");
    if (!subject) {
      return api.sendMessage(
        "❓ ব্যবহার: /ascii <বিষয়> (যেমন: /ascii বিড়াল)",
        message.threadID,
        message.messageID
      );
    }

    try {
      // AI-কে দিয়ে আর্ট জেনারেট করানো
      const prompt = `সিজুকা স্টাইলে "${subject}" এর একটি খুব সাধারণ এবং কিউট সিঙ্গেল-লাইন বা মাল্টি-লাইন ASCII আর্ট তৈরি করো। আর্টটি যেন টেক্সট মেসেজে সহজে দেখানো যায়।`;
      // থ্রেড আইডি 'ASCII_GEN' দেওয়া হচ্ছে যাতে এটি সাধারণ কনভারসেশন হিস্টোরিতে না যায়
      const asciiArt = await getShizukaReply("ASCII_GEN", prompt);

      api.sendMessage(
        `🎨 "${subject}" এর আর্ট:\n\n${asciiArt}\n\n🌸✨`,
        message.threadID,
        message.messageID
      );
    } catch (error) {
      console.error("[ASCII Command Error]", error);
      api.sendMessage(
        "😥 দুঃখিত, আর্ট তৈরি করার সময় সমস্যা হয়েছে।",
        message.threadID,
        message.messageID
      );
    }
  },
};
