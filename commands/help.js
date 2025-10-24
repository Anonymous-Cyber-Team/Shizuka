// commands/help.js
const { commands } = require("../command-handler");

module.exports = {
  config: {
    name: "help",
    aliases: ["h", "cmd", "usercmd"],
    description: "সাধারণ ব্যবহারকারীদের জন্য উপলব্ধ কমান্ড তালিকা।",
    permission: 0,
    cooldown: 5,
    usage: "/help [কমান্ডের নাম]",
  },
  run: async function ({ api, message, args, config }) {
    const userPrefix = config.BOT_PREFIX || "/";
    const adminPrefix = config.SECRET_ADMIN_PREFIX || "@"; // অ্যাডমিন কমান্ডের প্রিফিক্স দেখানোর জন্য

    if (args.length > 0) {
      const commandName = args[0].toLowerCase();
      const command = commands.get(commandName);
      // সাধারণ ইউজার অ্যাডমিন কমান্ডের হেল্প দেখতে পাবে না
      if (!command || command.config.permission === 1) {
        return api.sendMessage(
          `❓ "${commandName}" নামে কোনো সাধারণ কমান্ড পাওয়া যায়নি।`,
          message.threadID,
          message.messageID
        );
      }
      // নির্দিষ্ট সাধারণ কমান্ডের হেল্প
      let response = `📜 কমান্ড: ${userPrefix}${command.config.name}\n\n`;
      response += `📝 বর্ণনা: ${command.config.description || "N/A"}\n`;
      if (command.config.aliases && command.config.aliases.length > 0) {
        response += `📌 বিকল্প নাম: ${command.config.aliases.join(", ")}\n`;
      }
      response += `⏳ কুলডাউন: ${command.config.cooldown || 3} সেকেন্ড\n`;
      const usage = command.config.usage
        ? command.config.usage.replace(/^\/\s*/, userPrefix)
        : `${userPrefix}${command.config.name}`;
      response += `💡 ব্যবহার: ${usage}\n`;
      api.sendMessage(response, message.threadID, message.messageID);
    } else {
      // সকল সাধারণ কমান্ডের তালিকা
      let response = "✨ === সিজুকার সাহায্য মেনু === ✨\n\n";
      response += `"${userPrefix}help [কমান্ডের নাম]" লিখে নির্দিষ্ট কমান্ড সম্পর্কে জানতে পারবেন।\n\n`;
      response += "📚 উপলব্ধ সাধারণ কমান্ডসমূহ:\n\n";
      const userCommands = [];
      commands.forEach((command) => {
        if (
          command.config.permission === 0 &&
          !userCommands.some((c) => c.key === command.config.name)
        ) {
          userCommands.push({
            key: command.config.name,
            config: command.config,
          });
        }
      });

      if (userCommands.length === 0) {
        response += "আপাতত কোনো সাধারণ কমান্ড নেই।";
      } else {
        userCommands.sort((a, b) => a.key.localeCompare(b.key));
        userCommands.forEach((cmd) => {
          response += `🔹 ${userPrefix}${cmd.key}\n   • ${
            cmd.config.description || "N/A"
          }\n`;
        });
      }
      response += `\n\n💖 যেকোনো প্রয়োজনে সিজুকাকে নাম ধরে ডাকতে পারেন!`;
      api.sendMessage(response, message.threadID, message.messageID);
    }
  },
};
