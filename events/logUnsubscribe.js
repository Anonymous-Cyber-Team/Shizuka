// events/logUnsubscribe.js (v1.1 - Funny Goodbye Message)

const fs = require('fs-extra');
const path = require('path');

module.exports = {
    name: 'log:unsubscribe',

    run: async function({ api, message, config }) {
        const GOODBYE_GIF_PATH = config.GOODBYE_GIF_PATH;
        const leftUserID = message.logMessageData.leftParticipantFbId; // যে বের হয়ে গেছে তার আইডি
        const botID = api.getCurrentUserID();

        // বট নিজে বের হলে বা আইডি না থাকলে কিছু বলবে না
        if (!leftUserID || String(leftUserID) === String(botID)) return;

        // --- ইউজারের নাম বের করা ---
        let userName = `একজন সদস্য (${leftUserID})`; // ডিফল্ট
        try {
            const userInfo = await api.getUserInfo([leftUserID]);
            if (userInfo && userInfo[leftUserID] && userInfo[leftUserID].name) {
                userName = userInfo[leftUserID].name;
            }
        } catch (e) {
            console.warn(`[Goodbye Event] User ${leftUserID} এর নাম আনতে পারিনি:`, e);
        }
        // --- নাম বের করা শেষ ---


        // --- নতুন ফানি মেসেজ তৈরি ---
        const byeMessageBody = `🚨 ব্রেকিং নিউজ! 🚨\n\n@${userName} কে তার পাছায় লাথি মেরে 🦵 গ্রুপ থেকে বের করে দেওয়া হলো! 🤣\n\nটা টা বাই বাই 👋`;

        // মেনশন অবজেক্ট তৈরি
        const mention = {
            tag: `@${userName}`,
            id: leftUserID
        };
        // --- মেসেজ তৈরি শেষ ---


        // --- মেসেজ ও GIF পাঠানো ---
        if (fs.existsSync(GOODBYE_GIF_PATH)) {
            const msg = {
                body: byeMessageBody,
                mentions: [mention], // মেনশন যোগ করা হলো
                attachment: fs.createReadStream(path.join(__dirname, '..', GOODBYE_GIF_PATH))
            };
            api.sendMessage(msg, message.threadID);
        } else {
            // GIF না থাকলে শুধু টেক্সট পাঠানো
            api.sendMessage({ body: byeMessageBody, mentions: [mention] }, message.threadID);
            console.warn(`[Goodbye Event] গুডবাই GIF ফাইলটি "${GOODBYE_GIF_PATH}" পাথে খুঁজে পাওয়া যায়নি।`);
        }
        // --- পাঠানো শেষ ---
    }
};
