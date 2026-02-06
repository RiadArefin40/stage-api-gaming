import express from "express";
import axios from "axios";
import axiosRetry from 'axios-retry';
import timeout from 'connect-timeout';
import cors from "cors";
import https from "https";
import bodyParser from "body-parser";
import { Server } from "socket.io";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import depositRoutes from "./routes/deposit.routes.js";
import promoRoutes from "./routes/promos.routes.js"
import widthdrawRoutes from "./routes/widthdraw.routes.js"
import paymentGateway from "./routes/paymentGateway.routes.js"
import fs from "fs";
import notificationRoutes from "./routes/notifications.routes.js";
import crypto from "crypto";
import { pool } from "./db.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// app.ts / server.ts
import { initAffiliateCron } from './cron.js';

initAffiliateCron();


// ---------------- CONFIG ----------------
const API_TOKEN = "ceb57a3c-4685-4d32-9379-c2424f";
const AES_KEY = "60fe91cdffa48eeca70403b3656446";

// ---------------- EXPRESS APP ----------------
const app = express();

app.use(
  cors({
    origin: true, // allow all origins
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    credentials: true,
  })
);

app.use(timeout("255s"));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ---------------- SOCKET.IO ----------------
axiosRetry(axios, { retries: 5, retryDelay: axiosRetry.exponentialDelay });

// ---------------- SOCKET.IO ----------------
const server = app.listen(22000, () =>
  console.log("✅ Server running on http://localhost:22000")
);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("🟢 Socket connected:", socket.id);

  socket.on("join_chat", ({ chatId }) => {
    if (!chatId) return;
    socket.join(chatId);
    console.log(`📩 Socket joined room ${chatId}`);
  });

  socket.on("send_message", async ({ chatId, message }) => {
    if (!chatId || !message) return;

    // Save message in DB
    try {
      const client = await pool.connect();
      const { rows } = await client.query(
        `INSERT INTO live_chat_messages (chat_id, sender, message)
         VALUES ($1, 'user', $2)
         RETURNING *`,
        [chatId, message.message]
      );

      // Emit to everyone in the room
      io.to(chatId).emit("receive_message", rows[0]);
      client.release();
    } catch (err) {
      console.error("Failed to save/send message via socket:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 Socket disconnected:", socket.id);
  });
});




app.use(timeout('255s'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/deposit", depositRoutes);
app.use("/promos", promoRoutes);
app.use("/payment-gateways", paymentGateway);
app.use("/notifications", notificationRoutes);
app.use("/withdrawals", widthdrawRoutes);
// app.use("/games", gameRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));



app.post("/result", async (req, res) => {
  const { mobile } = req.body;
  console.log("🎮 Start Result Callback received:", req.body);

  const bet_amount = parseFloat(req.body.bet_amount) || 0;
  const wallet_after = parseFloat(req.body.wallet_after) || 0;
  const wallet_before = parseFloat(req.body.wallet_before) || 0;

  if (!mobile) return res.status(400).json({ error: "Missing mobile" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Fetch user with row lock
    const userResult = await client.query(
      "SELECT id, wallet, turnover FROM users WHERE name ILIKE $1 FOR UPDATE",
      [mobile]
    );

    if (!userResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = userResult.rows[0];
    console.log("User found:", user);

    // Update wallet immediately
    await client.query("UPDATE users SET wallet=$1 WHERE id=$2", [wallet_after, user.id]);

    // Fetch active turnover records
    const turnoverResult = await client.query(
      `SELECT * FROM user_turnover_history 
       WHERE user_id=$1 AND complete=false 
       ORDER BY created_at DESC`,
      [user.id]
    );

    const record = turnoverResult.rows.find(r => parseFloat(r.active_turnover_amount) > 0);

    if (record) {
      let newActiveAmount = Math.max(0, parseFloat(record.active_turnover_amount) - bet_amount);

      // Wallet check
      if (wallet_before < 20) newActiveAmount = 0;

      const originalAmount = parseFloat(record.active_turnover_amount);
      const remainingPercentage = (newActiveAmount / originalAmount) * 100;

      // Fetch turnover_delay from system_settings
      const settingRes = await client.query(
        "SELECT value FROM system_settings WHERE key='turnover_delay'"
      );

      const turnoverDelayMinutes = settingRes.rows.length
        ? parseInt(settingRes.rows[0].value, 10)
        : 0; // default 0 if not set
      console.log('turnoverDelayMinutes',turnoverDelayMinutes,remainingPercentage,newActiveAmount)
 // If remaining turnover is <= 5% of original
if (newActiveAmount <= 42 && newActiveAmount > 0 && turnoverDelayMinutes > 0) {
    console.log('hit delay')
  await scheduleTurnoverDelay(record.id, turnoverDelayMinutes);
} else {
  // Immediate update
  await client.query(
    `UPDATE user_turnover_history 
     SET active_turnover_amount = $1, complete = $2 
     WHERE id = $3`,
    [newActiveAmount, newActiveAmount === 0, record.id]
  );

  console.log(
    `Updated turnover record ${record.id}: active_turnover_amount=${newActiveAmount}, complete=${newActiveAmount === 0}`
  );
}

    }

    await client.query("COMMIT");



    const sessionRes = await pool.query(
  `SELECT game_type
   FROM active_game_sessions
   WHERE user_id=$1
   ORDER BY started_at DESC
   LIMIT 1`,
  [user.id]
);

if (!sessionRes.rows.length) {
  return res.status(400).json({ error: "No game session found" });
}

const betType = sessionRes.rows[0].game_type;
await pool.query(
  `INSERT INTO user_bets (user_id, bet_type, amount)
   VALUES ($1,$2,$3)
   ON CONFLICT (user_id, bet_type)
   DO UPDATE SET
     amount = user_bets.amount + EXCLUDED.amount,
     updated_at = NOW()`,
  [user.id, betType, bet_amount]
);


    // Respond immediately
    res.status(200).json({ success: true, wallet: wallet_after });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error processing callback:", err);
    res.status(500).json({ success: false });
  } finally {
    client.release();
  }
});






function createKey(keyString) {
  const keyBuffer = Buffer.from(keyString, 'utf8');
  const paddedKey = Buffer.alloc(32, 0);
  const bytesToCopy = Math.min(keyBuffer.length, 32);
  keyBuffer.copy(paddedKey, 0, 0, bytesToCopy);
  return paddedKey;
}

export function encrypt(payload) {
  try {
    // Match PHP's JSON_UNESCAPED_SLASHES behavior
    let text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    // Remove escaped forward slashes to match PHP
    text = text.replace(/\\\//g, '/');
    
    const key = createKey(AES_KEY);
    
    // AES-256-ECB - matches PHP: openssl_encrypt($plaintext, 'aes-256-ecb', $aesKey, OPENSSL_RAW_DATA, '')
    const cipher = crypto.createCipheriv('aes-256-ecb', key, null);
    
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    return encrypted;
  } catch (error) {
    console.error("Encryption error:", error);
    throw error;
  }
}

export function decrypt(encryptedBase64) {
  try {
    const key = createKey(AES_KEY);
    const decipher = crypto.createDecipheriv('aes-256-ecb', key, null);
    let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    throw error;
  }
}

// app.post("/launch_game", async (req, res) => {
//    const client = await pool.connect();
//   const { userName, game_uid, credit_amount, game_type} = req.body;
//   const SERVER_URL = "https://bulkapi.in"; 
//    console.log('1.Start Process for encryption -decryption',userName )
//   if (!userName || !game_uid || !credit_amount) {
//     return res.status(400).json({ 
//       success: false, 
//       message: "Missing required fields: userName, game_uid, credit_amount" 
//     });
//   }



//     // Fetch the user from database
//     const userResult = await pool.query(
//       "SELECT id, wallet FROM users WHERE name=$1",
//       [userName]
//     );

    

//     if (!userResult.rows.length) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found"
//       });
//     }

//     const user = userResult.rows[0];
// console.log('2.Start Process for encryption -genarating user from db',userResult )
//    if(game_type){

//         await client.query(
//       `INSERT INTO active_game_sessions (user_id, game_type)
//        VALUES ($1, $2)`,
//       [user.id, game_type]
//     );

//     await client.query("COMMIT");

//    }
//       // Insert or update active session


//     const wallet_amount = parseFloat(user.wallet); // Use wallet as credit amount

//     if (wallet_amount <= 0) {
//       return res.status(400).json({
//         success: false,
//         message: "User wallet balance is insufficient"
//       });
//     }


//   // Match PHP: round(microtime(true) * 1000) - milliseconds
//   const timestamp = Math.round(Date.now());

//   // Create payload exactly like PHP code
//   const requestData = {
//     user_id: userName,
//     wallet_amount: parseFloat(wallet_amount),
//     game_uid: game_uid,
//     token: API_TOKEN,
//     timestamp: timestamp
//   };

//   // Match PHP: json_encode($requestData, JSON_UNESCAPED_SLASHES)
//   const message = JSON.stringify(requestData);
//   console.log('3. Encryption Done ',message )
  
//   const encryptedPayload = encrypt(message);

//   // Self-test: verify we can decrypt our own encryption
//   // try {
//   //   const decrypted = decrypt(encryptedPayload);
//   //   console.log("4.✅ Self-decryption test - Decrypted:");
//   //   const parsed = JSON.parse(decrypted);
//   //   // console.log("✅ Self-decryption test - Parsed:", JSON.stringify(parsed, null, 2));
    
//   //   // Verify it matches original
//   //   if (decrypted === message) {
//   //     console.log("✅ Encryption/Decryption cycle verified!");
//   //   } else {
//   //     console.log("⚠️  WARNING: Decrypted text doesn't match original!");
//   //     console.log("Decrypted:", decrypted);
//   //   }
//   // } catch (e) {
//   //   console.error("❌ Self-decryption test FAILED:", e.message);
//   // }

//   // Build URL with parameters (exactly like PHP)
//   const gameUrl = `${SERVER_URL}/launch_game?` + 
//     `user_id=${encodeURIComponent(userName)}` +
//     `&wallet_amount=${encodeURIComponent(credit_amount)}` +
//     `&game_uid=${encodeURIComponent(game_uid)}` +
//     `&token=${encodeURIComponent(API_TOKEN)}` +
//     `&timestamp=${encodeURIComponent(timestamp)}` +
//     `&payload=${encodeURIComponent(encryptedPayload)}`;


//   try {
//     // Call the casino API
//  const response = await axios.get(gameUrl, { timeout: 10000 });



//     // Return the casino API response to frontend
//     res.json({
//       success: true,
//       data: response.data,
//       gameUrl: gameUrl
//     });
//       console.log("🌐 Generated completed");
//   } catch (error) {
//     console.error("❌ API Error:", error.response?.data || error.message);
//     res.status(error.response?.status || 500).json({
//       success: false,
//       message: "Failed to launch game",
//       error: error.response?.data || error.message
//     });
//   }
// });

app.post("/launch_game", async (req, res) => {
  const { userName, game_uid, credit_amount, game_type } = req.body;
  const SERVER_URL = "https://bulkapi.in";

  console.log("🚀 Launch game request received:", {
    userName,
    game_uid,
    credit_amount
  });

  if (!userName || !game_uid || !credit_amount) {
    console.warn("⚠️ Missing required fields");
    return res.status(400).json({
      success: false,
      message: "Missing required fields"
    });
  }

  const client = await pool.connect();

  try {
    console.log("🔗 DB connected");
    await client.query("BEGIN");

    // 🔍 Fetch user
    const userResult = await client.query(
      "SELECT id, wallet FROM users WHERE name = $1",
      [userName]
    );

    if (!userResult.rows.length) {
      console.warn(`❌ User not found: ${userName}`);
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const user = userResult.rows[0];
    const walletAmount = Number(user.wallet);

    // if (isNaN(walletAmount) || walletAmount <= 0) {
    //   console.warn(`❌ Insufficient wallet: ${walletAmount}`);
    //   await client.query("ROLLBACK");

    //   return res.status(400).json({
    //     success: false,
    //     message: "Insufficient wallet balance"
    //   });
    // }

    // ✅ Insert game session
    if (game_type) {
      await client.query(
        `INSERT INTO active_game_sessions (user_id, game_type)
         VALUES ($1, $2)`,
        [user.id, game_type]
      );
      console.log("🎮 Game session created:", game_type);
    }

    await client.query("COMMIT");
    console.log("✅ DB transaction committed");

    // ---------- ENCRYPTION ----------
    const timestamp = Date.now();

    const payload = {
      user_id: userName,
      wallet_amount: walletAmount,
      game_uid,
      token: API_TOKEN,
      timestamp
    };

    const encryptedPayload = encrypt(JSON.stringify(payload));

    const gameUrl =
      `${SERVER_URL}/launch_game?` +
      `user_id=${encodeURIComponent(userName)}` +
      `&wallet_amount=${encodeURIComponent(credit_amount)}` +
      `&game_uid=${encodeURIComponent(game_uid)}` +
      `&token=${encodeURIComponent(API_TOKEN)}` +
      `&timestamp=${timestamp}` +
      `&payload=${encodeURIComponent(encryptedPayload)}`;

    console.log("🔗 Game URL generated successfully");

    // ⏱️ API Call
    const response = await axios.get(gameUrl, {
      timeout: 8000,
      validateStatus: status => status < 500
    });

    console.log("✅ Game launch successful");

    return res.json({
      success: true,
      data: response.data,
      gameUrl
    });

  } catch (error) {
    await client.query("ROLLBACK");

    console.error("❌ Launch Game Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });

  } finally {
    client.release();
    console.log("🔌 DB connection released");
  }
});
const scheduleTurnoverDelay = async (turnoverId, delayMinutes) => {
  const scheduledAt = new Date(Date.now() + delayMinutes * 10 * 1000);

  // Insert into delay queue
  await pool.query(
    `INSERT INTO user_turnover_delay_queue (turnover_id, scheduled_at)
     VALUES ($1, $2)
     ON CONFLICT (turnover_id) DO NOTHING`,
    [turnoverId, scheduledAt]
  );

  console.log(`⏳ Turnover ${turnoverId} scheduled for delayed completion at ${scheduledAt}`);

  // Schedule JS timeout
  setTimeout(async () => {
    try {
      await pool.query(
        `UPDATE user_turnover_history
         SET active_turnover_amount = 0, complete = true
         WHERE id = $1`,
        [turnoverId]
      );
      await pool.query(
        `DELETE FROM user_turnover_delay_queue WHERE turnover_id = $1`,
        [turnoverId]
      );
      console.log(`✅ Delayed turnover applied for record ${turnoverId}`);
    } catch (err) {
      console.error(`❌ Failed delayed turnover for record ${turnoverId}:`, err);
    }
  }, delayMinutes * 60 * 1000);
};

const reschedulePendingDelays = async () => {
  const now = new Date();
  const { rows } = await pool.query(
    `SELECT turnover_id, scheduled_at FROM user_turnover_delay_queue WHERE scheduled_at > $1`,
    [now]
  );

  rows.forEach(row => {
    const delayMs = new Date(row.scheduled_at) - now;
    if (delayMs > 0) {
      setTimeout(async () => {
        try {
          await pool.query(
            `UPDATE user_turnover_history SET active_turnover_amount=0, complete=true WHERE id=$1`,
            [row.turnover_id]
          );
          await pool.query(
            `DELETE FROM user_turnover_delay_queue WHERE turnover_id=$1`,
            [row.turnover_id]
          );
          console.log(`✅ Delayed turnover applied for record ${row.turnover_id} (rescheduled)`);
        } catch (err) {
          console.error(`❌ Failed delayed turnover for record ${row.turnover_id}:`, err);
        }
      }, delayMs);
    }
  });
};

// Call once on startup
reschedulePendingDelays();

app.get("/test", (_, res) => res.send("Server running"));

export default app;
