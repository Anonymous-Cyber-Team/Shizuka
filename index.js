/* ===================================================
 * প্রজেক্ট সিজুকা - v3.13 (Enhanced AI & Queue Logging)
 * - Added detailed logs for AI request queuing and processing.
 * - Kept initial admin check logs.
 * ===================================================
 */

// === ১. লাইব্রেরি ইম্পোর্ট ===
const login = require("cyber-fca");
const express = require("express");
const fs = require("fs-extra");
const path = require("path");
const { getShizukaReply } = require("./gemini.js"); // <-- gemini.js ইম্পোর্ট নিশ্চিত করুন
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
  // <<< DEBUG: Log loaded Admin IDs >>>
  console.log(
    "[Config Load] Loaded ADMIN_IDS:",
    JSON.stringify(config.ADMIN_IDS),
    `- Type: ${typeof config.ADMIN_IDS}`
  );
  if (!Array.isArray(config.ADMIN_IDS)) {
    console.error("[Config Error] ADMIN_IDS is not an array!");
  } else {
    console.log("[Config Load] ADMIN_IDS seems to be a valid array.");
  }
  // <<< END DEBUG >>>
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

      // --- মেসেজ পাঠানোর Promise Wrapper (অপরিবর্তিত) ---
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

      // === Queue প্রসেসর ফাংশন (Enhanced Logging) ===
      async function processQueue(threadID) {
        console.log(`[Queue Debug - ${threadID}] processQueue called.`);
        const isGroup = !ADMIN_IDS.includes(threadID); // Check if it's potentially a group

        // Check approval *before* processing
        if (isGroup && !groupManager.isGroupApprovedAndActive(threadID)) {
          console.log(
            `[Queue Debug - ${threadID}] Group not active/approved. Clearing queue and stopping.`
          );
          messageQueue.delete(threadID);
          isProcessingQueue.set(threadID, false);
          return;
        }

        const queue = messageQueue.get(threadID);
        if (!queue || queue.length === 0) {
          console.log(
            `[Queue Debug - ${threadID}] Queue is empty. Setting processing flag to false.`
          );
          isProcessingQueue.set(threadID, false);
          return;
        }

        console.log(
          `[Queue Debug - ${threadID}] Queue length: ${queue.length}. Processing next item.`
        );
        isProcessingQueue.set(threadID, true); // Mark as processing *before* async operations

        const { message: nextMessage, senderNameForAI, promptForAI } = queue[0];
        const originalMessageID = nextMessage.messageID; // Get messageID before potential errors

        try {
          console.log(
            `[Queue Debug - ${threadID}] Applying delay if configured (max ${MAX_QUEUE_DELAY_SECONDS}s)...`
          );
          if (MAX_QUEUE_DELAY_SECONDS > 0) {
            const delay = Math.random() * MAX_QUEUE_DELAY_SECONDS * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
            console.log(
              `[Queue Debug - ${threadID}] Delay applied: ${delay.toFixed(0)}ms`
            );
          }

          console.log(
            `[Queue Debug - ${threadID}] Calling getShizukaReply for User ${
              nextMessage.senderID
            }, MsgID ${originalMessageID}. Prompt starts with: "${promptForAI.substring(
              0,
              50
            )}..."`
          );
          const textFromAI = await getShizukaReply(
            threadID,
            promptForAI,
            senderNameForAI
          );
          console.log(
            `[Queue Debug - ${threadID}] Received reply from getShizukaReply: "${textFromAI.substring(
              0,
              50
            )}..."`
          );

          let textToSend = textFromAI,
            reactionEmoji = null,
            separateEmoji = null;
          // ... (Emoji parsing অপরিবর্তিত) ...
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

          // --- Sending logic with logging ---
          if (textToSend) {
            console.log(
              `[Queue Debug - ${threadID}] Attempting to send reply (replying to ${originalMessageID}).`
            );
            try {
              // ============ [BUG FIX] ============
              // await api.sendMessage(textToSend, threadID, originalMessageID); // <-- BUG: Awaiting non-promise
              await sendMessagePromise(textToSend, threadID, originalMessageID); // <-- FIX: Awaiting promise wrapper
              // ===================================
              console.log(
                `[Queue Debug - ${threadID}] Reply sent successfully.`
              );
            } catch (replyError) {
              console.warn(
                `[Queue Warn - ${threadID}] Failed to reply to ${originalMessageID} (${
                  replyError.errorSummary || replyError
                }). Attempting fallback send.`
              );
              try {
                // ============ [BUG FIX] ============
                // await api.sendMessage(textToSend, threadID); // <-- BUG: Awaiting non-promise
                await sendMessagePromise(textToSend, threadID); // <-- FIX: Awaiting promise wrapper
                // ===================================
                console.log(
                  `[Queue Debug - ${threadID}] Fallback send successful.`
                );
              } catch (sendError) {
                console.error(
                  `[Queue Error - ${threadID}] Fallback send also failed:`,
                  sendError.errorSummary || sendError
                );
                // Don't throw here, let finally handle queue progression
              }
            }
          } else {
            console.log(
              `[Queue Debug - ${threadID}] No text to send after emoji parsing.`
            );
          }

          if (reactionEmoji) {
            console.log(
              `[Queue Debug - ${threadID}] Setting reaction: ${reactionEmoji}`
            );
            api.setMessageReaction(
              reactionEmoji,
              nextMessage.messageID,
              () => {},
              true
            );
          }
          if (separateEmoji) {
            console.log(
              `[Queue Debug - ${threadID}] Sending separate emoji: ${separateEmoji}`
            );
            setTimeout(() => api.sendMessage(separateEmoji, threadID), 800);
          }

          console.log(
            `[Queue Debug - ${threadID}] Shifting successful item from queue.`
          );
          queue.shift(); // সফল হলে Queue থেকে সরানো
        } catch (aiError) {
          // This catches errors from getShizukaReply
          console.error(
            `[Queue Error - ${threadID}] Error during AI processing or sending for MsgID ${originalMessageID}:`,
            aiError
          );
          console.log(
            `[Queue Debug - ${threadID}] Shifting errored item from queue.`
          );
          if (queue.length > 0) queue.shift(); // এরর হলেও Queue থেকে সরানো (যদি আইটেম থাকে)
        } finally {
          console.log(`[Queue Debug - ${threadID}] Entering finally block.`);
          const currentQueue = messageQueue.get(threadID); // Re-fetch queue state
          if (currentQueue && currentQueue.length > 0) {
            console.log(
              `[Queue Debug - ${threadID}] Queue still has items (${currentQueue.length}). Scheduling next process.`
            );
            // Schedule next run slightly delayed
            setTimeout(() => processQueue(threadID), 500);
          } else {
            console.log(
              `[Queue Debug - ${threadID}] Queue is now empty. Deleting queue and setting processing flag to false.`
            );
            messageQueue.delete(threadID);
            isProcessingQueue.set(threadID, false); // Mark as not processing ONLY when queue is confirmed empty
          }
        }
      }

      // === enqueueAIRequest Function (Enhanced Logging) ===
      function enqueueAIRequest(message, promptForAI, senderNameForAI = null) {
        const threadID = message.threadID;
        console.log(
          `[Queue Debug - ${threadID}] enqueueAIRequest called by User ${
            message.senderID
          }. Prompt starts with: "${promptForAI.substring(0, 50)}..."`
        );

        if (!messageQueue.has(threadID)) {
          console.log(`[Queue Debug - ${threadID}] Creating new queue.`);
          messageQueue.set(threadID, []);
        }

        const queue = messageQueue.get(threadID);
        queue.push({ message, senderNameForAI, promptForAI });
        console.log(
          `[Queue Debug - ${threadID}] Added item to queue. New length: ${queue.length}.`
        );

        const currentlyProcessing = isProcessingQueue.get(threadID);
        console.log(
          `[Queue Debug - ${threadID}] Currently processing? ${currentlyProcessing}`
        );

        if (!currentlyProcessing) {
          console.log(
            `[Queue Debug - ${threadID}] Not currently processing. Starting processQueue.`
          );
          processQueue(threadID);
        } else {
          console.log(
            `[Queue Debug - ${threadID}] Already processing. Item will be handled later.`
          );
        }
      }

      // === ৫. মেসেজ লিসেনার (MQTT) ===
      api.listenMqtt(async (err, message) => {
        // --- অ্যাডমিন চেক ডিবাগিং লগ (অপরিবর্তিত) ---
        // console.log(`\n--- [Admin Check Debug] ---`); ... console.log(`--- [End Admin Check Debug] ---\n`);

        try {
          // --- প্রাথমিক ফিল্টারিং ---
          if (
            err ||
            !message ||
            String(message.senderID) === botID ||
            message?.body?.startsWith("$")
          ) {
            return;
          }

          const { senderID, threadID, isGroup, author } = message;
          const relevantIDForLogic = senderID || author;

          // <<<< মূল অ্যাডমিন চেক >>>>
          // লগিং আগেই করা হচ্ছে, তাই এখানে শুধু ভ্যারিয়েবল সেট
          const isAdmin = ADMIN_IDS.includes(String(relevantIDForLogic));
          // <<<<------------- >>>>>

          const isApproved = groupManager.isGroupApproved(threadID);
          const isPending =
            !isApproved && groupManager.isGroupPending(threadID);
          const isActiveAndApproved =
            isApproved && groupManager.isGroupApprovedAndActive(threadID);

          // --- ইভেন্ট হ্যান্ডেলিং ---
          if (message.type === "event" || message.logMessageType) {
            /* ... (অপরিবর্তিত) ... */ if (
              message.logMessageType === "log:subscribe"
            ) {
              return handleEvent({ api, message, config, messageCache });
            } else if (isActiveAndApproved) {
              return handleEvent({ api, message, config, messageCache });
            }
            return;
          }

          // --- মেসেজ হ্যান্ডেলিং ---
          if (
            !["message", "message_reply"].includes(message.type) ||
            !message.body
          ) {
            return;
          }

          // --- নতুন গ্রুপ শনাক্তকরণ ---
          if (isGroup && !isApproved && !isPending) {
            /* ... (অপরিবর্তিত) ... */ console.log(
              `[New Group Detected] First message received from unknown group: ${threadID}`
            );
            const handled = await groupManager.handleNewGroupInteraction(
              api,
              threadID,
              config
            );
            if (threadID) api.markAsRead(threadID, () => {});
            return;
          }

          // Mark as read
          if ((isApproved || (isAdmin && !isGroup)) && threadID) {
            api.markAsRead(threadID, () => {});
          }

          // --- মেসেজ ক্যাশ করা ---
          if (isActiveAndApproved && message.messageID) {
            messageCache.set(message.messageID, {
              body: message.body,
              senderID,
              attachments: message.attachments || [],
            });
          }

          // --- রিপ্লাই হ্যান্ডলার চেক ---
          if (message.type === "message_reply") {
            /* ... (অপরিবর্তিত) ... */ const handlers = [
              "quiz",
              "teach",
              "weather",
            ];
            for (const cmdName of handlers) {
              const command = commands.get(cmdName);
              if (
                command?.handleReply &&
                (await command.handleReply({ api, message, config }))
              ) {
                return;
              }
            }
          }

          // --- কমান্ড হ্যান্ডলিং ---
          if ((isAdmin && !isGroup) || isApproved) {
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
          }

          // --- সাধারণ ইন্টারঅ্যাকশন ---
          const canInteractGeneral =
            (isAdmin && !isGroup) || isActiveAndApproved;
          if (!canInteractGeneral) {
            return;
          }

          // --- Bad Word Check ---
          const messageBodyLower = message.body.toLowerCase();
          if (
            BAD_WORDS.some((word) =>
              messageBodyLower.includes(word.toLowerCase())
            )
          ) {
            console.log(
              `[AI Trigger - BadWord] User: ${senderID}, Thread: ${threadID}`
            ); // <-- AI কল লগ
            return enqueueAIRequest(
              message,
              `##BAD_WORD_WARNING## ${message.body}`
            );
          }

          // --- Salam Check ---
          const salamRegex =
            /^(as[s]?alamu|salam)a?lai[ck]um|سلام|আস[্]?সালামু?আলাইকুম/i;
          if (salamRegex.test(messageBodyLower.replace(/\s+/g, ""))) {
            const now = Date.now();
            if (now - (userCooldowns.get(`salam_${senderID}`) || 0) < 30000)
              return;
            userCooldowns.set(`salam_${senderID}`, now);
            console.log(
              `[AI Trigger - Salam] User: ${senderID}, Thread: ${threadID}`
            ); // <-- AI কল লগ
            return enqueueAIRequest(message, "##SALAM_REPLY_REQUEST##");
          }

          // --- AI Trigger Check ---
          let isReplyToBot = String(message.messageReply?.senderID) === botID;
          const includesBotName = BOT_NAMES.some((name) =>
            messageBodyLower.includes(name.toLowerCase())
          );
          if (isReplyToBot || includesBotName || (isAdmin && !isGroup)) {
            console.log(
              `[AI Trigger - Mention/Reply/Inbox] User: ${senderID}, Thread: ${threadID}`
            ); // <-- AI কল লগ
            const userInfo = await api.getUserInfo([senderID]);
            return enqueueAIRequest(
              message,
              message.body.trim(),
              userInfo?.[senderID]?.name
            );
          }

          // --- Random Reply Prompt ---
          if (
            isGroup &&
            isActiveAndApproved &&
            (config.REPLY_PROMPT_CHANCE ?? 0) > 0 &&
            Math.random() < config.REPLY_PROMPT_CHANCE
          ) {
            console.log(
              `[AI Trigger - Random] User: ${senderID}, Thread: ${threadID}`
            ); // <-- AI কল লগ
            enqueueAIRequest(message, "##REPLY_PROMPT_REQUEST##");
          }
        } catch (listenerError) {
          console.error("লিসেনারে মারাত্মক ত্রুটি:", listenerError);
          // console.error("[Listener Error] Associated message object:", JSON.stringify(message || {}, null, 2));
        }
      }); // listenMqtt ends here
    } // login callback ends here
  ); // login ends here
} catch (e) {
  console.error("বট চালু করার সময় মারাত্মক ত্রুটি:", e);
}

function clearOldCache() {
  /* ... (অপরিবর্তিত) ... */ const now = Date.now();
  messageCache.forEach((data, id) => {
    if (now - (data.timestamp || 0) > CACHE_EXPIRY_MS) messageCache.delete(id);
  });
}
