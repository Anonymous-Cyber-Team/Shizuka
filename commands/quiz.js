// commands/quiz.js

const { getShizukaReply } = require("../gemini.js");

const ongoingQuizzes = new Map();

module.exports = {
  config: {
    name: "quiz",
    aliases: ["q"],
    description: "একটি সহজ সাধারণ জ্ঞানের প্রশ্ন জিজ্ঞাসা করে।",
    permission: 0,
    cooldown: 30,
    usage: "/quiz",
  },

  run: async function ({ api, message, config }) {
    // 'config' যোগ করা হয়েছে
    const threadID = message.threadID;

    if (ongoingQuizzes.has(threadID)) {
      return api.sendMessage(
        "⏳ আগের কুইজের উত্তর এখনো বাকি আছে। সেটির উত্তর দিন!",
        message.threadID,
        message.messageID
      );
    }

    try {
      const prompt = `সিজুকা স্টাইলে (৭ বছর বয়সী) একটি সাধারণ জ্ঞানের প্রশ্ন তৈরি করো যা টিনএজার বা তরুণ প্রাপ্তবয়স্কদের জন্য উপযুক্ত। বিষয় হতে পারে বিজ্ঞান, ইতিহাস, ভূগোল, খেলাধুলা, সাহিত্য বা বিনোদন।
**নির্দেশনা:**
1.  **প্রথম লাইনে** প্রশ্নটি থাকবে।
2.  এরপরের চারটি লাইনে চারটি অপশন (A, B, C, D) দিতে হবে, যা "A)", "B)" ইত্যাদি দিয়ে শুরু হবে।
3.  সবশেষে, একটি **নতুন লাইনে** শুধুমাত্র "সঠিক উত্তর: X" (যেখানে X হলো সঠিক অপশনের লেটার) লিখবে।
কোনো অতিরিক্ত ভূমিকা বা শেষের বাক্য দেবে না।`;

      const quizDataRaw = await getShizukaReply("QUIZ_GEN", prompt);

      let question = null,
        options = [],
        correctAnswerLetter = null,
        optionsStarted = false;
      const lines = quizDataRaw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        const optionMatch = line.match(/^([A-D])\)\s*(.+)/i);
        const answerMatch = line.match(/সঠিক উত্তর:\s*([A-D])/i);

        if (answerMatch) {
          correctAnswerLetter = answerMatch[1].toUpperCase();
          break;
        } else if (optionMatch) {
          optionsStarted = true;
          options.push(line);
        } else if (!optionsStarted) {
          question = line;
        }
      }

      if (!question || options.length !== 4 || !correctAnswerLetter) {
        throw new Error("AI response format incorrect.");
      }

      // --- config.json থেকে কুইজের সময়কাল নেওয়া ---
      const quizDurationSeconds = config.QUIZ_DURATION_SECONDS || 30; // ডিফল্ট ৩০ সেকেন্ড
      const quizDurationMillis = quizDurationSeconds * 1000;

      const quizMessage = `🤔 আজকের কুইজ! (সময়: ${quizDurationSeconds} সেকেন্ড) 🤔\n\n${question}\n\n${options.join(
        "\n"
      )}\n\nউত্তর দিতে রিপ্লাই করে শুধু অপশন লেটারটি (A, B, C, বা D) লিখুন! 👇`;

      api.sendMessage(quizMessage, threadID, (err, info) => {
        if (err) {
          console.error("[Quiz Send Error]", err);
          ongoingQuizzes.delete(threadID);
          return;
        }

        ongoingQuizzes.set(threadID, {
          messageID: info.messageID,
          correctAnswer: correctAnswerLetter,
          participants: new Set(),
          startTime: Date.now(),
          timerDuration: quizDurationMillis,
        });

        setTimeout(() => {
          const currentQuiz = ongoingQuizzes.get(threadID);
          if (currentQuiz && currentQuiz.messageID === info.messageID) {
            api.sendMessage(
              `⏰ কুইজের সময় শেষ! সঠিক উত্তর ছিল: ${correctAnswerLetter}`,
              threadID,
              null,
              info.messageID
            );
            ongoingQuizzes.delete(threadID);
          }
        }, quizDurationMillis);
      });
    } catch (error) {
      console.error("[Quiz Command Error]", error);
      api.sendMessage(
        "😥 দুঃখিত, কুইজ প্রশ্ন তৈরি করতে একটু সমস্যা হয়েছে।",
        threadID,
        message.messageID
      );
      ongoingQuizzes.delete(threadID);
    }
  },

  handleReply: function ({ api, message }) {
    const threadID = message.threadID;
    const quizData = ongoingQuizzes.get(threadID);

    if (
      !quizData ||
      !message.messageReply ||
      message.messageReply.messageID !== quizData.messageID
    )
      return false;
    if (Date.now() - quizData.startTime > quizData.timerDuration) return true;

    const userAnswer = message.body.trim().toUpperCase();
    const senderID = message.senderID;

    if (quizData.participants.has(senderID)) return true;
    quizData.participants.add(senderID);

    if (userAnswer === quizData.correctAnswer) {
      api.sendMessage(
        `🎉 সঠিক উত্তর! সাবাশ, ${message.senderName}! 🥳`,
        threadID,
        null,
        message.messageID
      );
      ongoingQuizzes.delete(threadID);
    } else if (["A", "B", "C", "D"].includes(userAnswer)) {
      api.sendMessage("😥 উফফ! ভুল উত্তর।", threadID, null, message.messageID);
    } else {
      api.sendMessage(
        "❓ শুধু অপশন লেটারটি (A, B, C, বা D) লিখে রিপ্লাই দিন।",
        threadID,
        null,
        message.messageID
      );
      quizData.participants.delete(senderID);
    }
    return true;
  },
};
