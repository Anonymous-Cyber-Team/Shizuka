// commands/group.js

const {
  getPendingGroups,
  approveGroupByCriteria,
  rejectGroupByCriteria,
  rejectAllPending,
  getApprovedGroups,
  removeApprovedGroup,
} = require("../utils/groupManager");

module.exports = {
  config: {
    name: "group",
    aliases: ["grp", "managegroup"],
    description:
      "অ্যাডমিন কর্তৃক গ্রুপ অ্যাপ্রুভাল সিস্টেম ম্যানেজ করার কমান্ড।",
    permission: 1,
    cooldown: 3,
    usage:
      "@group <list|approve|reject|rejectall|approved|remove> [id/name/index]", // <-- ফিক্সড
  },
  run: async function ({ api, message, args }) {
    const command = args[0]?.toLowerCase();
    const criteria = args.slice(1).join(" ");

    switch (command) {
      case "list":
      case "pending":
        const pendingGroups = getPendingGroups();
        if (pendingGroups.length === 0) {
          api.sendMessage(
            "⏳ কোনো গ্রুপ পেন্ডিং নেই।",
            message.threadID,
            message.messageID
          );
        } else {
          let response = "⏳ পেন্ডিং গ্রুপ তালিকা:\n\n";
          pendingGroups.forEach((group, index) => {
            response += `${index + 1}. নাম: ${group.name}\n   আইডি: ${
              group.id
            }\n   যুক্ত করেছে: ${group.requested_by_name} (${
              group.requested_by_id
            })\n\n`;
          });
          api.sendMessage(response, message.threadID, message.messageID);
        }
        break;
      case "approve":
      case "acc":
        if (!criteria)
          return api.sendMessage(
            "❓ ব্যবহার: @group approve <id | নাম | লিস্ট নম্বর>",
            message.threadID,
            message.messageID
          );
        const approveResult = approveGroupByCriteria(criteria);
        api.sendMessage(
          approveResult.message,
          message.threadID,
          message.messageID
        );
        break;
      case "reject":
      case "dec":
        if (!criteria)
          return api.sendMessage(
            "❓ ব্যবহার: @group reject <id | নাম | লিস্ট নম্বর>",
            message.threadID,
            message.messageID
          );
        const rejectResult = rejectGroupByCriteria(criteria);
        api.sendMessage(
          rejectResult.message,
          message.threadID,
          message.messageID
        );
        break;
      case "rejectall":
      case "clear":
        const rejectAllResult = rejectAllPending();
        api.sendMessage(
          rejectAllResult.message,
          message.threadID,
          message.messageID
        );
        break;
      case "approved":
      case "applist":
        const approvedGroups = getApprovedGroups();
        if (approvedGroups.length === 0) {
          api.sendMessage(
            "✅ কোনো গ্রুপ অ্যাপ্রুভ করা নেই।",
            message.threadID,
            message.messageID
          );
        } else {
          let responseApproved = "✅ অ্যাপ্রুভড গ্রুপ তালিকা:\n\n";
          approvedGroups.forEach((group, index) => {
            responseApproved += `${index + 1}. নাম: ${group.name}\n   আইডি: ${
              group.id
            }\n   স্ট্যাটাস: ${group.status === "active" ? "🟢" : "🔴"}\n\n`;
          });
          api.sendMessage(
            responseApproved,
            message.threadID,
            message.messageID
          );
        }
        break;
      case "remove":
      case "unapprove":
        if (!criteria)
          return api.sendMessage(
            "❓ ব্যবহার: @group remove <approved_id | নাম | লিস্ট নম্বর>",
            message.threadID,
            message.messageID
          );
        const removeResult = removeApprovedGroup(criteria);
        api.sendMessage(
          removeResult.message,
          message.threadID,
          message.messageID
        );
        break;
      default:
        api.sendMessage(
          "❓ গ্রুপ ম্যানেজমেন্ট কমান্ড:\n" +
            "• list - পেন্ডিং গ্রুপ দেখুন\n" +
            "• approve <id|নাম|নম্বর> - গ্রুপ অ্যাপ্রুভ করুন\n" +
            "• reject <id|নাম|নম্বর> - গ্রুপ রিজেক্ট করুন\n" +
            "• rejectall - সব পেন্ডিং গ্রুপ রিজেক্ট করুন\n" +
            "• approved - অ্যাপ্রুভড গ্রুপ দেখুন\n" +
            "• remove <id|নাম|নম্বর> - অ্যাপ্রুভড গ্রুপ রিমুভ করুন",
          message.threadID,
          message.messageID
        );
        break;
    }
  },
};
