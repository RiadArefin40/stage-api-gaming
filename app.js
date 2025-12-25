import express from "express";
import axios from "axios";
import cors from "cors";
import bodyParser from "body-parser";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import depositRoutes from "./routes/deposit.routes.js";
import promoRoutes from "./routes/promos.routes.js"
import widthdrawRoutes from "./routes/widthdraw.routes.js"
import crypto from "crypto";
import { pool } from "./db.js";
// import gameRoutes from "./routes/game.routes.js"
const API_TOKEN = "ceb57a3c-4685-4d32-9379-c2424f";  
const AES_KEY = "60fe91cdffa48eeca70403b3656446";    
const app = express();

app.use(express.json());

const allowedOrigins = [
  "https://bajiraj.cloud",
  "https://admin.bajiraj.cloud"
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (like Postman)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    credentials: true,
  })
);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/deposit", depositRoutes);
app.use("/promos", promoRoutes);
app.use("/withdrawals", widthdrawRoutes);
// app.use("/games", gameRoutes);

app.post("/result", (req, res) => {
  console.log("🎮 GAME CALLBACK RECEIVED");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);

  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({
      error: "Empty body — callback not parsed",
    });
  }

  const {
    mobile,
    bet_amount,
    win_amount,
    game_uid,
    game_round,
    token,
    wallet_before,
    wallet_after,
    change,
    currency_code,
    timestamp,
  } = req.body;

  console.table({
    mobile,
    bet_amount,
    win_amount,
    game_uid,
    game_round,
    token,
    wallet_before,
    wallet_after,
    change,
    currency_code,
    timestamp,
  });

  return res.json({
    status: "success",
    message: "Callback received",
  });
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

app.post("/launch_game", async (req, res) => {
  const { userName, game_uid, credit_amount } = req.body;
  const SERVER_URL = "https://bulkapi.in"; 
   console.log('userid',userName )
  if (!userName || !game_uid || !credit_amount) {
    return res.status(400).json({ 
      success: false, 
      message: "Missing required fields: userName, game_uid, credit_amount" 
    });
  }



    // Fetch the user from database
    const userResult = await pool.query(
      "SELECT id, wallet FROM users WHERE name=$1",
      [userName]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const user = userResult.rows[0];
    console.log('eser',user )
    const wallet_amount = parseFloat(user.wallet); // Use wallet as credit amount

    if (wallet_amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "User wallet balance is insufficient"
      });
    }


  // Match PHP: round(microtime(true) * 1000) - milliseconds
  const timestamp = Math.round(Date.now());

  // Create payload exactly like PHP code
  const requestData = {
    user_id: userName,
    wallet_amount: parseFloat(wallet_amount),
    game_uid: game_uid,
    token: API_TOKEN,
    timestamp: timestamp
  };

  // Match PHP: json_encode($requestData, JSON_UNESCAPED_SLASHES)
  const message = JSON.stringify(requestData);
  console.log("📝 Plain JSON message:", message);
  console.log("🔑 Key length:", AES_KEY.length, "characters");
  console.log("🔑 Key bytes:", Buffer.from(AES_KEY, 'utf8').length, "bytes");
  
  const encryptedPayload = encrypt(message);
  console.log("🔐 Encrypted payload:", encryptedPayload);

  // Self-test: verify we can decrypt our own encryption
  try {
    const decrypted = decrypt(encryptedPayload);
    console.log("✅ Self-decryption test - Decrypted:", decrypted);
    const parsed = JSON.parse(decrypted);
    console.log("✅ Self-decryption test - Parsed:", JSON.stringify(parsed, null, 2));
    
    // Verify it matches original
    if (decrypted === message) {
      console.log("✅ Encryption/Decryption cycle verified!");
    } else {
      console.log("⚠️  WARNING: Decrypted text doesn't match original!");
      console.log("Original:", message);
      console.log("Decrypted:", decrypted);
    }
  } catch (e) {
    console.error("❌ Self-decryption test FAILED:", e.message);
  }

  // Build URL with parameters (exactly like PHP)
  const gameUrl = `${SERVER_URL}/launch_game?` + 
    `user_id=${encodeURIComponent(userName)}` +
    `&wallet_amount=${encodeURIComponent(credit_amount)}` +
    `&game_uid=${encodeURIComponent(game_uid)}` +
    `&token=${encodeURIComponent(API_TOKEN)}` +
    `&timestamp=${encodeURIComponent(timestamp)}` +
    `&payload=${encodeURIComponent(encryptedPayload)}`;

  console.log("🌐 Generated game URL:", gameUrl);

  try {
    // Call the casino API
    const response = await axios.get(gameUrl);

    // Return the casino API response to frontend
    res.json({
      success: true,
      data: response.data,
      gameUrl: gameUrl
    });
  } catch (error) {
    console.error("❌ API Error:", error.response?.data || error.message);
    console.error("Status:", error.response?.status);
    res.status(error.response?.status || 500).json({
      success: false,
      message: "Failed to launch game",
      error: error.response?.data || error.message
    });
  }
});


app.get("/test", (_, res) => res.send("Server running"));

export default app;
