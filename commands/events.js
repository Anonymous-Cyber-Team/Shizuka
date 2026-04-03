const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");

module.exports = {
  config: {
    name: "events",
    aliases: ["event", "holidays", "ছুটি"],
    description: "আগামী ৭ দিনের ইভেন্ট এবং ছুটির তালিকা দেখায়।",
    permission: 0,
    cooldown: 10,
    usage: "/events",
  },

  run: async function ({ api, message }) {
    try {
      const eventsPath = path.join(__dirname, "..", "upcoming_events.json");

      if (!fs.existsSync(eventsPath)) {
        return api.sendMessage(
          "⚠️ বর্তমানে আগামী ৭ দিনের জন্য কোনো ইভেন্ট বা ছুটির ডেটা আমার কাছে নেই।",
          message.threadID,
          () => {},
          message.messageID,
        );
      }

      const eventsData = JSON.parse(fs.readFileSync(eventsPath, "utf8"));

      if (eventsData.length === 0) {
        return api.sendMessage(
          "📅 আগামী ৭ দিনে বিশেষ কোনো ইভেন্ট বা ছুটির দিন নেই।",
          message.threadID,
          () => {},
          message.messageID,
        );
      }

      let replyMsg = "📅 **আগামী ৭ দিনের ইভেন্ট ও ছুটির তালিকা:**\n\n";

      eventsData.forEach((event, index) => {
        const formattedDate = moment(event.date).format("DD MMMM YYYY");
        const emoji = event.type === "Islamic" ? "🌙" : "✨";
        replyMsg += `${index + 1}. ${emoji} **${event.name}**\n   🗓️ তারিখ: ${formattedDate}\n\n`;
      });

      // ম্যাজিক ফিক্স: () => {} অ্যাড করা হয়েছে
      api.sendMessage(replyMsg, message.threadID, () => {}, message.messageID);
    } catch (error) {
      console.error("[Events Command Error]:", error);
      api.sendMessage(
        "❌ ইভেন্ট লিস্ট লোড করতে সমস্যা হয়েছে!",
        message.threadID,
        () => {},
        message.messageID,
      );
    }
  },
};
