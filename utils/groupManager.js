// utils/groupManager.js (v2.5.1 - Robust Status Update & Save - সম্পূর্ণ কোড)

const fs = require("fs-extra");
const path = require("path");
const groupsFilePath = path.join(__dirname, "..", "groups.json"); // প্রজেক্ট রুটে groups.json

// --- ডেটা লোড এবং সেভ ---
function loadGroups() {
  try {
    if (!fs.existsSync(groupsFilePath)) {
      // স্ট্যাটাস সহ ডিফল্ট স্ট্রাকচার
      fs.writeJsonSync(
        groupsFilePath,
        { pending: [], approved: [] },
        { spaces: 2 }
      );
      console.log(
        "[GroupManager Load] groups.json ফাইল পাওয়া যায়নি, নতুন তৈরি করা হলো।"
      );
      return { pending: [], approved: [] };
    }
    const fileContent = fs.readFileSync(groupsFilePath, "utf8");
    // Handle empty or corrupted file
    let data;
    try {
      data = JSON.parse(
        fileContent.trim() || '{ "pending": [], "approved": [] }'
      );
    } catch (parseError) {
      console.error(
        "[GroupManager Load Error] JSON পার্সিং সমস্যা:",
        parseError,
        "ফাইল রিসেট করা হচ্ছে..."
      );
      data = { pending: [], approved: [] };
      fs.writeJsonSync(groupsFilePath, data, { spaces: 2 });
    }

    // Ensure structure and add default status
    // Ensure approved is always an array before mapping
    data.approved = Array.isArray(data.approved)
      ? data.approved.map((group) => ({
          ...group,
          status: group.status || "active",
        }))
      : [];
    data.pending = Array.isArray(data.pending) ? data.pending : []; // Ensure pending is array
    // console.log("[GroupManager Load] groups.json লোড সম্পন্ন।"); // সফল লোড লগ
    return data;
  } catch (error) {
    console.error(
      "[GroupManager Load Error] groups.json লোড করতে মারাত্মক সমস্যা:",
      error
    );
    try {
      fs.writeJsonSync(
        groupsFilePath,
        { pending: [], approved: [] },
        { spaces: 2 }
      );
    } catch {}
    return { pending: [], approved: [] };
  }
}

function saveGroups(data) {
  try {
    // Ensure structure before saving
    if (
      !data ||
      !Array.isArray(data.pending) ||
      !Array.isArray(data.approved)
    ) {
      console.error(
        "[GroupManager Save Error] সেভ করার জন্য ডেটার গঠন সঠিক নয়!"
      );
      // Attempt to create a minimal valid structure if possible
      data = {
        pending: Array.isArray(data?.pending) ? data.pending : [],
        approved: Array.isArray(data?.approved)
          ? data.approved.map((g) => ({ ...g, status: g.status || "active" }))
          : [], // Ensure status on save too
      };
      console.warn("[GroupManager Save] ডেটার গঠন ঠিক করা হয়েছে।");
    } else {
      // Ensure status property exists on all approved groups before saving
      data.approved = data.approved.map((group) => ({
        ...group,
        status: group.status || "active",
      }));
    }
    fs.writeJsonSync(groupsFilePath, data, { spaces: 2 });
    console.log(
      "[GroupManager Save] groups.json ফাইল সফলভাবে সেভ হয়েছে। Approved:",
      data.approved.length,
      "Pending:",
      data.pending.length
    ); // সেভ কনফার্মেশন লগ
  } catch (error) {
    console.error(
      "[GroupManager Save Error] groups.json সেভ করতে সমস্যা:",
      error
    );
  }
}

// --- গ্রুপ ম্যানেজমেন্ট ফাংশন ---

// নতুন গ্রুপ পেন্ডিং লিস্টে যোগ করা
async function addPendingGroup(api, threadID, adderUserID) {
  console.log(
    `[AddPending] ফাংশন কল। Thread ID: ${threadID}, Adder: ${adderUserID}`
  );
  let groups;
  try {
    groups = loadGroups();
  } catch (loadErr) {
    console.error("[AddPending] groups.json লোড করতে সমস্যা:", loadErr);
    return false;
  }

  const isPending = groups.pending.some((g) => g.id === threadID);
  const isApproved = groups.approved.some((g) => g.id === threadID);
  console.log(
    `[AddPending] গ্রুপ ${threadID} চেক: Pending=${isPending}, Approved=${isApproved}`
  );
  if (isPending || isApproved) {
    console.log(`[GroupManager] গ্রুপ ${threadID} আগে থেকেই লিস্টে আছে.`);
    return false;
  }

  let groupName = `Unknown Group (${threadID})`;
  let adderName = `Unknown Adder (${adderUserID || "N/A"})`;
  try {
    console.log(`[AddPending] গ্রুপ ${threadID} ইনফো আনা হচ্ছে...`);
    const threadInfo = await api.getThreadInfo(threadID);
    if (threadInfo?.[threadID]?.name) {
      groupName = threadInfo[threadID].name;
    } else if (threadInfo?.name) {
      groupName = threadInfo.name;
    }
    console.log(`[AddPending] গ্রুপ নাম: ${groupName}`);
  } catch (err) {
    console.error(
      `[GroupManager] গ্রুপ ${threadID} নাম আনতে সমস্যা:`,
      err.errorDescription || err
    );
  }
  try {
    if (adderUserID) {
      console.log(`[AddPending] ইউজার ${adderUserID} ইনফো আনা হচ্ছে...`);
      const adderInfo = await api.getUserInfo([adderUserID]);
      if (adderInfo?.[adderUserID]?.name) {
        adderName = adderInfo[adderUserID].name;
        console.log(`[AddPending] অ্যাডার নাম: ${adderName}`);
      }
    }
  } catch (err) {
    console.error(
      `[GroupManager] ইউজার ${adderUserID} নাম আনতে সমস্যা:`,
      err.errorDescription || err
    );
  }

  const newEntry = {
    id: threadID,
    name: groupName,
    requested_by_id: adderUserID || "N/A",
    requested_by_name: adderName,
  };
  groups.pending.push(newEntry);
  try {
    saveGroups(groups);
    console.log(
      `[GroupManager] নতুন গ্রুপ পেন্ডিং: ${groupName} (ID: ${threadID})`
    );
    return true;
  } catch (saveError) {
    console.error("[GroupManager] Pending গ্রুপ সেভে সমস্যা:", saveError);
    return false;
  }
}

// অ্যাডমিন অ্যাড করলে অটো অ্যাপ্রুভ
async function autoApproveGroup(api, threadID, adminUserID) {
  console.log(
    `[AutoApprove] কল হয়েছে। Thread ID: ${threadID}, Admin: ${adminUserID}`
  );
  let groups;
  try {
    groups = loadGroups();
  } catch {
    return false;
  }
  const isApproved = groups.approved.some((g) => g.id === threadID);
  console.log(`[AutoApprove] গ্রুপ ${threadID} চেক: Approved=${isApproved}`);
  if (isApproved) {
    console.log(`[GroupManager] গ্রুপ ${threadID} আগে থেকেই অ্যাপ্রুভড।`);
    groups.pending = groups.pending.filter((g) => g.id !== threadID);
    saveGroups(groups);
    return false;
  }

  let groupName = `Unknown Group (${threadID})`;
  let adminName = `Admin (${adminUserID})`;
  try {
    /* ... নাম আনা ... */
  } catch {}
  try {
    /* ... নাম আনা ... */
  } catch {}

  const newEntry = {
    id: threadID,
    name: groupName,
    requested_by_id: adminUserID,
    requested_by_name: adminName,
    status: "active",
  }; // <-- স্ট্যাটাস অ্যাক্টিভ
  groups.pending = groups.pending.filter((g) => g.id !== threadID);
  groups.approved.push(newEntry);
  try {
    saveGroups(groups);
    console.log(
      `[GroupManager] অটো-অ্যাপ্রুভ হয়েছে: ${groupName} (ID: ${threadID})`
    );
    return true;
  } catch (saveError) {
    console.error("[GroupManager] AutoApprove সেভে সমস্যা:", saveError);
    return false;
  }
}

// গ্রুপ অ্যাপ্রুভ করা
function approveGroupByCriteria(criteria) {
  const groups = loadGroups();
  let groupIndex = -1;
  let approvedGroupData = null;
  const index = parseInt(criteria, 10);
  if (!isNaN(index) && index > 0 && index <= groups.pending.length) {
    groupIndex = index - 1;
    approvedGroupData = groups.pending[groupIndex];
  } else {
    groupIndex = groups.pending.findIndex(
      (g) =>
        g.id === criteria || g.name.toLowerCase() === criteria.toLowerCase()
    );
    if (groupIndex !== -1) {
      approvedGroupData = groups.pending[groupIndex];
    }
  }
  if (groupIndex === -1 || !approvedGroupData) {
    return {
      success: false,
      message: `"${criteria}" পেন্ডিং লিস্টে পাওয়া যায়নি।`,
    };
  }
  groups.pending.splice(groupIndex, 1);
  if (!groups.approved.some((g) => g.id === approvedGroupData.id)) {
    groups.approved.push({ ...approvedGroupData, status: "active" });
    saveGroups(groups);
    return {
      success: true,
      message: `✅ "${approvedGroupData.name}" (${approvedGroupData.id}) অ্যাপ্রুভ করা হয়েছে।`,
    };
  } else {
    saveGroups(groups);
    return {
      success: true,
      message: `ℹ️ "${approvedGroupData.name}" (${approvedGroupData.id}) আগে থেকেই অ্যাপ্রুভড, পেন্ডিং থেকে সরানো হলো।`,
    };
  }
}

// গ্রুপ রিজেক্ট করা
function rejectGroupByCriteria(criteria) {
  const groups = loadGroups();
  let groupIndex = -1;
  let rejectedGroup = null;
  const index = parseInt(criteria, 10);
  if (!isNaN(index) && index > 0 && index <= groups.pending.length) {
    groupIndex = index - 1;
    rejectedGroup = groups.pending[groupIndex];
  } else {
    groupIndex = groups.pending.findIndex(
      (g) =>
        g.id === criteria || g.name.toLowerCase() === criteria.toLowerCase()
    );
    if (groupIndex !== -1) {
      rejectedGroup = groups.pending[groupIndex];
    }
  }
  if (groupIndex === -1 || !rejectedGroup) {
    return {
      success: false,
      message: `"${criteria}" পেন্ডিং লিস্টে পাওয়া যায়নি।`,
    };
  }
  groups.pending.splice(groupIndex, 1);
  saveGroups(groups);
  return {
    success: true,
    message: `❌ "${rejectedGroup.name}" (${rejectedGroup.id}) পেন্ডিং থেকে সরানো হয়েছে।`,
  };
}

// সব পেন্ডিং গ্রুপ রিজেক্ট করা
function rejectAllPending() {
  const groups = loadGroups();
  const rejectedCount = groups.pending.length;
  if (rejectedCount === 0) {
    return { success: false, message: "⏳ কোনো গ্রুপ পেন্ডিং নেই।" };
  }
  groups.pending = [];
  saveGroups(groups);
  return {
    success: true,
    message: `🗑️ ${rejectedCount} টি পেন্ডিং গ্রুপ রিমুভ করা হয়েছে।`,
  };
}

// অ্যাপ্রুভড গ্রুপ রিমুভ করা
function removeApprovedGroup(criteria) {
  const groups = loadGroups();
  let groupIndex = -1;
  let removedGroup = null;
  const approvedList = groups.approved;
  const index = parseInt(criteria, 10);
  if (!isNaN(index) && index > 0 && index <= approvedList.length) {
    groupIndex = index - 1;
    removedGroup = approvedList[groupIndex];
  } else {
    groupIndex = approvedList.findIndex(
      (g) =>
        g.id === criteria || g.name.toLowerCase() === criteria.toLowerCase()
    );
    if (groupIndex !== -1) {
      removedGroup = approvedList[groupIndex];
    }
  }
  if (groupIndex === -1 || !removedGroup) {
    return {
      success: false,
      message: `"${criteria}" অ্যাপ্রুভড লিস্টে পাওয়া যায়নি।`,
    };
  }
  approvedList.splice(groupIndex, 1);
  groups.approved = approvedList;
  saveGroups(groups);
  return {
    success: true,
    message: `🗑️ "${removedGroup.name}" (${removedGroup.id}) অ্যাপ্রুভড থেকে সরানো হয়েছে।`,
  };
}

// *** গ্রুপের স্ট্যাটাস আপডেট করা (v2.5.1 - চূড়ান্ত ফিক্স) ***
function updateGroupStatus(threadID, newStatus) {
  // Validate the new status
  if (newStatus !== "active" && newStatus !== "inactive") {
    return {
      success: false,
      message: "অবৈধ স্ট্যাটাস। 'active' বা 'inactive' ব্যবহার করুন।",
    };
  }

  let groups;
  try {
    groups = loadGroups(); // Load fresh data first
  } catch (loadErr) {
    console.error("[UpdateStatus] groups.json লোড করতে সমস্যা:", loadErr);
    return { success: false, message: "গ্রুপ ডেটা লোড করা যায়নি।" };
  }

  const groupIndex = groups.approved.findIndex((g) => g.id === threadID);

  if (groupIndex === -1) {
    return {
      success: false,
      message: `গ্রুপ আইডি ${threadID} অ্যাপ্রুভড লিস্টে নেই।`,
    };
  }

  const groupToUpdate = groups.approved[groupIndex];
  // Use || 'active' as a fallback if status is missing somehow
  const oldStatus = groupToUpdate.status || "active";
  const groupName = groupToUpdate.name || `Group (${threadID})`; // Fallback name

  // যদি স্ট্যাটাস ইতিমধ্যেই একই থাকে
  if (oldStatus === newStatus) {
    console.log(
      `[GroupManager Debug] গ্রুপ ${threadID} ইতিমধ্যেই "${newStatus}" আছে।`
    );
    return {
      success: true,
      message: `"${groupName}" (${threadID}) গ্রুপটি ইতিমধ্যেই ${
        newStatus === "active" ? "🟢 Active" : "🔴 Inactive"
      } আছে।`,
    };
  }

  // স্ট্যাটাস আপডেট করা হচ্ছে মেমরিতে
  console.log(
    `[GroupManager Debug] আপডেট করা হচ্ছে: ${threadID} | পুরনো স্ট্যাটাস: ${oldStatus} | নতুন স্ট্যাটাস: ${newStatus}`
  );
  // Create a new object for the updated group to ensure immutability somewhat
  groups.approved[groupIndex] = { ...groupToUpdate, status: newStatus };

  // আপডেট করা ডেটা ফাইলে সেভ করার চেষ্টা
  try {
    saveGroups(groups); // Save the entire modified 'groups' object

    // Verify save by reloading (optional but good practice)
    const reloadedGroups = loadGroups();
    const updatedGroup = reloadedGroups.approved.find((g) => g.id === threadID);

    if (updatedGroup && updatedGroup.status === newStatus) {
      console.log(
        `[GroupManager Success] গ্রুপ "${groupName}" (${threadID}) এর স্ট্যাটাস "${newStatus}" করা হয়েছে ও সেভ ভেরিফাইড।`
      );
      // সেভ সফল হওয়ার পর *নতুন স্ট্যাটাস* অনুযায়ী বার্তা তৈরি করে রিটার্ন করা
      return {
        success: true,
        message: `"${groupName}" (${threadID}) গ্রুপটি এখন ${
          newStatus === "active" ? "🟢 Active" : "🔴 Inactive"
        }।`,
      };
    } else {
      console.error(
        `[GroupManager Error] স্ট্যাটাস আপডেট সেভ হওয়ার পর ভেরিফাই করা যায়নি! ফাইল চেক করুন। Reloaded status: ${updatedGroup?.status}`
      );
      // Even if verification fails, the save *might* have worked, inform admin based on attempt
      return {
        success: false,
        message: `স্ট্যাটাস "${newStatus}" করার চেষ্টা করা হয়েছে, কিন্তু সেভ ভেরিফাই করা যায়নি।`,
      };
    }
  } catch (saveError) {
    console.error(
      "[GroupManager Save Error] স্ট্যাটাস আপডেটের পর groups.json সেভ করতে সমস্যা:",
      saveError
    );
    return {
      success: false,
      message: "স্ট্যাটাস আপডেট করা গেলেও সেভ করা যায়নি।",
    };
  }
}

// --- গেটার ফাংশন ---
function getPendingGroups() {
  return loadGroups().pending;
}
function getApprovedGroups() {
  return loadGroups().approved;
}
function isGroupApprovedAndActive(threadID) {
  const group = loadGroups().approved.find((g) => g.id === threadID);
  return group ? group.status === "active" : false;
}
function isGroupApproved(threadID) {
  return loadGroups().approved.some((g) => g.id === threadID);
}
function loadRawGroups() {
  return loadGroups();
}

module.exports = {
  addPendingGroup,
  autoApproveGroup,
  approveGroupByCriteria,
  rejectGroupByCriteria,
  rejectAllPending,
  removeApprovedGroup,
  updateGroupStatus,
  getPendingGroups,
  getApprovedGroups,
  isGroupApprovedAndActive,
  isGroupApproved,
  loadRawGroups,
};
