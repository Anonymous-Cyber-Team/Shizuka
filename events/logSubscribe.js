// events/logSubscribe.js

const fs = require("fs-extra");
const path = require("path");

module.exports = {
  name: "log:subscribe",

  run: async function ({ api, message, config }) {
    const WELCOME_GIF_PATH = config.WELCOME_GIF_PATH;
    const addedUsers = message.logMessageData.addedParticipants;

    for (const user of addedUsers) {
      const userName = user.fullName;
      const userID = user.userFbId;
      const botID = api.getCurrentUserID();

      if (String(userID) === String(botID)) continue; // বট নিজে জয়েন করলে ওয়েলকাম দেবে না

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
          ), // পাথ ঠিক করা হয়েছে
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
