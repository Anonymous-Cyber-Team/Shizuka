// utils/teachManager.js

const fs = require("fs-extra");
const path = require("path");
const teachDataPath = path.join(__dirname, "..", "teachData.json");

// --- ডেটা লোড এবং সেভ ---
function loadTeachData() {
  try {
    if (!fs.existsSync(teachDataPath)) {
      fs.writeJsonSync(teachDataPath, [], { spaces: 2 }); // ফাইল না থাকলে খালি অ্যারে দিয়ে তৈরি
    }
    return fs.readJsonSync(teachDataPath); // অ্যারে হিসেবে লোড
  } catch (error) {
    console.error("[TeachManager] teachData.json লোড করতে সমস্যা:", error);
    return []; // এরর হলে খালি অ্যারে
  }
}

function saveTeachData(data) {
  try {
    // নিশ্চিত করা হচ্ছে যে ডেটা একটি অ্যারে
    if (!Array.isArray(data)) {
      console.error("[TeachManager] সেভ করার জন্য ডেটা অ্যারে ফরম্যাটে নেই!");
      return;
    }
    fs.writeJsonSync(teachDataPath, data, { spaces: 2 });
  } catch (error) {
    console.error("[TeachManager] teachData.json সেভ করতে সমস্যা:", error);
  }
}

// --- Teach ম্যানেজমেন্ট ফাংশন ---

// নতুন প্রশ্নোত্তর যোগ করা
function addTeachData(question, answer) {
  const data = loadTeachData();
  // একই প্রশ্ন আগে আছে কিনা চেক করা (case-insensitive)
  const existingIndex = data.findIndex(
    (item) => item.question.toLowerCase() === question.toLowerCase()
  );
  if (existingIndex !== -1) {
    // যদি থাকে, আপডেট করা
    data[existingIndex].answer = answer;
    saveTeachData(data);
    return {
      success: true,
      message: `ℹ️ প্রশ্নটি আগে থেকেই ছিল, উত্তর আপডেট করা হয়েছে। (আইডি: ${
        existingIndex + 1
      })`,
    };
  } else {
    // না থাকলে নতুন করে যোগ করা
    data.push({ question, answer });
    saveTeachData(data);
    const newIndex = data.length; // নতুন আইডি হবে দৈর্ঘ্য
    return {
      success: true,
      message: `✅ নতুন প্রশ্নোত্তর শেখানো হয়েছে। (আইডি: ${newIndex})`,
    };
  }
}

// প্রশ্নোত্তর তালিকা পাওয়া
function getTeachList() {
  return loadTeachData();
}

// নির্দিষ্ট প্রশ্নোত্তর পাওয়া (ইনডেক্স দিয়ে)
function getTeachDataByIndex(index) {
  const data = loadTeachData();
  if (index >= 0 && index < data.length) {
    return data[index];
  }
  return null;
}

// নির্দিষ্ট প্রশ্নোত্তর এডিট করা (ইনডেক্স দিয়ে)
function editTeachData(index, newQuestion, newAnswer) {
  const data = loadTeachData();
  if (index >= 0 && index < data.length) {
    data[index] = { question: newQuestion, answer: newAnswer };
    saveTeachData(data);
    return {
      success: true,
      message: `✏️ আইডি ${index + 1} এর প্রশ্নোত্তর এডিট করা হয়েছে।`,
    };
  }
  return { success: false, message: `❌ আইডি ${index + 1} খুঁজে পাওয়া যায়নি।` };
}

// নির্দিষ্ট প্রশ্নোত্তর ডিলিট করা (ইনডেক্স দিয়ে)
function deleteTeachData(index) {
  const data = loadTeachData();
  if (index >= 0 && index < data.length) {
    const deletedItem = data.splice(index, 1)[0]; // অ্যারে থেকে সরানো
    saveTeachData(data);
    return {
      success: true,
      message: `🗑️ আইডি ${index + 1} ("${deletedItem.question.substring(
        0,
        20
      )}...") মুছে ফেলা হয়েছে।`,
    };
  }
  return { success: false, message: `❌ আইডি ${index + 1} খুঁজে পাওয়া যায়নি।` };
}

// নির্দিষ্ট প্রশ্নের উত্তর খোঁজা (Gemini.js ব্যবহার করবে)
function findAnswer(userQuestion) {
  const data = loadTeachData();
  const lowerUserQuestion = userQuestion.toLowerCase().trim();
  // হুবহু মিল খোঁজা হচ্ছে (case-insensitive)
  const found = data.find(
    (item) => item.question.toLowerCase().trim() === lowerUserQuestion
  );
  return found ? found.answer : null; // মিললে উত্তর, না মিললে null
}

module.exports = {
  addTeachData,
  getTeachList,
  getTeachDataByIndex,
  editTeachData,
  deleteTeachData,
  findAnswer,
  loadTeachData, // gemini.js এ ব্যবহারের জন্য
};
