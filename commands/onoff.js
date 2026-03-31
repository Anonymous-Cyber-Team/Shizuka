// commands/onoff.js (v1.3 - Fixed commandName Error)

// groupManager থেকে প্রয়োজনীয় ফাংশনগুলো ইম্পোর্ট করা হচ্ছে
const { isGroupApproved, updateGroupStatus } = require("../utils/groupManager");

module.exports = {
  config: {
    name: "on", // মূল কমান্ড On করার জন্য
    aliases: ["off"], // Off করার জন্য এলিয়াস
    description:
      "বর্তমান গ্রুপে বটকে সক্রিয় (On) বা নিষ্ক্রিয় (Off) করে (শুধুমাত্র অ্যাডমিন)।",
    permission: 1, // শুধু অ্যাডমিন
    cooldown: 5,
    usage: "@on অথবা @off",
  },

  // *** সংশোধিত: `run` ফাংশনের প্যারামিটারে `{ commandName }` সঠিকভাবে যোগ করা হয়েছে ***
  run: async function ({ api, message, commandName }) {
    const threadID = message.threadID;
    const senderID = message.senderID;

    // ইনবক্সে কমান্ড দিলে
    if (message.isGroup === false) {
      return api.sendMessage(
        "❌ এই কমান্ডটি শুধুমাত্র গ্রুপে ব্যবহার করা যাবে।",
        senderID
      );
    }

    // গ্রুপটি অ্যাপ্রুভড লিস্টে আছে কিনা চেক করা
    if (!isGroupApproved(threadID)) {
      return api.sendMessage(
        `❌ দুঃখিত, "${
          message.threadName || threadID
        }" গ্রুপটি এখনো অ্যাপ্রুভ করা হয়নি।`,
        senderID
      );
    }

    // commandName ভ্যালিড কিনা চেক করা (এটা undefined হওয়ার কথা নয়, তবে বাড়তি সতর্কতা)
    if (!commandName) {
      console.error("[OnOff Command Error] commandName is undefined!");
      return api.sendMessage(
        "❌ কমান্ডটি সঠিকভাবে সনাক্ত করা যায়নি।",
        senderID
      );
    }

    // commandName ('on' বা 'off') অনুযায়ী টার্গেট স্ট্যাটাস নির্ধারণ
    // *** সংশোধিত: এখন commandName.toLowerCase() কাজ করবে ***
    const targetStatus =
      commandName.toLowerCase() === "on" ? "active" : "inactive";
    console.log(
      `[OnOff Command] User ${senderID} requested status '${targetStatus}' for group ${threadID}`
    );

    // groupManager ব্যবহার করে স্ট্যাটাস আপডেট করার চেষ্টা
    const updateResult = updateGroupStatus(threadID, targetStatus);

    // ফলাফল অ্যাডমিনের ইনবক্সে পাঠানো
    if (updateResult.success) {
      console.log(
        `[OnOff Command] Status update successful for ${threadID}. New status: ${targetStatus}`
      );
      api.sendMessage(updateResult.message, senderID);
    } else {
      console.error(
        `[OnOff Command] Status update failed for ${threadID}. Reason: ${updateResult.message}`
      );
      api.sendMessage(
        `⚠️ স্ট্যাটাস আপডেট করা যায়নি। কারণ: ${updateResult.message}`,
        senderID
      );
    }
  },
};
