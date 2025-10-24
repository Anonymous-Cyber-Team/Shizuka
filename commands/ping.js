// ./commands/ping.js

module.exports = {
  // কমান্ডের কনফিগারেশন
  config: {
    name: "ping", // কমান্ডের মূল নাম
    aliases: ["p", "speed"], // কমান্ডের অন্যান্য নাম
    description: "বটের রেসপন্স টাইম চেক করার জন্য।", // কমান্ডের বর্ণনা
    permission: 0, // 0 = সবাই ব্যবহার করতে পারবে, 1 = শুধু অ্যাডমিন
    cooldown: 5, // সেকেন্ডে (একই ইউজার ৫ সেকেন্ডের মধ্যে আবার ব্যবহার করতে পারবে না)
    usage: "/ping", // কমান্ডের ব্যবহার নির্দেশিকা
  },

  // কমান্ডটি রান করার মূল ফাংশন
  run: async function ({ api, message }) {
    const startTime = Date.now();
    // একটি সাধারণ মেসেজ পাঠানো হচ্ছে
    api.sendMessage(
      "Pong! 🏓",
      message.threadID,
      (err, messageInfo) => {
        if (err) return console.error(err);

        const latency = Date.now() - startTime;
        // মেসেজটি এডিট করে ল্যাটেন্সি দেখানো হচ্ছে
        api.editMessage(
          `Pong! 🏓\nরেসপন্স টাইম: ${latency}ms`,
          messageInfo.messageID,
          () => {}
        );
      },
      message.messageID
    );
  },
};
