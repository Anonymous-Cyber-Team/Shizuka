// commands/weather.js

const axios = require("axios");
const { getShizukaReply } = require("../gemini.js");

// স্টেট মনে রাখার জন্য (কাকে লোকেশন জিজ্ঞাসা করা হয়েছে)
const locationRequests = new Map();
const REQUEST_TIMEOUT = 2 * 60 * 1000; // ২ মিনিট পর রিকোয়েস্ট বাতিল

module.exports = {
  config: {
    name: "weather",
    aliases: ["আবহাওয়া"],
    description: "নির্দিষ্ট এলাকার বর্তমান আবহাওয়া জানায়।",
    permission: 0, // সবার জন্য
    cooldown: 10, // ১০ সেকেন্ড
    usage: "/weather [ এলাকার নাম ]",
  },

  run: async function ({ api, message, args, config, commandName }) {
    // <-- commandName যোগ করা হলো
    const threadID = message.threadID;
    const senderID = message.senderID;
    const apiKey = config.WEATHER_API_KEY; // config থেকে API Key লোড

    if (!apiKey || apiKey === "YOUR_OPENWEATHERMAP_API_KEY") {
      console.warn(
        "[Weather] OpenWeatherMap API Key সেট করা নেই config.json এ।"
      );
      return api.sendMessage(
        "😥 দুঃখিত, আবহাওয়া জানানোর সিস্টেমটি এখন সক্রিয় নেই।",
        threadID,
        message.messageID
      );
    }

    let location = args.join(" ").trim();

    // যদি কমান্ড দিয়ে লোকেশন না দেওয়া হয় এবং এই ইউজারকে আগে লোকেশন জিজ্ঞাসা করা হয়নি
    if (!location && !locationRequests.has(senderID)) {
      // লোকেশন জিজ্ঞাসা করা হচ্ছে
      locationRequests.set(senderID, {
        threadID: threadID,
        timestamp: Date.now(),
      });
      // পুরনো রিকোয়েস্ট বাতিল করার টাইমার
      setTimeout(() => {
        if (locationRequests.has(senderID)) {
          locationRequests.delete(senderID);
          // console.log(`[Weather] User ${senderID} এর লোকেশন রিকোয়েস্ট টাইমআউট।`);
        }
      }, REQUEST_TIMEOUT);
      return api.sendMessage(
        "❓ আপনি কোন এলাকার আবহাওয়ার খবর জানতে চান? 😊",
        threadID,
        message.messageID
      );
    }

    // যদি লোকেশন দেওয়া থাকে (অথবা আগের রিপ্লাই থেকে আসে)
    if (location) {
      locationRequests.delete(senderID); // লোকেশন পাওয়া গেছে, রিকোয়েস্ট রিমুভ
      try {
        console.log(`[Weather] "${location}" এর আবহাওয়া খোঁজা হচ্ছে...`);
        // OpenWeatherMap API কল (Current Weather Data)
        const response = await axios.get(
          `https://api.openweathermap.org/data/2.5/weather`,
          {
            params: {
              q: location,
              appid: apiKey,
              units: "metric", // সেলসিয়াস তাপমাত্রা
              lang: "bn", // বাংলাতে বিবরণ (যদি সাপোর্ট করে)
            },
          }
        );

        const weatherData = response.data;

        if (!weatherData || !weatherData.main || !weatherData.weather) {
          throw new Error("API থেকে সম্পূর্ণ ডেটা পাওয়া যায়নি।");
        }

        const description = weatherData.weather[0]?.description || "N/A";
        const temp = weatherData.main.temp;
        const feelsLike = weatherData.main.feels_like;
        const humidity = weatherData.main.humidity;
        const windSpeed = weatherData.wind?.speed || "N/A"; // মিটার/সেকেন্ড
        const cityName = weatherData.name;
        const country = weatherData.sys?.country || "";

        // AI-কে দিয়ে সুন্দর বার্তা তৈরি করানো
        const weatherPrompt = `
[সিস্টেম নোট: নিচের আবহাওয়া ডেটা ব্যবহার করে "${cityName}, ${country}" এলাকার বর্তমান আবহাওয়ার একটি সুন্দর এবং সংক্ষিপ্ত (২-৩ লাইন) বিবরণ দাও। শিজুকার মিষ্টি ব্যক্তিত্ব ব্যবহার করবে।]
বিবরণ: ${description}
তাপমাত্রা: ${temp}°C
অনুভূত হচ্ছে: ${feelsLike}°C
আর্দ্রতা: ${humidity}%
বাতাস: ${windSpeed} m/s
`;
        const weatherReport = await getShizukaReply(
          `WEATHER_REPORT_${threadID}`,
          weatherPrompt
        ); // আলাদা থ্রেড আইডি
        api.sendMessage(weatherReport, threadID, message.messageID);
      } catch (error) {
        console.error(
          `[Weather] "${location}" এর আবহাওয়া আনতে সমস্যা:`,
          error.response?.data?.message || error.message
        );
        if (error.response?.status === 404) {
          api.sendMessage(
            `😥 "${location}" নামে কোনো এলাকা খুঁজে পাওয়া যায়নি। নামটি ঠিক আছে তো?`,
            threadID,
            message.messageID
          );
        } else if (error.response?.status === 401) {
          console.error("[Weather] API Key তে সমস্যা!");
          api.sendMessage(
            "😥 দুঃখিত, আবহাওয়া জানানোর সিস্টেমে একটি সমস্যা হয়েছে।",
            threadID,
            message.messageID
          );
        } else {
          api.sendMessage(
            "😥 দুঃখিত, আবহাওয়ার তথ্য আনতে একটু সমস্যা হচ্ছে।",
            threadID,
            message.messageID
          );
        }
      }
    }
    // লোকেশন দেওয়া হয়নি কিন্তু আগে জিজ্ঞাসা করা হয়েছিল (এই ফাংশনটি handleReply এ কল হবে)
    // else { /* Do nothing here, wait for reply */ }
  },

  // ওয়েদার কমান্ডের রিপ্লাই হ্যান্ডেল করার জন্য (index.js থেকে কল হবে)
  handleReply: async function ({ api, message, config }) {
    const senderID = message.senderID;

    // যদি এই ইউজারকে লোকেশন জিজ্ঞাসা করা হয়েছিল
    if (locationRequests.has(senderID)) {
      const requestData = locationRequests.get(senderID);
      // যদি সঠিক গ্রুপ থেকে রিপ্লাই আসে
      if (message.threadID === requestData.threadID) {
        const providedLocation = message.body.trim();
        if (providedLocation) {
          // লোকেশন পাওয়া গেছে, run ফাংশন আবার কল করা হবে লোকেশন সহ
          console.log(
            `[Weather Reply] ইউজার ${senderID} লোকেশন দিয়েছে: ${providedLocation}`
          );
          // আগের রিকোয়েস্ট ম্যাপ থেকে ডিলিট করা হবে run ফাংশনের ভেতরেই
          await this.run({
            api,
            message,
            args: providedLocation.split(" "),
            config,
            commandName: this.config.name,
          }); // run ফাংশনকে কল করা
          return true; // রিপ্লাই হ্যান্ডেল করা হয়েছে
        } else {
          api.sendMessage(
            "❓ অনুগ্রহ করে এলাকার নামটি বলুন।",
            message.threadID,
            message.messageID
          );
          return true; // রিপ্লাই হ্যান্ডেল করা হয়েছে (আবার জিজ্ঞাসা করে)
        }
      }
    }
    return false; // এটি ওয়েদারের রিপ্লাই নয়
  },
};
