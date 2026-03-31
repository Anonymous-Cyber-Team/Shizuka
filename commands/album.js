// commands/album.js
const { commands } = require("../command-handler");

module.exports = {
  config: {
    name: "album",
    aliases: ["allcmd", "commandlist", "admincmd"],
    description: "শুধুমাত্র অ্যাডমিনদের ব্যবহারযোগ্য কমান্ডের তালিকা।",
    permission: 1,
    cooldown: 10,
    usage: "@album",
  },
  run: async function ({ api, message, config }) {
    const adminPrefix = config.SECRET_ADMIN_PREFIX || "@";
    let response = `👑 === অ্যাডমিন কমান্ড অ্যালবাম === 👑\n\n`;
    const adminCommands = [];

    commands.forEach((command) => {
      if (
        command.config.permission === 1 &&
        !adminCommands.some((c) => c.key === command.config.name)
      ) {
        adminCommands.push({
          key: command.config.name,
          config: command.config,
        });
      }
    });

    if (adminCommands.length === 0) {
      response += "কোনো অ্যাডমিন কমান্ড পাওয়া যায়নি।";
    } else {
      adminCommands.sort((a, b) => a.key.localeCompare(b.key));
      adminCommands.forEach((cmd) => {
        response += `🔸 ${adminPrefix}${cmd.key}\n`;
        response += `   • বর্ণনা: ${cmd.config.description || "N/A"}\n`;
        const usage = cmd.config.usage
          ? cmd.config.usage.replace(/^!admin\s*/, adminPrefix)
          : `${adminPrefix}${cmd.key}`;
        response += `   • ব্যবহার: ${usage}\n\n`;
      });
    }
    api.sendMessage(response, message.threadID, message.messageID);
  },
};
