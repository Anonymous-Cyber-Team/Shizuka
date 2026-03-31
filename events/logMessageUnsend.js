// events/logMessageUnsend.js (v1.1 - More Debugging)

const fs = require("fs-extra");
const axios = require("axios"); // <-- axios ইম্পোর্ট
const path = require("path");

module.exports = {
  name: "log:message-unsend",

  run: async function ({ api, message, config, messageCache }) {
    // *** নতুন ডিবাগিং লগ ***
    console.log(
      `[AntiUnsend Debug] Event received for Thread: ${message.threadID}, Author: ${message.author}, UnsentMsgID: ${message.logMessageData.messageID}`
    );

    const ADMIN_IDS = config.ADMIN_IDS || [];
    const unsenderID = message.author;
    const unsentMessageID = message.logMessageData.messageID;

    // অ্যাডমিন চেক
    if (ADMIN_IDS.includes(unsenderID)) {
      console.log(
        `[AntiUnsend Debug] Action ignored: Unsender ${unsenderID} is an admin.`
      );
      return;
    }

    // ক্যাশ চেক
    const cachedMessage = messageCache.get(unsentMessageID);
    // *** নতুন ডিবাগিং লগ ***
    console.log(
      `[AntiUnsend Debug] Checking cache for ${unsentMessageID}. Found:`,
      cachedMessage ? "Yes" : "No"
    );

    if (!cachedMessage) {
      console.log(`[AntiUnsend Debug] Message not found in cache or expired.`);
      return; // ক্যাশে না পেলে ইগনোর
    }

    const originalSenderID = cachedMessage.senderID;
    const originalBody = cachedMessage.body;
    const originalAttachments = cachedMessage.attachments || []; // Ensure it's an array

    // *** নতুন ডিবাগিং লগ ***
    console.log(
      `[AntiUnsend Debug] Cached Data: Sender=${originalSenderID}, Body=${
        originalBody ? '"' + originalBody.substring(0, 20) + '"...' : "No"
      }, Attachments=${originalAttachments.length}`
    );

    // প্রেরক একই কিনা এবং কিছু কন্টেন্ট (বডি বা অ্যাটাচমেন্ট) আছে কিনা
    if (
      unsenderID === originalSenderID &&
      (originalBody || originalAttachments.length > 0)
    ) {
      let userName = `User (${unsenderID})`;
      try {
        // *** নতুন ডিবাগিং লগ ***
        console.log(`[AntiUnsend Debug] Fetching user info for ${unsenderID}`);
        const userInfo = await api.getUserInfo([unsenderID]);
        userName = userInfo[unsenderID]?.name || userName;
        console.log(`[AntiUnsend Debug] Fetched user name: ${userName}`);
      } catch (e) {
        console.warn("[AntiUnsend] User name fetch error:", e);
      }

      // --- অ্যাটাচমেন্ট হ্যান্ডেলিং ---
      const attachmentsList = [];
      const downloadedFiles = []; // ডিলিট করার জন্য পাথ সেভ রাখা হবে

      if (originalAttachments.length > 0) {
        console.log(
          `[AntiUnsend] Downloading ${originalAttachments.length} attachments...`
        );
        try {
          let count = 0;
          for (const file of originalAttachments) {
            count++;
            // ফাইলের টাইপ অনুযায়ী এক্সটেনশন বের করা (URL থেকে বা টাইপ থেকে)
            let ext = "tmp";
            if (file.type === "photo") ext = "jpg";
            else if (file.type === "video") ext = "mp4";
            else if (file.type === "audio") ext = "mp3";
            else if (file.type === "animated_image") ext = "gif";
            else if (file.url) {
              try {
                ext = new URL(file.url).pathname.split(".").pop() || "tmp";
              } catch {}
            }

            const filePath = path.join(
              __dirname,
              "..",
              "cache",
              `resend_${unsentMessageID}_${count}.${ext}`
            );
            downloadedFiles.push(filePath); // পাথ সেভ করা

            // ফাইল ডাউনলোড
            const response = await axios.get(
              file.url || file.previewUrl || file.thumbnailUrl,
              { responseType: "arraybuffer" }
            );
            await fs.writeFile(filePath, Buffer.from(response.data, "binary"));
            attachmentsList.push(fs.createReadStream(filePath));
            console.log(
              `[AntiUnsend] ফাইল ${count} ডাউনলোড সম্পন্ন: ${filePath}`
            );
          }
        } catch (downloadError) {
          console.error(
            "[AntiUnsend] অ্যাটাচমেন্ট ডাউনলোড বা সেভ করতে সমস্যা:",
            downloadError
          );
          // ডাউনলোড ফেইল করলে শুধু টেক্সট পাঠানো হবে (যদি থাকে)
          if (!originalBody) return; // যদি শুধু অ্যাটাচমেন্ট থাকে এবং ডাউনলোড ফেইল করে, তাহলে কিছুই পাঠানো হবে না
          attachmentsList.length = 0; // অ্যাটাচমেন্ট লিস্ট খালি করা
          downloadedFiles.length = 0; // ডিলিট করার লিস্ট খালি করা
        }
      }

      // --- রিপোস্ট মেসেজ তৈরি ---
      const mention = { tag: `@${userName}`, id: unsenderID };
      let repostBody = `কই গো সবাই দেখুন 👀\n${mention.tag} এই লুচ্ছায় 🤭\n`;
      if (originalBody) {
        repostBody += `মাত্র "${originalBody}"\n`;
      }
      if (attachmentsList.length > 0) {
        repostBody += `এই ${
          attachmentsList.length > 1
            ? attachmentsList.length + "টা ফাইল"
            : "ফাইলটা"
        } `;
      } else if (originalBody) {
        repostBody += `এই টেক্সট টা `;
      }
      repostBody += `রিমুভ দিছে😁`;

      const resendMsg = {
        body: repostBody,
        mentions: [mention],
      };
      if (attachmentsList.length > 0) {
        resendMsg.attachment = attachmentsList;
      }

      // --- মেসেজ পাঠানো ---
      // *** নতুন ডিবাগিং লগ ***
      console.log(
        `[AntiUnsend Debug] Sending repost message to thread ${message.threadID}`
      );
      api.sendMessage(resendMsg, message.threadID, (sendErr, sentInfo) => {
        // মেসেজ পাঠানোর পর ডাউনলোড করা ফাইলগুলো ডিলিট করে দেওয়া
        downloadedFiles.forEach((filePath) => {
          fs.unlink(filePath, (delErr) => {
            if (delErr)
              console.warn(
                `[AntiUnsend] ক্যাশ ফাইল ডিলিট করতে সমস্যা: ${filePath}`,
                delErr
              );
          });
        });

        if (sendErr) {
          console.error("[AntiUnsend] রিপোস্ট মেসেজ পাঠাতে সমস্যা:", sendErr);
          // যদি অ্যাটাচমেন্টসহ পাঠাতে সমস্যা হয়, শুধু টেক্সট পাঠানোর চেষ্টা করা (যদি টেক্সট থাকে)
          if (attachmentsList.length > 0 && originalBody) {
            resendMsg.body = `🧐 ${mention.tag} একটি মেসেজ ("${originalBody}") এবং কিছু ফাইল রিমুভ করেছে।`;
            delete resendMsg.attachment;
            api.sendMessage(resendMsg, message.threadID);
          } else if (originalBody) {
            api.sendMessage(
              `🧐 ${mention.tag} একটি মেসেজ রিমুভ করেছে: "${originalBody}"`,
              message.threadID
            );
          }
        } else {
          console.log(
            `[AntiUnsend Success] Message reposted successfully. Original ID: ${unsentMessageID}`
          ); // সফল লগ
          messageCache.delete(unsentMessageID); // সফলভাবে পাঠালে ক্যাশ ডিলিট
        }
      });
    } else {
      console.log(
        `[AntiUnsend Debug] Condition not met: Sender match=${
          unsenderID === originalSenderID
        }, Has Content=${!!(originalBody || originalAttachments.length > 0)}`
      );
      // অপ্রয়োজনীয় ক্যাশ ডিলিট করা যেতে পারে যদি প্রেরক না মেলে
      if (unsenderID !== originalSenderID) messageCache.delete(unsentMessageID);
    }
  },
};
