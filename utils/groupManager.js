// utils/groupManager.js (v2.7 - Added handleNewGroupInteraction & isGroupPending)

const fs = require("fs-extra");
const path = require("path");
const groupsFilePath = path.join(__dirname, "..", "groups.json");

// --- ডেটা লোড এবং সেভ ---
function loadGroups() {
  try {
    if (!fs.existsSync(groupsFilePath)) {
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
    data.approved = Array.isArray(data.approved)
      ? data.approved.map((group) => ({
          ...group,
          status: group.status || "active",
        }))
      : [];
    data.pending = Array.isArray(data.pending) ? data.pending : [];
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
    if (
      !data ||
      !Array.isArray(data.pending) ||
      !Array.isArray(data.approved)
    ) {
      console.error(
        "[GroupManager Save Error] সেভ করার জন্য ডেটার গঠন সঠিক নয়!"
      );
      data = {
        pending: Array.isArray(data?.pending) ? data.pending : [],
        approved: Array.isArray(data?.approved)
          ? data.approved.map((g) => ({ ...g, status: g.status || "active" }))
          : [],
      };
      console.warn("[GroupManager Save] ডেটার গঠন ঠিক করা হয়েছে।");
    } else {
      data.approved = data.approved.map((group) => ({
        ...group,
        status: group.status || "active",
      }));
    }
    fs.writeJsonSync(groupsFilePath, data, { spaces: 2 });
    // console.log("[GroupManager Save] groups.json ফাইল সফলভাবে সেভ হয়েছে।"); // লগ কমানো হলো
  } catch (error) {
    console.error(
      "[GroupManager Save Error] groups.json সেভ করতে সমস্যা:",
      error
    );
  }
}

// --- গ্রুপ ম্যানেজমেন্ট ফাংশন ---

// নতুন গ্রুপ পেন্ডিং লিস্টে যোগ করা (log:subscribe থেকে ব্যবহৃত)
async function addPendingGroup(api, threadID, adderUserID) {
  let groups;
  try {
    groups = loadGroups();
  } catch (loadErr) {
    console.error("[AddPending] groups.json লোড করতে সমস্যা:", loadErr);
    return false;
  }
  const isPending = groups.pending.some((g) => g.id === threadID);
  const isApproved = groups.approved.some((g) => g.id === threadID);
  if (isPending || isApproved) {
    console.log(
      `[GroupManager] গ্রুপ ${threadID} আগে থেকেই লিস্টে আছে (addPendingGroup)।`
    );
    return false;
  }

  let groupName = `Unknown Group (${threadID})`;
  let adderName = `Unknown Adder (${adderUserID || "N/A"})`;
  try {
    const threadInfo = await api.getThreadInfo(threadID);
    if (threadInfo?.name) {
      groupName = threadInfo.name;
    }
  } catch (err) {
    console.error(
      `[GroupManager] গ্রুপ ${threadID} নাম আনতে সমস্যা (addPendingGroup):`,
      err.errorDescription || err
    );
  }
  try {
    if (adderUserID) {
      const adderInfo = await api.getUserInfo([adderUserID]);
      if (adderInfo?.[adderUserID]?.name) {
        adderName = adderInfo[adderUserID].name;
      }
    }
  } catch (err) {
    console.error(
      `[GroupManager] ইউজার ${adderUserID} নাম আনতে সমস্যা (addPendingGroup):`,
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
      `[GroupManager] নতুন গ্রুপ পেন্ডিং (log:subscribe): ${groupName} (ID: ${threadID})`
    );
    return true;
  } catch (saveError) {
    console.error(
      "[GroupManager] Pending গ্রুপ সেভে সমস্যা (addPendingGroup):",
      saveError
    );
    return false;
  }
}

// <<< নতুন ফাংশন: প্রথম মেসেজ থেকে গ্রুপ হ্যান্ডেল করা >>>
async function handleNewGroupInteraction(api, threadID, config) {
  let groups;
  try {
    groups = loadGroups();
  } catch (loadErr) {
    console.error("[handleNewGroup] groups.json লোড করতে সমস্যা:", loadErr);
    return false; // Indicate failure
  }

  const isPending = groups.pending.some((g) => g.id === threadID);
  const isApproved = groups.approved.some((g) => g.id === threadID);

  // যদি কোনোভাবে আগে থেকেই লিস্টে থাকে, তাহলে কিছু করার দরকার নেই
  if (isPending || isApproved) {
    console.log(
      `[handleNewGroup] গ্রুপ ${threadID} আগে থেকেই লিস্টে আছে, ইগনোর করা হচ্ছে।`
    );
    return false; // Indicate already handled or listed
  }

  // গ্রুপের নাম আনার চেষ্টা
  let groupName = `Unknown Group (${threadID})`;
  try {
    const threadInfo = await api.getThreadInfo(threadID);
    if (threadInfo?.name) {
      // Use threadInfo.name directly if available
      groupName = threadInfo.name;
    }
    console.log(`[handleNewGroup] গ্রুপ নাম পাওয়া গেছে: ${groupName}`);
  } catch (err) {
    console.error(
      `[handleNewGroup] গ্রুপ ${threadID} নাম আনতে সমস্যা:`,
      err.errorDescription || err
    );
  }

  // নতুন পেন্ডিং এন্ট্রি তৈরি (অ্যাডার অজানা)
  const newEntry = {
    id: threadID,
    name: groupName,
    requested_by_id: "Unknown (Detected)", // যেহেতু কে অ্যাড করেছে জানা নেই
    requested_by_name: "First Message",
  };

  groups.pending.push(newEntry);

  try {
    saveGroups(groups);
    console.log(
      `[handleNewGroup] নতুন গ্রুপ পেন্ডিং লিস্টে যোগ করা হয়েছে: ${groupName} (ID: ${threadID})`
    );

    // অ্যাডমিনদের নোটিফিকেশন পাঠানো
    const notifyMsg = `🔔 নতুন গ্রুপ সনাক্ত (পেন্ডিং) 🔔\n\nগ্রুপ: ${groupName}\nID: ${threadID}\n(গ্রুপ থেকে প্রথম মেসেজ পাওয়ায় যুক্ত করা হয়েছে)\n\nদয়া করে "@group list" বা "@group approveid ${threadID}" ব্যবহার করে অ্যাপ্রুভ করুন।`;

    if (Array.isArray(config?.ADMIN_IDS)) {
      config.ADMIN_IDS.forEach((adminId) => {
        api.sendMessage(notifyMsg, adminId, (err) => {
          if (err)
            console.error(
              `[Group Notify Error - handleNewGroup] অ্যাডমিন ${adminId}-কে জানাতে সমস্যা:`,
              err
            );
        });
      });
    }
    return true; // Indicate success
  } catch (saveError) {
    console.error("[handleNewGroup] পেন্ডিং গ্রুপ সেভে সমস্যা:", saveError);
    return false; // Indicate failure
  }
}
// <<< নতুন ফাংশন শেষ >>>

// অ্যাডমিন অ্যাড করলে অটো অ্যাপ্রুভ (log:subscribe থেকে ব্যবহৃত)
async function autoApproveGroup(api, threadID, adminUserID) {
  let groups;
  try {
    groups = loadGroups();
  } catch {
    return false;
  }
  const isApproved = groups.approved.some((g) => g.id === threadID);
  if (isApproved) {
    console.log(
      `[GroupManager] গ্রুপ ${threadID} আগে থেকেই অ্যাপ্রুভড (autoApprove)।`
    );
    groups.pending = groups.pending.filter((g) => g.id !== threadID);
    saveGroups(groups);
    return false;
  }

  let groupName = `Unknown Group (${threadID})`;
  let adminName = `Admin (${adminUserID})`;
  try {
    const threadInfo = await api.getThreadInfo(threadID);
    if (threadInfo?.name) {
      groupName = threadInfo.name;
    }
  } catch (err) {}
  try {
    const adderInfo = await api.getUserInfo([adminUserID]);
    if (adderInfo?.[adminUserID]?.name) {
      adminName = adderInfo[adminUserID].name;
    }
  } catch (err) {}

  const newEntry = {
    id: threadID,
    name: groupName,
    requested_by_id: adminUserID,
    requested_by_name: adminName,
    status: "active",
  };
  groups.pending = groups.pending.filter((g) => g.id !== threadID);
  groups.approved.push(newEntry);
  try {
    saveGroups(groups);
    console.log(
      `[GroupManager] অটো-অ্যাপ্রুভ হয়েছে (log:subscribe): ${groupName} (ID: ${threadID})`
    );
    return true;
  } catch (saveError) {
    console.error("[GroupManager] AutoApprove সেভে সমস্যা:", saveError);
    return false;
  }
}

// আইডি দিয়ে সরাসরি অ্যাপ্রুভ (কমান্ড থেকে ব্যবহৃত)
async function forceApproveGroup(api, threadID) {
  let groups;
  try {
    groups = loadGroups();
  } catch {
    return { success: false, message: "গ্রুপ ডেটা লোড করা যায়নি।" };
  }
  const isApproved = groups.approved.some((g) => g.id === threadID);
  if (isApproved) {
    console.log(
      `[GroupManager] গ্রুপ ${threadID} আগে থেকেই অ্যাপ্রুভড (forceApprove)।`
    );
    groups.pending = groups.pending.filter((g) => g.id !== threadID);
    saveGroups(groups);
    return {
      success: true,
      message: `ℹ️ গ্রুপ ${threadID} আগে থেকেই অ্যাপ্রুভড।`,
    };
  }

  let groupName = `Unknown Group (${threadID})`;
  try {
    const threadInfo = await api.getThreadInfo(threadID);
    if (threadInfo?.name) {
      groupName = threadInfo.name;
    }
  } catch (err) {
    console.error(
      `[GroupManager] গ্রুপ ${threadID} নাম আনতে সমস্যা (forceApprove):`,
      err.errorDescription || err
    );
  }

  const newEntry = {
    id: threadID,
    name: groupName,
    requested_by_id: "Forced (Admin)",
    requested_by_name: "Admin Command",
    status: "active",
  };
  groups.pending = groups.pending.filter((g) => g.id !== threadID);
  groups.approved.push(newEntry);
  try {
    saveGroups(groups);
    console.log(
      `[GroupManager] ফোর্স-অ্যাপ্রুভ হয়েছে: ${groupName} (ID: ${threadID})`
    );
    return {
      success: true,
      message: `✅ গ্রুপ "${groupName}" (ID: ${threadID}) সরাসরি অ্যাপ্রুভ করা হয়েছে।`,
    };
  } catch (saveError) {
    console.error("[GroupManager] ForceApprove সেভে সমস্যা:", saveError);
    return { success: false, message: "গ্রুপ সেভ করতে সমস্যা হয়েছে।" };
  }
}

// পেন্ডিং লিস্ট থেকে অ্যাপ্রুভ করা (কমান্ড থেকে ব্যবহৃত)
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

// পেন্ডিং লিস্ট থেকে রিজেক্ট করা (কমান্ড থেকে ব্যবহৃত)
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

// সব পেন্ডিং গ্রুপ রিজেক্ট করা (কমান্ড থেকে ব্যবহৃত)
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

// অ্যাপ্রুভড গ্রুপ রিমুভ করা (কমান্ড থেকে ব্যবহৃত)
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

// গ্রুপের স্ট্যাটাস আপডেট করা (কমান্ড থেকে ব্যবহৃত)
function updateGroupStatus(threadID, newStatus) {
  if (newStatus !== "active" && newStatus !== "inactive") {
    return {
      success: false,
      message: "অবৈধ স্ট্যাটাস। 'active' বা 'inactive' ব্যবহার করুন।",
    };
  }
  let groups;
  try {
    groups = loadGroups();
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
  const oldStatus = groupToUpdate.status || "active";
  const groupName = groupToUpdate.name || `Group (${threadID})`;
  if (oldStatus === newStatus) {
    return {
      success: true,
      message: `"${groupName}" (${threadID}) গ্রুপটি ইতিমধ্যেই ${
        newStatus === "active" ? "🟢 Active" : "🔴 Inactive"
      } আছে।`,
    };
  }
  groups.approved[groupIndex] = { ...groupToUpdate, status: newStatus };
  try {
    saveGroups(groups);
    const reloadedGroups = loadGroups(); // Verify save
    const updatedGroup = reloadedGroups.approved.find((g) => g.id === threadID);
    if (updatedGroup && updatedGroup.status === newStatus) {
      console.log(
        `[GroupManager Success] গ্রুপ "${groupName}" (${threadID}) এর স্ট্যাটাস "${newStatus}" করা হয়েছে।`
      );
      return {
        success: true,
        message: `"${groupName}" (${threadID}) গ্রুপটি এখন ${
          newStatus === "active" ? "🟢 Active" : "🔴 Inactive"
        }।`,
      };
    } else {
      console.error(
        `[GroupManager Error] স্ট্যাটাস আপডেট সেভ ভেরিফাই করা যায়নি! Reloaded: ${updatedGroup?.status}`
      );
      return {
        success: false,
        message: `স্ট্যাটাস "${newStatus}" করার চেষ্টা করা হয়েছে, কিন্তু সেভ ভেরিফাই করা যায়নি।`,
      };
    }
  } catch (saveError) {
    console.error(
      "[GroupManager Save Error] স্ট্যাটাস আপডেট সেভ করতে সমস্যা:",
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

// <<< নতুন: গ্রুপ পেন্ডিং লিস্টে আছে কিনা চেক করার ফাংশন >>>
function isGroupPending(threadID) {
  try {
    return loadGroups().pending.some((g) => g.id === threadID);
  } catch {
    return false;
  }
}
// <<< নতুন ফাংশন শেষ >>>

module.exports = {
  addPendingGroup, // Used by log:subscribe (if it works)
  autoApproveGroup, // Used by log:subscribe (if it works)
  approveGroupByCriteria, // Used by @group approve command
  rejectGroupByCriteria, // Used by @group reject command
  rejectAllPending, // Used by @group rejectall command
  removeApprovedGroup, // Used by @group remove command
  updateGroupStatus, // Used by @on / @off commands
  getPendingGroups, // Used by @group list command & logSubscribe notify
  getApprovedGroups, // Used by @group approved command
  isGroupApprovedAndActive, // Used by index.js for interaction check
  isGroupApproved, // Used by index.js for command check
  loadRawGroups, // Potentially useful elsewhere
  forceApproveGroup, // Used by @group approveid command
  handleNewGroupInteraction, // <<< নতুন ফাংশা��� এক্সপোর্ট (Used by index.js first message detection)
  isGroupPending, // <<< নতুন ফাংশন এক্সপোর্ট (Used by index.js first message detection)
};
