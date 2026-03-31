// commands/guide.js
const { commands } = require("../command-handler");
const packageJson = require("../package.json");

module.exports = {
  config: {
    name: "guide",
    aliases: ["botguide", "manual"],
    description: "বটের সম্পূর্ণ ব্যবহার নির্দেশিকা (শুধুমাত্র অ্যাডমিন)।",
    permission: 1,
    cooldown: 15,
    usage: "@guide", // <-- ফিক্সড
  },
  run: async function ({ api, message, config }) {
    const userPrefix = config.BOT_PREFIX || "/";
    const adminPrefix = config.SECRET_ADMIN_PREFIX || "@";
    const botVersion = packageJson.version || "N/A";

    let guideMessage = `📖 === সিজুকা বট ব্যবহার নির্দেশিকা (v${botVersion}) === 📖\n\n`;
    guideMessage += `👋 **পরিচিতি:**\nআমি সিজুকা, আপনার ৭ বছর বয়সী ভার্চুয়াল বন্ধু! 🌸 আমি গ্রুপে আপনাদের সাথে গল্প করতে, প্রশ্নের উত্তর দিতে এবং বিভিন্ন স্বয়ংক্রিয় কাজ করতে পারি।\n\n`;
    guideMessage += `💬 **সিজুকার সাথে কথা বলা:**\n`;
    guideMessage += `   • **নাম ধরে:** মেসেজের যেকোনো অংশে "${
      config.BOT_NAMES ? config.BOT_NAMES.join("/") : "সিজুকা"
    }" বলুন।\n`;
    guideMessage += `   • **রিপ্লাই:** আমার পাঠানো মেসেজের রিপ্লাই দিন।\n\n`;
    guideMessage += `🤖 **স্বয়ংক্রিয় ফিচারসমূহ:**\n`;
    guideMessage += `   • **সময়মতো বার্তা:** নামাজের সময় 🕌, শুভ সকাল/রাত্রি ☀️🌙, প্রতি ঘণ্টায় সময় ⏰, আজকের দিন ✨, দিনের প্রশ্ন 🤔, বিশেষ দিবস 🎉, ইভেন্ট কাউন্টডাউন ⏳, ইসলামিক উক্তি 📜।\n`;
    guideMessage += `   • **গ্রুপ ইভেন্ট:** নতুন সদস্যকে স্বাগতম 🤝, সদস্য চলে গেলে বিদায় 👋, আনসেন্ড করা মেসেজ দেখানো 📝।\n\n`;
    guideMessage += `🛂 **গ্রুপ অ্যাপ্রুভাল:**\n`;
    guideMessage += `   • **কমান্ড:** "${adminPrefix}group" দিয়ে ম্যানেজ করুন।\n`;
    guideMessage += `   • বট শুধু অ্যাপ্রুভড ও অ্যাক্টিভ গ্রুপে কাজ করে।\n\n`;
    guideMessage += `🧠 **Teach সিস্টেম:**\n`;
    guideMessage += `   • বটকে নির্দিষ্ট প্রশ্নোত্তর শেখানো যায়।\n`;
    guideMessage += `   • **কমান্ড:** "${adminPrefix}teach" দিয়ে ম্যানেজ করুন।\n\n`;
    guideMessage += `📜 === কমান্ড তালিকা === 📜\n\n`;

    const userCommands = [],
      adminCommands = [];
    const addedCmds = new Set();
    commands.forEach((command) => {
      if (addedCmds.has(command.config.name)) return;
      if (command.config.permission === 0) userCommands.push(command.config);
      else if (command.config.permission === 1)
        adminCommands.push(command.config);
      addedCmds.add(command.config.name);
    });

    if (userCommands.length > 0) {
      guideMessage += `👤 **সাধারণ কমান্ড (প্রিফিক্স: ${userPrefix})**\n\n`;
      userCommands.sort((a, b) => a.name.localeCompare(b.name));
      userCommands.forEach((cmd) => {
        guideMessage += `🔹 **${userPrefix}${cmd.name}**\n   • ${
          cmd.description || "N/A"
        }\n   • ব্যবহার: \`${cmd.usage.replace(/^\/|@/, userPrefix)}\`\n\n`;
      });
    }

    if (adminCommands.length > 0) {
      guideMessage += `👑 **অ্যাডমিন কমান্ড (প্রিফিক্স: ${adminPrefix})**\n\n`;
      adminCommands.sort((a, b) => a.name.localeCompare(b.name));
      adminCommands.forEach((cmd) => {
        guideMessage += `🔸 **${adminPrefix}${cmd.name}**\n   • ${
          cmd.description || "N/A"
        }\n   • ব্যবহার: \`${cmd.usage.replace(/^\/|@/, adminPrefix)}\`\n\n`;
      });
    }

    guideMessage += `💡 **টিপস:**\n   • নির্দিষ্ট কমান্ড সম্পর্কে জানতে "${userPrefix}help [কমান্ড]" ব্যবহার করুন।\n\n❤️ সিজুকা`;
    api.sendMessage(guideMessage, message.threadID, message.messageID);
  },
};
