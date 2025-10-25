// command-handler.js (v1.3 - Multi-Admin TypeFix)

const fs = require("fs");
const path = require("path");
const commands = new Map(); // Stores all command objects (including aliases)
const commandCooldowns = new Map();
// Stores cooldown timestamps

// === Command Loader Function ===
function loadCommands() {
  commands.clear();
  // Clear existing commands before reloading
  const commandFiles = fs
    .readdirSync(path.join(__dirname, "commands"))
    .filter((file) => file.endsWith(".js"));
  for (const file of commandFiles) {
    try {
      // Clear cache for the specific command file to ensure updates are loaded
      delete require.cache[require.resolve(`./commands/${file}`)];
      const command = require(`./commands/${file}`);

      if (command.config && command.run) {
        const commandNameLower = command.config.name.toLowerCase();
        // Store the command by its primary name
        // Avoid overwriting primary name with alias object if names clash and ensure the primary name gets the actual command object
        if (
          !commands.has(commandNameLower) ||
          commands.get(commandNameLower).config.name.toLowerCase() !==
            commandNameLower
        ) {
          commands.set(commandNameLower, command);
        }
        // Store the command by its aliases as well
        if (command.config.aliases && Array.isArray(command.config.aliases)) {
          command.config.aliases.forEach((alias) => {
            const aliasLower = alias.toLowerCase();
            if (!commands.has(aliasLower)) {
              // Do not overwrite if alias clashes with a primary name

              commands.set(aliasLower, command);
            } else {
              // Warn only if the alias conflicts with a DIFFERENT command's primary name
              const existingCommand = commands.get(aliasLower);
              if (
                existingCommand.config.name.toLowerCase() !== commandNameLower
              ) {
                console.warn(
                  `[-] এলিয়াস '${aliasLower}' (${file}) লোড করা যায়নি কারণ এটি '${existingCommand.config.name}' কমান্ডের নামের সাথে মিলে গেছে।`
                );
              }
            }
          });
        }
        console.log(`[+] কমান্ড লোড হয়েছে: ${command.config.name}`);
      } else {
        console.warn(`[-] "${file}" কমান্ড ফাইলে config বা run ফাংশন নেই।`);
      }
    } catch (error) {
      console.error(`[-] "${file}" কমান্ডটি লোড করা যায়নি:`, error);
    }
  }
  // Count unique primary command names for a more accurate count
  const uniqueCommands = new Set();
  commands.forEach((cmd) => {
    // Add only if the key matches the command's primary name
    // This check ensures we count primary commands correctly even if an alias overwrote the map entry
    const primaryKey = cmd.config.name.toLowerCase();
    if (commands.get(primaryKey) === cmd) {
      // Check if the command object for the primary key is this one
      uniqueCommands.add(cmd.config.name);
    }
  });
  console.log(
    `✅ মোট ${uniqueCommands.size} টি মূল কমান্ড (${commands.size} টি ভ্যারিয়েন্ট এলিয়াস সহ) সফলভাবে লোড হয়েছে।`
  );
}

// === Command Handler Function ===
async function handleCommand({ api, message, config }) {
  const regularPrefix = config.BOT_PREFIX;
  const adminPrefix = config.SECRET_ADMIN_PREFIX;
  const senderID = message.senderID;

  // <--- সমাধান: senderID কে String() দিয়ে কনভার্ট করা হয়েছে ---
  const isAdmin = config.ADMIN_IDS.includes(String(senderID));

  let prefixUsed = null;
  let commandBody = null;
  let usedAlias = null; // Store the exact alias/name used

  // --- Determine prefix and command body ---
  if (message.body && message.body.startsWith(adminPrefix) && isAdmin) {
    prefixUsed = adminPrefix;
    commandBody = message.body.slice(adminPrefix.length).trim();
  } else if (message.body && message.body.startsWith(regularPrefix)) {
    prefixUsed = regularPrefix;
    commandBody = message.body.slice(regularPrefix.length).trim();
  } else {
    return false; // Not a command
  }

  if (!commandBody) return false;
  // Ignore empty commands (e.g., just "/" or "@")

  const args = commandBody.split(/ +/);
  usedAlias = args.shift().toLowerCase();
  // <-- Get the command name/alias used
  const command = commands.get(usedAlias);
  // Find the command object using the name/alias

  // --- Command Not Found ---
  if (!command) {
    if (prefixUsed === adminPrefix) {
      console.log(`[Command Handler] Unrecognized admin command: ${usedAlias}`);
      // Silently ignore unrecognized admin commands
      return true;
    }
    return false;
    // Ignore unrecognized regular commands silently
  }

  const primaryCommandName = command.config.name.toLowerCase();
  // Get the main name

  // --- Special prefix check for admin commands ---
  // List all commands that MUST use the admin prefix
  const adminOnlyCommands = [
    "group",
    "on",
    "off",
    "album",
    "guide",
    "teach",
    "unsend",
  ];
  // Add any other admin commands here
  if (
    adminOnlyCommands.includes(primaryCommandName) &&
    prefixUsed !== adminPrefix
  ) {
    console.log(
      `[Permission Denied] Command '${primaryCommandName}' requires admin prefix.`
    );
    // Silently ignore if an admin command is used with the regular prefix
    return true;
    // Consider it handled by ignoring
  }

  // --- General Permission Check (for commands allowed with regular prefix but might have perm level 1) ---
  // This handles cases where a command might be usable by admins with '/' but not users
  if (
    prefixUsed === regularPrefix &&
    command.config.permission === 1 &&
    !isAdmin
  ) {
    console.log(
      `[Permission Denied] User ${senderID} tried admin-level command '${primaryCommandName}' via regular prefix.`
    );
    return true; // Silently ignore
  }

  // --- Cooldown Check ---
  const commandKeyForCooldown = primaryCommandName;
  // Use primary name for cooldown tracking
  if (!commandCooldowns.has(commandKeyForCooldown)) {
    commandCooldowns.set(commandKeyForCooldown, new Map());
  }
  const now = Date.now();
  const timestamps = commandCooldowns.get(commandKeyForCooldown);
  const cooldownAmount = (command.config.cooldown || 3) * 1000;
  if (timestamps.has(senderID)) {
    const expirationTime = timestamps.get(senderID) + cooldownAmount;
    if (now < expirationTime) {
      console.log(
        `[Cooldown] User ${senderID} triggered cooldown for '${commandKeyForCooldown}'.`
      );
      return true; // Silently ignore cooldown
    }
  }
  // Set cooldown timestamp only *before* executing the command
  timestamps.set(senderID, now);
  setTimeout(() => timestamps.delete(senderID), cooldownAmount);

  // --- Execute Command ---
  try {
    console.log(
      `[Command Exec] Running '${primaryCommandName}' (triggered by '${usedAlias}') for user ${senderID} in thread ${message.threadID}`
    );
    // *** সংশোধিত: commandName হিসেবে ব্যবহৃত এলিয়াসটি সঠিকভাবে পাস করা হচ্ছে ***
    await command.run({
      api,
      message,
      args,
      config, // Pass the full config object loaded in index.js
      commandName: usedAlias, // Pass the actual alias/name used ('on', 'off', 'ping', etc.)
    });
  } catch (error) {
    console.error(
      `🔴 "${primaryCommandName}" কমান্ড রান করার সময় এরর (Triggered by '${usedAlias}'):`,
      error
    );
    // Send error details ONLY to admins
    const errorDetails = `🚨 কমান্ড এরর 🚨\n\nকমান্ড: ${primaryCommandName} (as ${usedAlias})\nগ্রুপ/ইনবক্স: ${
      message.threadID
    }\nব্যবহারকারী: ${senderID}\n\nসমস্যা:\n${error.stack || error}`;

    // Ensure config.ADMIN_IDS is available and is an array
    const adminIds = Array.isArray(config?.ADMIN_IDS) ? config.ADMIN_IDS : [];
    adminIds.forEach((adminId) => {
      if (!(message.isGroup === false && senderID === adminId)) {
        // Don't send error to self if admin caused it in inbox
        api.sendMessage(errorDetails, adminId, (sendErr) => {
          // Log silently if sending notification fails
          if (sendErr) {
            console.error(
              `[Cmd Error Notify] অ্যাডমিন ${adminId}-কে জানাতে সমস্যা: ${
                sendErr.errorDescription || sendErr
              }`
            );
          }
        });
      }
    });
    // Do NOT send error message back to the user/group
  }

  return true;
  // Command was handled (successfully or with error)
}

module.exports = {
  loadCommands,
  handleCommand,
  commands,
};
