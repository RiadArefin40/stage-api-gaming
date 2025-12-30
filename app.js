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
app.use(timeout('35s'));
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
//   console.log("Body:", req.body.token,req.body.timestamp );

//   if (!req.body || Object.keys(req.body).length === 0) {
//     return res.status(400).json({ error: "Empty body — callback not parsed" });
//   }

//   const {
//     mobile,
//     bet_amount,
//     win_amount,
//     wallet_before,
//     wallet_after,
//     change,
//     currency_code,
//     timestamp,
//   } = req.body;
//    console.log('result', req.body)
//   const client = await pool.connect();

//   try {
//     await client.query("BEGIN");

//     // Lock user row to prevent race conditions
// const userResult = await client.query(
//   "SELECT id, wallet, turnover FROM users WHERE name ILIKE $1 FOR UPDATE",
//   [mobile]
// );


//     console.log('users',userResult.rows[0] )

//     if (!userResult.rows.length) {
//       await client.query("ROLLBACK");
//       return res.status(404).json({ success: false, message: "User not found" });
//     }

//     const user = userResult.rows[0];
    

//     // Optional safety check: make sure wallet_before matches current DB value
//     // if (Number(user.wallet) !== Number(wallet_before)) {
//     //   await client.query("ROLLBACK");
//     //   return res.status(400).json({
//     //     success: false,
//     //     message: "Wallet mismatch — possible data inconsistency",
//     //   });
//     // }

//     // Update wallet
//     const newWallet = wallet_after; // or user.wallet + change
//     await client.query(
//       "UPDATE users SET wallet = $1 WHERE id = $2",
//       [newWallet, user.id]
//     );


//     console.log("Realtime user event:", timestamp);


//         const sessionResult = await client.query(
//         `SELECT game_type
//         FROM active_game_sessions
//         WHERE user_id=$1
//         ORDER BY started_at DESC
//         LIMIT 1`,
//         [user.id]
//       );

//       const session = sessionResult.rows[0];
//       const type = session.game_type
//        console.log('session',sessionResult.rows[0])




//       try {
// // Get all user turnover history for this user, latest first
// const turnoverResult = await client.query(
//   `SELECT * 
//    FROM user_turnover_history 
//    WHERE user_id = $1 AND complete = false 
//    ORDER BY created_at DESC`,
//   [user.id]
// );


// // for (const record of turnoverResult.rows) {
// //   if ((record.type === type || record.type === "default") && parseInt(record.active_turnover_amount)  > 0) {
// //     console.log('devug')
// //     // Decrease the active_turnover_amount by bet_amount
// //     const decrement = bet_amount; // your bet or calculation
// //     let newActiveAmount = parseFloat(record.active_turnover_amount) - decrement;

// //     if (newActiveAmount <= 0) {
// //       newActiveAmount = 0;
// //     }
// //     if(wallet_before < 20){
// //        newActiveAmount = 0
// //     }
// //    try{

// //         await client.query(
// //       `UPDATE user_turnover_history
// //        SET active_turnover_amount = $1,
// //            complete = $2
// //        WHERE id = $3`,
// //       [newActiveAmount, newActiveAmount === 0, record.id]
// //     );

// //     console.log(
// //       `Updated turnover record ${record.id}: active_turnover_amount=${newActiveAmount}, complete=${newActiveAmount === 0}`
// //     );
// //    }
// //    catch(err){
// //     console.log('freeze-error',record.id)
// //    }
// //     // Update user_turnover_history


// //     // Optional: update user's wallet if needed
// //     // const newWallet = user.wallet + decrement;
// //     // await client.query(
// //     //   "UPDATE users SET wallet = $1 WHERE id = $2",
// //     //   [newWallet, user.id]
// //     // );

// //     // Stop after updating the first applicable record
// //     break;
// //   }
// // }

// await Promise.all(
//   turnoverResult.rows.map(async record => {
//     if ((record.type === type || record.type === "default") && parseFloat(record.active_turnover_amount) > 0) {
//       let newActiveAmount = Math.max(0, parseFloat(record.active_turnover_amount) - bet_amount);
//       await client.query(
//         `UPDATE user_turnover_history SET active_turnover_amount=$1, complete=$2 WHERE id=$3`,
//         [newActiveAmount, newActiveAmount === 0, record.id]
//       );
//     }
//   })
// );



// console.log("Realtime user event:", timestamp);


//   } catch (err) {
//     console.error(err);
 
//   }



//     let newTurnover = user.turnover;

//     if (user.turnover > 0 && bet_amount > 0) {
//       console.log('reducing--ttt',newTurnover )
//       newTurnover = Math.max(0, user.turnover - bet_amount);
//       if(session.game_type == 'slot' || session.game_type == 'live-casino')
//       await client.query(
//         "UPDATE users SET turnover = $1 WHERE id = $2",
//         [newTurnover, user.id]
//       );

//       // Optional: log turnover usage
//       // console.log('reducing--ttt',newTurnover )
//       // await client.query(
//       //   `INSERT INTO user_turnover_history (user_id, amount, type)
//       //    VALUES ($1, $2, 'bet')`,
//       //   [user.id, bet_amount]
//       // );
//     }




//     await client.query("COMMIT");




//     return res.status(200).json({
//       status: "success",
//       message: "Callback processed and wallet updated",
//       wallet: newWallet,
//     });
//   } catch (err) {
//     await client.query("ROLLBACK");
//     console.error("Error processing callback:", err);
//     return res.status(500).json({ success: false, message: "Internal server error" });
//   } finally {
//     client.release();
//   }
// });
app.post("/result", async (req, res) => {
  const { mobile, bet_amount, wallet_after, timestamp,wallet_before } = req.body;

  if (!mobile) return res.status(400).json({ error: "Missing mobile" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Case-insensitive user search
    const userResult = await client.query(
      "SELECT id, wallet, turnover FROM users WHERE name ILIKE $1 FOR UPDATE",
      [mobile]
    );
    if (!userResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const user = userResult.rows[0];
    console.log('user',user)
    // Update wallet
    await client.query(
      "UPDATE users SET wallet=$1 WHERE id=$2",
      [wallet_after, user.id]
    );

    // Update turnover history asynchronously
    const turnoverResult = await client.query(
      `SELECT * FROM user_turnover_history WHERE user_id=$1 AND complete=false ORDER BY created_at DESC`,
      [user.id]
    );

    // console.log('result', turnoverResult)

    // await Promise.all(turnoverResult.rows.map(async record => {
    //   if (parseFloat(record.active_turnover_amount) > 0) {
    //     let newActiveAmount = Math.max(0, parseFloat(record.active_turnover_amount) - bet_amount);
    //     if (newActiveAmount <= 0) {
    //       newActiveAmount = 0;
    //     }
    //     if(wallet_before < 20){
    //         newActiveAmount = 0
    //       }
    //     await client.query(
    //       `UPDATE user_turnover_history SET active_turnover_amount=$1, complete=$2 WHERE id=$3`,
    //       [newActiveAmount, newActiveAmount == 0, record.id]
    //     );
    //         console.log(
    // `Updated turnover record ${record.id}: active_turnover_amount=${newActiveAmount}, complete=${newActiveAmount === 0}`
    // );
    //   }
    // }));
try{
  const record = turnoverResult.rows.find(
  r => parseFloat(r.active_turnover_amount) > 0
);

if (record) {
  let newActiveAmount =
    Math.max(0, parseFloat(record.active_turnover_amount) - bet_amount);

  if (wallet_before < 20) {
    newActiveAmount = 0;
  }

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
catch (e){
 console.log(e)
}





 //    if ((record.type === type || record.type === "default") && parseInt(record.active_turnover_amount)  > 0) {
// //     console.log('devug')
// //     // Decrease the active_turnover_amount by bet_amount
// //     const decrement = bet_amount; // your bet or calculation
// //     let newActiveAmount = parseFloat(record.active_turnover_amount) - decrement;

// //     if (newActiveAmount <= 0) {
// //       newActiveAmount = 0;
// //     }
// //     if(wallet_before < 20){
// //        newActiveAmount = 0
// //     }
// //    try{

// //         await client.query(
// //       `UPDATE user_turnover_history
// //        SET active_turnover_amount = $1,
// //            complete = $2
// //        WHERE id = $3`,
// //       [newActiveAmount, newActiveAmount === 0, record.id]
// //     );

// //     console.log(
// //       `Updated turnover record ${record.id}: active_turnover_amount=${newActiveAmount}, complete=${newActiveAmount === 0}`
// //     );
// //    }
// //    catch(err){
// //     console.log('freeze-error',record.id)
// //    }
// //     // Update user_turnover_history


// //     // Optional: update user's wallet if needed
// //     // const newWallet = user.wallet + decrement;
// //     // await client.query(
// //     //   "UPDATE users SET wallet = $1 WHERE id = $2",
// //     //   [newWallet, user.id]
// //     // );

// //     // Stop after updating the first applicable record
// //     break;

    await client.query("COMMIT");
 console.log('result', wallet_after)
    res.status(200).json({ success: true, wallet: wallet_after });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error processing callback:", err);
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
