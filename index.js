/* ===================================================
 * প্রজেক্ট সিজুকা - v3.6 (চূড়ান্ত রিপ্লাই ফলব্যাক ফিক্স)
 * - api.sendMessage এর সঠিক ব্যবহার নিশ্চিত করা হয়েছে
 * - মেসেজ পাঠানোর জন্য Promise-based wrapper যোগ করা হয়েছে
 * ===================================================
 */

// === ১. লাইব্রেরি ইম্পোর্ট ===
const login = require("cyber-fca");
const express = require("express");
const fs = require("fs-extra");
const path = require("path");
const { getShizukaReply } = require("./gemini.js");
const {
  loadCommands,
  handleCommand,
  commands,
} = require("./command-handler.js");
const { loadEvents, handleEvent } = require("./event-handler.js");
const groupManager = require("./utils/groupManager");
const { initializeScheduler } = require("./utils/scheduler.js");

// === ২. কনফিগারেশন ফাইল লোড ===
let config;
try {
  config = JSON.parse(
    fs.readFileSync(path.join(__dirname, "config.json"), "utf8")
  );
} catch (error) {
  console.error(
    "ত্রুটি: 'config.json' ফাইলটি পাওয়া যায়নি বা ফাইলের ফর্ম্যাট ঠিক নেই।"
  );
  process.exit(1);
}

const BOT_NAMES = config.BOT_NAMES || ["সিজুকা"];
const BAD_WORDS = config.BAD_WORDS || [];
const ADMIN_IDS = config.ADMIN_IDS || [];
const MAX_QUEUE_DELAY_SECONDS = config.MAX_QUEUE_DELAY_SECONDS ?? 0;

// === ৩. ভেরিয়েবল ও ওয়েব সার্ভার ===
const userCooldowns = new Map();
const messageCache = new Map();
const CACHE_EXPIRY_MS = 1 * 60 * 60 * 1000;
const messageQueue = new Map();
const isProcessingQueue = new Map();

const app = express();
const port = process.env.PORT || 3000;
app.get("/", (req, res) =>
  res.send("Shizuka Bot is keeping me alive! Status: Running...")
);
app.listen(port, () =>
  console.log(`[+] ওয়েব সার্ভার চালু হয়েছে পোর্ট ${port}-এ।`)
);

// === ৪. বট লগইন এবং লিসেনার চালু ===
try {
  loadCommands();
  loadEvents();

  login(
    {
      appState: JSON.parse(
        fs.readFileSync(path.join(__dirname, "appstate.json"), "utf8")
      ),
    },
    (err, api) => {
      if (err) return console.error("❌ লগইন ব্যর্থ:", err.error || err);

      const botID = String(api.getCurrentUserID());
      console.log(`✅ বট লগইন সফল! | ID: ${botID}`);
      api.setOptions({ logLevel: "silent", listenEvents: true });

      initializeScheduler(api, config);
      setInterval(clearOldCache, 5 * 60 * 1000);

      // --- নতুন: মেসেজ পাঠানোর জন্য Promise Wrapper ---
      // দ্রষ্টব্য: এই ফাংশনটি এখন আর processQueue-তে ব্যবহৃত হচ্ছে না, তবে অন্যান্য মডিউলের জন্য রাখা যেতে পারে।
      function sendMessagePromise(body, threadID, replyToMessageID = null) {
        return new Promise((resolve, reject) => {
          api.sendMessage(
            body,
            threadID,
            (err, messageInfo) => {
              if (err) return reject(err);
              resolve(messageInfo);
            },
            replyToMessageID
          );
        });
      }

      // === Queue প্রসেসর ফাংশন (চূড়ান্ত ফিক্স সহ) ===
      async function processQueue(threadID) {
        const isGroup = !ADMIN_IDS.includes(threadID);
        if (isGroup && !groupManager.isGroupApprovedAndActive(threadID)) {
          messageQueue.delete(threadID);
          isProcessingQueue.set(threadID, false);
          return;
        }
        const queue = messageQueue.get(threadID);
        if (!queue || queue.length === 0) {
          isProcessingQueue.set(threadID, false);
          return;
        }

        isProcessingQueue.set(threadID, true);
        const { message: nextMessage, senderNameForAI, promptForAI } = queue[0];

        try {
          if (MAX_QUEUE_DELAY_SECONDS > 0) {
            await new Promise((resolve) =>
              setTimeout(
                resolve,
                Math.random() * MAX_QUEUE_DELAY_SECONDS * 1000
              )
            );
          }

          const originalMessageID = nextMessage.messageID;
          const textFromAI = await getShizukaReply(
            threadID,
            promptForAI,
            senderNameForAI
          );

          let textToSend = textFromAI,
            reactionEmoji = null,
            separateEmoji = null;

          const reactionMatch = textToSend.match(/\[REACT:\s*(.+?)\s*\]/);
          if (reactionMatch?.[1]) {
            reactionEmoji = reactionMatch[1];
            textToSend = textToSend.replace(reactionMatch[0], "").trim();
          }
          const sepEmojiMatch = textToSend.match(/\[SEP_EMOJI:\s*(.+?)\s*\]/);
          if (sepEmojiMatch?.[1]) {
            separateEmoji = sepEmojiMatch[1];
            textToSend = textToSend.replace(sepEmojiMatch[0], "").trim();
          }

          // --- মূল টেক্সট উত্তর পাঠানো (রিপ্লাই + ফলব্যাক) ---
          if (textToSend) {
            try {
              // প্রথমে রিপ্লাই হিসেবে পাঠানোর চেষ্টা
              await api.sendMessage(textToSend, threadID, originalMessageID);
            } catch (replyError) {
              console.warn(
                `[Reply Fallback] মেসেজ ${originalMessageID}-এ রিপ্লাই করতে সমস্যা (${
                  replyError.errorSummary || replyError
                }), সাধারণ মেসেজ হিসেবে পাঠানো হচ্ছে...`
              );
              try {
                // রিপ্লাই ফেইল করলে, সাধারণ মেসেজ হিসেবে পাঠানোর চেষ্টা
                await api.sendMessage(textToSend, threadID);
              } catch (sendError) {
                console.error(
                  `[Fatal Send Error] সাধারণ মেসেজ পাঠাতেও ব্যর্থ:`,
                  sendError.errorSummary || sendError
                );
                // অ্যাডমিনকে নোটিফাই করা (আগের মতো)
                throw sendError; // Queue প্রসেসরকে জানানো যে এটি ফেইল হয়েছে
              }
            }
          }

          if (reactionEmoji)
            api.setMessageReaction(
              reactionEmoji,
              nextMessage.messageID,
              () => {},
              true
            );
          if (separateEmoji)
            setTimeout(() => api.sendMessage(separateEmoji, threadID), 800);

          queue.shift(); // সফল হলে Queue থেকে সরানো
        } catch (aiError) {
          console.error(
            `[Queue AI Error] User ${nextMessage.senderID}:`,
            aiError
          );
          queue.shift(); // এরর হলেও Queue থেকে সরানো
        } finally {
          if (messageQueue.get(threadID)?.length > 0) {
            setTimeout(() => processQueue(threadID), 500);
          } else {
            messageQueue.delete(threadID);
            isProcessingQueue.set(threadID, false);
          }
        }
      }

      // === ৫. মেসেজ লিসেনার (MQTT) ===
      api.listenMqtt(async (err, message) => {
        try {
          if (
            err ||
            !message ||
            message.senderID === botID ||
            message?.body?.startsWith("$")
          )
            return;
          if (message.threadID) api.markAsRead(message.threadID, () => {});

          const { senderID, threadID, isGroup } = message;
          const isAdmin = ADMIN_IDS.includes(senderID);
          const isActiveAndApproved =
            groupManager.isGroupApprovedAndActive(threadID);

          if (message.type === "event" || message.logMessageType) {
            if (
              isActiveAndApproved ||
              message.logMessageType === "log:subscribe"
            ) {
              return handleEvent({ api, message, config, messageCache });
            }
            return;
          }

          if (
            !["message", "message_reply"].includes(message.type) ||
            !message.body
          )
            return;
          if (isActiveAndApproved && message.messageID)
            messageCache.set(message.messageID, {
              body: message.body,
              senderID,
              attachments: message.attachments || [],
            });

          if (message.type === "message_reply") {
            const handlers = ["quiz", "teach", "weather"];
            for (const cmdName of handlers) {
              const command = commands.get(cmdName);
              if (
                command?.handleReply &&
                (await command.handleReply({ api, message, config }))
              )
                return;
            }
          }

          const canInteract = (isAdmin && !isGroup) || isActiveAndApproved;
          if (!canInteract && !groupManager.isGroupApproved(threadID)) return;

          if (await handleCommand({ api, message, config })) {
            if (
              message.body
                ?.toLowerCase()
                .startsWith(config.SECRET_ADMIN_PREFIX + "off")
            ) {
              messageQueue.delete(threadID);
              isProcessingQueue.set(threadID, false);
            }
            return;
          }

          if (!canInteract) return;

          const messageBodyLower = message.body.toLowerCase();
          if (
            BAD_WORDS.some((word) =>
              messageBodyLower.includes(word.toLowerCase())
            )
          ) {
            return enqueueAIRequest(
              message,
              `##BAD_WORD_WARNING## ${message.body}`
            );
          }

          const salamRegex =
            /^(as[s]?alamu|salam)a?lai[ck]um|سلام|আস[্]?সালামু?আলাইকুম/i;
          if (salamRegex.test(messageBodyLower.replace(/\s+/g, ""))) {
            const now = Date.now();
            if (now - (userCooldowns.get(`salam_${senderID}`) || 0) < 30000)
              return;
            userCooldowns.set(`salam_${senderID}`, now);
            return enqueueAIRequest(message, "##SALAM_REPLY_REQUEST##");
          }

          let isReplyToBot = String(message.messageReply?.senderID) === botID;
          const includesBotName = BOT_NAMES.some((name) =>
            messageBodyLower.includes(name.toLowerCase())
          );

          if (isReplyToBot || includesBotName || (isAdmin && !isGroup)) {
            const userInfo = await api.getUserInfo([senderID]);
            return enqueueAIRequest(
              message,
              message.body.trim(),
              userInfo?.[senderID]?.name
            );
          }

          if (
            isGroup &&
            (config.REPLY_PROMPT_CHANCE ?? 0) > 0 &&
            Math.random() < config.REPLY_PROMPT_CHANCE
          ) {
            enqueueAIRequest(message, "##REPLY_PROMPT_REQUEST##");
          }
        } catch (listenerError) {
          console.error("লিসেনারে মারাত্মক ত্রুটি:", listenerError);
        }
      });

      function enqueueAIRequest(message, promptForAI, senderNameForAI = null) {
        const threadID = message.threadID;
        if (!messageQueue.has(threadID)) messageQueue.set(threadID, []);
        messageQueue
          .get(threadID)
          .push({ message, senderNameForAI, promptForAI });
        if (!isProcessingQueue.get(threadID)) processQueue(threadID);
      }
    }
  );
} catch (e) {
  console.error("বট চালু করার সময় মারাত্মক ত্রুটি:", e);
}

function clearOldCache() {
  const now = Date.now();
  messageCache.forEach((data, id) => {
    if (now - (data.timestamp || 0) > CACHE_EXPIRY_MS) messageCache.delete(id);
  });
}
