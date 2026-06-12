# Local Environment Startup Guide

To run the Shizuka Bot alongside the FreeLLMAPI Proxy Server, you will need to open **two separate terminal windows**. Follow the steps below:

## Terminal 1: Start the Proxy Server
This terminal runs the local AI proxy engine. **Do not close this terminal** while the bot is running.

```bash
cd freellmapi
npm run dev
```

## Terminal 2: Start the Main Bot
Once the proxy server is running successfully in Terminal 1, open a new terminal window to start the Facebook bot.

```bash
node index.js
```

---
*Note: Ensure both terminals remain open and running for the system to function correctly. If you close Terminal 1, the bot will not be able to generate AI responses.*
