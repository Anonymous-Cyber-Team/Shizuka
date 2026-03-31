// commands/teach.js

const teachManager = require("../utils/teachManager");

// Teach প্রক্রিয়ার স্টেট মনে রাখার জন্য
const teachingState = new Map(); // key: adminID, value: { step: 'ask_question'/'ask_answer', question: '...', editIndex: -1 }

module.exports = {
  config: {
    name: "teach",
    aliases: ["t", "learn"],
    description:
      "সিজুকাকে নতুন প্রশ্নোত্তর শেখানো, দেখা, এডিট বা ডিলিট করা (শুধুমাত্র অ্যাডমিন)।",
    permission: 1, // শুধু অ্যাডমিন
    cooldown: 5,
    usage: "@teach [list|edit|delete] [index]", // মূল teach ইন্টারঅ্যাক্টিভ
  },

  run: async function ({ api, message, args, config }) {
    const adminID = message.senderID;
    const subCommand = args[0]?.toLowerCase();
    const indexArg = args[1]; // Edit বা Delete এর জন্য নম্বর

    // --- সাব-কমান্ড হ্যান্ডলিং ---
    if (subCommand === "list" || subCommand === "l") {
      const teachList = teachManager.getTeachList();
      if (teachList.length === 0) {
        return api.sendMessage(
          "🧠 সিজুকাকে এখনো কিছু শেখানো হয়নি।",
          message.threadID,
          message.messageID
        );
      }
      let response = `📚 শেখানো প্রশ্নোত্তর তালিকা (মোট ${teachList.length} টি):\n\n`;
      teachList.forEach((item, index) => {
        response += `${index + 1}. প্রশ্ন: ${item.question}\n   উত্তর: ${
          item.answer
        }\n\n`;
      });
      return api.sendMessage(response, message.threadID, message.messageID);
    }

    if (subCommand === "edit" || subCommand === "e") {
      const index = parseInt(indexArg, 10) - 1; // 1-based index to 0-based
      const existingData = teachManager.getTeachDataByIndex(index);
      if (!existingData) {
        return api.sendMessage(
          `❌ আইডি ${indexArg} খুঁজে পাওয়া যায়নি। "@teach list" দেখুন।`,
          message.threadID,
          message.messageID
        );
      }
      // এডিট প্রক্রিয়া শুরু
      teachingState.set(adminID, {
        step: "ask_edit_question",
        editIndex: index,
        oldQuestion: existingData.question,
        oldAnswer: existingData.answer,
      });
      return api.sendMessage(
        `✏️ আইডি ${indexArg} এডিট করা হচ্ছে।\n\nনতুন প্রশ্নটি বলুন (অথবা 'skip' লিখুন):`,
        message.threadID,
        message.messageID
      );
    }

    if (subCommand === "delete" || subCommand === "del" || subCommand === "d") {
      const index = parseInt(indexArg, 10) - 1; // 1-based index to 0-based
      if (isNaN(index)) {
        return api.sendMessage(
          `❓ ব্যবহার: @teach delete <আইডি নম্বর>`,
          message.threadID,
          message.messageID
        );
      }
      const deleteResult = teachManager.deleteTeachData(index);
      return api.sendMessage(
        deleteResult.message,
        message.threadID,
        message.messageID
      );
    }

    // --- ইন্টারঅ্যাক্টিভ Teach প্রক্রিয়া শুরু ---
    if (teachingState.has(adminID)) {
      // যদি আগে থেকেই কোনো প্রক্রিয়ায় থাকে, সেটা বাতিল করা
      teachingState.delete(adminID);
    }
    teachingState.set(adminID, { step: "ask_question", editIndex: -1 }); // নতুন প্রক্রিয়া শুরু
    return api.sendMessage(
      "✍️ আপনি সিজুকাকে কী প্রশ্ন শেখাতে চান? বলুন...",
      message.threadID,
      message.messageID
    );
  },

  // Teach রিপ্লাই হ্যান্ডেল করার জন্য (index.js থেকে কল হবে)
  handleReply: async function ({ api, message }) {
    const adminID = message.senderID;
    const state = teachingState.get(adminID);

    // যদি কোনো Teach প্রক্রিয়া না চলে বা এটি Teach মেসেজের রিপ্লাই না হয়
    if (!state || !message.messageReply || !message.messageReply.messageID) {
      return false;
    }

    const replyText = message.body.trim();

    if (state.step === "ask_question") {
      // অ্যাডমিন প্রশ্নটি দিয়েছে
      state.question = replyText;
      state.step = "ask_answer";
      teachingState.set(adminID, state);
      return api.sendMessage(
        `✅ প্রশ্নটি পেয়েছি:\n"${replyText}"\n\nএবার এই প্রশ্নের উত্তরটি বলুন...`,
        message.threadID,
        message.messageID
      );
    } else if (state.step === "ask_answer") {
      // অ্যাডমিন উত্তরটি দিয়েছে
      const answer = replyText;
      const question = state.question;
      teachingState.delete(adminID); // প্রক্রিয়া শেষ

      const addResult = teachManager.addTeachData(question, answer);
      return api.sendMessage(
        addResult.message,
        message.threadID,
        message.messageID
      );
    } else if (state.step === "ask_edit_question") {
      // অ্যাডমিন নতুন প্রশ্নটি দিয়েছে (অথবা skip)
      state.newQuestion =
        replyText.toLowerCase() === "skip" ? state.oldQuestion : replyText;
      state.step = "ask_edit_answer";
      teachingState.set(adminID, state);
      return api.sendMessage(
        `✅ নতুন প্রশ্ন সেট:\n"${state.newQuestion}"\n\nএবার নতুন উত্তরটি বলুন (অথবা 'skip' লিখুন):`,
        message.threadID,
        message.messageID
      );
    } else if (state.step === "ask_edit_answer") {
      // অ্যাডমিন নতুন উত্তরটি দিয়েছে (অথবা skip)
      const newAnswer =
        replyText.toLowerCase() === "skip" ? state.oldAnswer : replyText;
      const index = state.editIndex;
      const newQuestion = state.newQuestion;
      teachingState.delete(adminID); // প্রক্রিয়া শেষ

      const editResult = teachManager.editTeachData(
        index,
        newQuestion,
        newAnswer
      );
      return api.sendMessage(
        editResult.message,
        message.threadID,
        message.messageID
      );
    }

    return false; // state অজানা বা রিপ্লাই প্রাসঙ্গিক নয়
  },
};
