import express from "express";
import axios from "axios";
import axiosRetry from 'axios-retry';
import timeout from 'connect-timeout';
import cors from "cors";
import bodyParser from "body-parser";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import depositRoutes from "./routes/deposit.routes.js";
import promoRoutes from "./routes/promos.routes.js"
import widthdrawRoutes from "./routes/widthdraw.routes.js"
import paymentGateway from "./routes/paymentGateway.routes.js"
import notificationRoutes from "./routes/notifications.routes.js";
import crypto from "crypto";
import { pool } from "./db.js";
// import gameRoutes from "./routes/game.routes.js"
const API_TOKEN = "ceb57a3c-4685-4d32-9379-c2424f";  
const AES_KEY = "60fe91cdffa48eeca70403b3656446";    
const app = express();
axiosRetry(axios, { retries: 2, retryDelay: axiosRetry.exponentialDelay });

app.use(
  cors({
    origin: true, // allow all origins
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    credentials: true,
  })
);
app.use(timeout('55s'));
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




// app.post("/result", async (req, res) => {
//   // const { mobile, bet_amount, wallet_after, timestamp,wallet_before } = req.body;
// const bet_amount = parseFloat(req.body.bet_amount) || 0;
// const wallet_after = parseFloat(req.body.wallet_after) || 0;
// const wallet_before = parseFloat(req.body.wallet_before) || 0;

//   if (!mobile) return res.status(400).json({ error: "Missing mobile" });

//   const client = await pool.connect();
//   try {
//     await client.query("BEGIN");

//     // Case-insensitive user search
//     const userResult = await client.query(
//       "SELECT id, wallet, turnover FROM users WHERE name ILIKE $1 FOR UPDATE",
//       [mobile]
//     );
//     if (!userResult.rows.length) {
//       await client.query("ROLLBACK");
//       return res.status(404).json({ success: false, message: "User not found" });
//     }
//     const user = userResult.rows[0];
//     console.log('user',user)
//     // Update wallet
//     await client.query(
//       "UPDATE users SET wallet=$1 WHERE id=$2",
//       [wallet_after, user.id]
//     );

//     // Update turnover history asynchronously
//     const turnoverResult = await client.query(
//       `SELECT * FROM user_turnover_history WHERE user_id=$1 AND complete=false ORDER BY created_at DESC`,
//       [user.id]
//     );


// try{
//   const record = turnoverResult.rows.find(
//   r => parseFloat(r.active_turnover_amount) > 0
// );

// if (record) {
//   let newActiveAmount =
//     Math.max(0, parseFloat(record.active_turnover_amount) - bet_amount);

//   if (wallet_before < 20) {
//     newActiveAmount = 0;
//   }

//   await client.query(
//     `UPDATE user_turnover_history 
//      SET active_turnover_amount = $1, complete = $2 
//      WHERE id = $3`,
//     [newActiveAmount, newActiveAmount == 0, record.id]
//   );

//   console.log(
//     `Updated turnover record ${record.id}: active_turnover_amount=${newActiveAmount}, complete=${newActiveAmount === 0}`
//   );
// }

// }
// catch (e){
//  console.log(e)
// }

//     await client.query("COMMIT");
//  console.log('result', wallet_after)
//     res.status(200).json({ success: true, wallet: wallet_after });
//   } catch (err) {
//     await client.query("ROLLBACK");
//     console.error("Error processing callback:", err);
//     res.status(500).json({ success: false });
//   } finally {
//     client.release();
//   }
// });


app.post("/result", async (req, res) => {
  let { mobile, bet_amount, wallet_after, wallet_before } = req.body;

  if (!mobile) return res.status(400).json({ error: "Missing mobile" });

  // Ensure numeric types
  bet_amount = parseFloat(bet_amount) || 0;
  wallet_after = parseFloat(wallet_after) || 0;
  wallet_before = parseFloat(wallet_before) || 0;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock user row
    const userResult = await client.query(
      "SELECT id, wallet, turnover FROM users WHERE name ILIKE $1 FOR UPDATE",
      [mobile]
    );

    if (!userResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = userResult.rows[0];

    // Update wallet immediately
    await client.query(
      "UPDATE users SET wallet=$1 WHERE id=$2",
      [wallet_after, user.id]
    );

    // Update the first active turnover record
    const updateTurnoverQuery = `
      UPDATE user_turnover_history
      SET active_turnover_amount = GREATEST(active_turnover_amount - $1, 0),
          complete = CASE WHEN GREATEST(active_turnover_amount - $1, 0) = 0 OR $2 < 20 THEN true ELSE complete END
      WHERE id = (
        SELECT id FROM user_turnover_history
        WHERE user_id=$3 AND complete=false AND active_turnover_amount > 0
        ORDER BY created_at ASC
        LIMIT 1
      )
      RETURNING id, active_turnover_amount, complete
    `;

    const turnoverUpdateResult = await client.query(
      updateTurnoverQuery,
      [bet_amount, wallet_before, user.id]
    );

    if (turnoverUpdateResult.rows.length) {
      const record = turnoverUpdateResult.rows[0];
      console.log(
        `Updated turnover record ${record.id}: active_turnover_amount=${record.active_turnover_amount}, complete=${record.complete}`
      );
    }

    // Reduce user's total turnover
    const newTurnover = Math.max(0, parseFloat(user.turnover) - bet_amount);
    await client.query(
      "UPDATE users SET turnover=$1 WHERE id=$2",
      [newTurnover, user.id]
    );

    await client.query("COMMIT");

    res.status(200).json({ success: true, wallet: wallet_after });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error processing callback:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
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

app.post("/launch_game", async (req, res) => {
   const client = await pool.connect();
  const { userName, game_uid, credit_amount, game_type} = req.body;
  const SERVER_URL = "https://bulkapi.in"; 
   console.log('1.Start Process for encryption -decryption',userName )
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
console.log('2.Start Process for encryption -genarating user from db',userResult )
   if(game_type){

        await client.query(
      `INSERT INTO active_game_sessions (user_id, game_type)
       VALUES ($1, $2)`,
      [user.id, game_type]
    );

    await client.query("COMMIT");

   }
      // Insert or update active session


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
  console.log('3. Encryption Done ',message )
  
  const encryptedPayload = encrypt(message);

  // Self-test: verify we can decrypt our own encryption
  // try {
  //   const decrypted = decrypt(encryptedPayload);
  //   console.log("4.✅ Self-decryption test - Decrypted:");
  //   const parsed = JSON.parse(decrypted);
  //   // console.log("✅ Self-decryption test - Parsed:", JSON.stringify(parsed, null, 2));
    
  //   // Verify it matches original
  //   if (decrypted === message) {
  //     console.log("✅ Encryption/Decryption cycle verified!");
  //   } else {
  //     console.log("⚠️  WARNING: Decrypted text doesn't match original!");
  //     console.log("Decrypted:", decrypted);
  //   }
  // } catch (e) {
  //   console.error("❌ Self-decryption test FAILED:", e.message);
  // }

  // Build URL with parameters (exactly like PHP)
  const gameUrl = `${SERVER_URL}/launch_game?` + 
    `user_id=${encodeURIComponent(userName)}` +
    `&wallet_amount=${encodeURIComponent(credit_amount)}` +
    `&game_uid=${encodeURIComponent(game_uid)}` +
    `&token=${encodeURIComponent(API_TOKEN)}` +
    `&timestamp=${encodeURIComponent(timestamp)}` +
    `&payload=${encodeURIComponent(encryptedPayload)}`;


  try {
    // Call the casino API
 const response = await axios.get(gameUrl, { timeout: 10000 });



    // Return the casino API response to frontend
    res.json({
      success: true,
      data: response.data,
      gameUrl: gameUrl
    });
      console.log("🌐 Generated completed");
  } catch (error) {
    console.error("❌ API Error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: "Failed to launch game",
      error: error.response?.data || error.message
    });
  }
});


app.get("/test", (_, res) => res.send("Server running"));

export default app;
