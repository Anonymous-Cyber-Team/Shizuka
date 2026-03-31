// events/logSubscribe.js (v2.2 - Admin Check Fix)

const fs = require("fs-extra");
const path = require("path");
const groupManager = require("../utils/groupManager");

module.exports = {
  name: "log:subscribe",

  run: async function ({ api, message, config }) {
    const botID = api.getCurrentUserID();
    const threadID = message.threadID;
    const adderID = message.author; // যে ব্যক্তি অ্যাড করেছে (This ID needs the String() check)
    const addedParticipants = message.logMessageData.addedParticipants;

    const botWasAdded = addedParticipants.some(
      (user) => String(user.userFbId) === String(botID)
    );

    if (botWasAdded) {
      // --- বটকে গ্রুপে অ্যাড করার লজিক ---
      console.log(
        `[Group Subscribe] বটকে গ্রুপ ${threadID}-এ যুক্ত করেছে ${adderID}`
      );

      // <--- সমাধান: adderID কে String() দিয়ে কনভার্ট করে অ্যাডমিন চেক ---
      const isAdminAdder = config.ADMIN_IDS.includes(String(adderID));
      console.log(
        `[Group Subscribe] Adder ${adderID} is admin: ${isAdminAdder}`
      ); // Debug log

      if (isAdminAdder) {
        // --- অ্যাডমিন যুক্ত করলে ---
        const result = await groupManager.autoApproveGroup(
          api,
          threadID,
          adderID
        );
        if (result) {
          api.sendMessage(
            "🌸 অ্যাডমিন আমাকে যুক্ত করায় গ্রুপটি স্বয়ংক্রিয়ভাবে অ্যাপ্রুভ হয়ে গেছে।\n\nআমি সিজুকা, আপনাদের বন্ধু! 💖",
            threadID
          );
        } else {
          // Handle cases where autoApproveGroup might return false (e.g., already approved)
          console.log(
            `[Group Subscribe] Auto-approve for thread ${threadID} returned false (likely already approved).`
          );
        }
      } else {
        // --- সাধারণ ইউজার যুক্ত করলে ---
        const result = await groupManager.addPendingGroup(
          api,
          threadID,
          adderID
        );
        if (result) {
          api.sendMessage(
            "🌸 আসসালামু আলাইকুম!\n\nআমাকে গ্রুপে যুক্ত করার জন্য ধন্যবাদ। এই গ্রুপটি বর্তমানে পেন্ডিং লিস্টে আছে। অ্যাডমিন অ্যাপ্রুভ করলেই আমি কাজ শুরু করবো। 😊",
            threadID
          );

          // --- সকল অ্যাডমিনকে নোটিফিকেশন পাঠানো ---
          let pendingGroupInfo = null;
          try {
            pendingGroupInfo = groupManager
              .getPendingGroups()
              .find((g) => g.id === threadID);
          } catch (e) {
            console.error(
              "[Group Subscribe] Error fetching pending group info:",
              e
            );
          }

          const adderName =
            pendingGroupInfo?.requested_by_name || `User (${adderID})`; // Use fetched name if available
          const groupName = pendingGroupInfo?.name || `Group (${threadID})`; // Use fetched name if available

          const notifyMsg = `🔔 নতুন গ্রুপ পেন্ডিং 🔔\n\nগ্রুপ: ${groupName}\nID: ${threadID}\nযুক্ত করেছে: ${adderName} (ID: ${adderID})\n\nদয়া করে "@group list" বা "@group approveid ${threadID}" ব্যবহার করুন।`;

          if (Array.isArray(config.ADMIN_IDS)) {
            config.ADMIN_IDS.forEach((adminId) => {
              api.sendMessage(notifyMsg, adminId, (err) => {
                if (err)
                  console.error(
                    `[Group Notify Error] অ্যাডমিন ${adminId}-কে জানাতে সমস্যা:`,
                    err
                  );
              });
            });
          }
        } else {
          console.log(
            `[Group Subscribe] addPendingGroup for thread ${threadID} returned false (likely already listed).`
          );
        }
      }
      return; // বট যুক্ত হলে সাধারণ ওয়েলকাম মেসেজ দেখাবে না
    }

    // --- সাধারণ ইউজার গ্রুপে যুক্ত হলে (আগের কোড) ---
    const WELCOME_GIF_PATH = config.WELCOME_GIF_PATH;

    for (const user of addedParticipants) {
      if (String(user.userFbId) === String(botID)) continue; // Double check

      const userName = user.fullName;
      // ... (বাকি ওয়েলকাম মেসেজের কোড অপরিবর্তিত) ...
      let memberCount = 0;
      let threadName = "এই গ্রুপে";
      try {
        const threadInfo = await api.getThreadInfo(message.threadID);
        memberCount = threadInfo.participantIDs.length;
        threadName = threadInfo.name || threadName;
      } catch (e) {
        console.warn("[Welcome Event] গ্রুপের তথ্য আনতে পারিনি:", e);
      }

      const welcomeMessage = `‎╭•┄┅═══❁❁═══┅┄•╮
     আ্ঁস্ঁসা্ঁলা্ঁমু্ঁআ্ঁলা্ঁই্ঁকু্ঁম্ঁ
╰•┄┅═══❁❁═══┅┄•╯
হাসি, মজা, ঠাট্টায় গড়ে উঠুক
চিরস্থায়ী বন্ধুত্বের বন্ধন।
 ভালোবাসা ও সম্পর্ক থাকুক আজীবন।

➤ আশা করি আপনি এখানে হাসি-মজা করে
আড্ডা দিতে ভালোবাসবেন।
➤ সবার সাথে মিলেমিশে থাকবেন।
➤ উস্কানিমূলক কথা বা খারাপ ব্যবহার করবেন না।
➤ গ্রুপ এডমিনের কথা শুনবেন ও রুলস মেনে চলবেন।
›› প্রিয় ${userName},
আপনি এই গ্রুপের ${memberCount} নম্বর মেম্বার!

›› গ্রুপ: ${threadName}   𝐖 𝐄 𝐋 𝐂 𝐎 𝐌 𝐄
╭─╼╾─╼╾─╼╾───╮
       Sʜɩzʋĸʌ Mɩŋʌɱoto
╰───╼╾─╼╾─╼╾─╯`;

      if (fs.existsSync(WELCOME_GIF_PATH)) {
        const msg = {
          body: welcomeMessage,
          attachment: fs.createReadStream(
            path.join(__dirname, "..", WELCOME_GIF_PATH)
          ),
        };
        api.sendMessage(msg, message.threadID);
      } else {
        api.sendMessage(welcomeMessage, message.threadID);
        console.warn(
          `[Welcome Event] ওয়েলকাম GIF ফাইলটি "${WELCOME_GIF_PATH}" পাথে খুঁজে পাওয়া যায়নি।`
        );
      }
    }
  },
};
