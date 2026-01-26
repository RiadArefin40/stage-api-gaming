// import express from "express";
// import cors from "cors";
// import dotenv from "dotenv";
// import pkg from "pg";
// import crypto from "crypto";

// dotenv.config();

// const app = express();
// const { Pool } = pkg;

// // PostgreSQL connection
// const pool = new Pool({
//   user: process.env.DB_USER,
//   host: process.env.DB_HOST,
//   database: process.env.DB_NAME,
//   password: process.env.DB_PASS,
//   port: process.env.DB_PORT,
// });

// app.use(cors());
// app.use(express.json());

// // Helper function to generate referral codes
// async function generateUniqueReferralCode() {
//   let code;
//   let exists = true;

//   while (exists) {
//     code = crypto.randomBytes(4).toString("hex").toUpperCase();
//     const result = await pool.query(
//       "SELECT 1 FROM users WHERE referral_code = $1",
//       [code]
//     );
//     exists = result.rows.length > 0;
//   }

//   return code;
// }


// // Test route
// app.get("/", (req, res) => {
//   res.send("Server is running!");
// });

// // user login
// app.post("/login", async (req, res) => {
//   const { identifier, password } = req.body; // identifier can be name or phone

//   if (!identifier || !password) {
//     return res.status(400).json({ error: "Name/phone and password are required." });
//   }

//   try {
//     // Find user by name or phone
//     const result = await pool.query(
//       "SELECT * FROM users WHERE name = $1 OR phone = $1",
//       [identifier]
//     );

//     if (result.rows.length === 0) {
//       return res.status(400).json({ error: "Invalid credentials." });
//     }

//     const user = result.rows[0];

//     // Compare password (plain text for now)
//     if (user.password !== password) {
//       return res.status(400).json({ error: "Invalid credentials." });
//     }

//     // Successful login response
//     res.json({
//       message: "Login successful",
//       user: {
//         id: user.id,
//         name: user.name,
//         phone: user.phone,
//         wallet: user.wallet,
//         referral_code: user.referral_code,
//         referred_by: user.referred_by
//       }
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });



// // Create user with referral system
// app.post("/users", async (req, res) => {
//   const { name, phone, password, referred_by, wallet } = req.body;

//   if (!name || !phone || !password) {
//     return res.status(400).json({ error: "Name, phone and password are required." });
//   }

//   try {
//     // Check if name or phone already exists
//     const existing = await pool.query(
//       "SELECT id FROM users WHERE phone = $1 OR name = $2",
//       [phone, name]
//     );

//     if (existing.rows.length > 0) {
//       return res.status(400).json({ error: "Name or phone already registered." });
//     }

//     // Generate referral code
//     const referral_code = await generateUniqueReferralCode();

//     // Validate referral code if provided
//     // Generate referral code

// // Validate referral code if provided
// let validReferral = null;
// if (referred_by) {
//   const refCheck = await pool.query(
//     "SELECT id FROM users WHERE referral_code = $1",
//     [referred_by]
//   );

//   if (refCheck.rows.length === 0) {
//     return res.status(400).json({ error: "Invalid referral code." });
//   }

//   validReferral = referred_by;
// }
//     const initialWallet = wallet || 0;

//     // Insert new user
//     const result = await pool.query(
//       `
//       INSERT INTO users 
//       (name, phone, password, referral_code, referred_by, wallet)
//       VALUES ($1, $2, $3, $4, $5, $6)
//       RETURNING id, name, phone, wallet, referral_code, referred_by
//       `,
//       [name, phone, password, referral_code, validReferral, initialWallet]
//     );

//     res.json({
//       message: "User created successfully",
//       user: result.rows[0]
//     });

//   } catch (err) {
//     console.error(err);

//     // Check for unique constraint violation
//     if (err.code === "23505") {
//       // 23505 is Postgres unique violation
//       if (err.detail.includes("users_email_key")) {
//         return res.status(400).json({ error: "Email already registered." });
//       }
//       if (err.detail.includes("users_name_key")) {
//         return res.status(400).json({ error: "Name already taken." });
//       }
//       if (err.detail.includes("users_phone_key")) {
//         return res.status(400).json({ error: "Phone number already registered." });
//       }
//       if (err.detail.includes("users_referral_code_key")) {
//         return res.status(500).json({ error: "Referral code conflict, please try again." });
//       }
//     }

//     // Fallback
//     res.status(500).json({ error: "Internal server error." });
//   }
// });



// // Update user
// app.put("/users/:id", async (req, res) => {
//   const { id } = req.params;
//   const { name, phone, wallet, role } = req.body;

//   try {
//     const result = await pool.query(
//       `UPDATE users SET name=$1, phone=$2, wallet=$3, role=$4 WHERE id=$5 RETURNING id, name, phone, wallet, role, referral_code, referred_by`,
//       [name, phone, wallet, role, id]
//     );

//     if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
//     res.json({ message: "User updated successfully", user: result.rows[0] });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Failed to update user" });
//   }
// });

// // Delete user
// app.delete("/users/:id", async (req, res) => {
//   const { id } = req.params;

//   try {
//     // Check if user exists
//     const userCheck = await pool.query("SELECT id FROM users WHERE id=$1", [id]);
//     if (userCheck.rows.length === 0) {
//       return res.status(404).json({ error: "User not found" });
//     }

//     // Delete related deposits first
//     await pool.query("DELETE FROM deposits WHERE user_id=$1", [id]);

//     // Delete the user
//     await pool.query("DELETE FROM users WHERE id=$1", [id]);

//     res.json({ message: "User deleted successfully" });
//   } catch (err) {
//     console.error(err);

//     // Foreign key violation
//     if (err.code === "23503") {
//       return res.status(400).json({ error: "Cannot delete user with related records." });
//     }

//     res.status(500).json({ error: "Failed to delete user" });
//   }
// });



// // -------------------- TRANSACTIONS -------------------- //
// app.get("/users/:id/transactions", async (req, res) => {
//   const { id } = req.params;
//   try {
//     const result = await pool.query(
//       "SELECT date, type, amount FROM transactions WHERE user_id=$1 ORDER BY date DESC",
//       [id]
//     );
//     res.json(result.rows);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Failed to fetch transactions" });
//   }
// });



// //deposit request

// app.post("/deposit", async (req, res) => {
//   const { user_id, amount } = req.body;

//   if (!user_id || !amount) {
//     return res.status(400).json({ error: "User ID and amount are required." });
//   }

//   if (amount <= 0) {
//     return res.status(400).json({ error: "Amount must be greater than zero." });
//   }

//   try {
//     // Insert deposit request into deposits table
//     const result = await pool.query(
//       `INSERT INTO deposits (user_id, amount) VALUES ($1, $2) RETURNING *`,
//       [user_id, amount]
//     );

//     res.json({
//       message: "Deposit request submitted successfully.",
//       deposit: result.rows[0]
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });


// //deposit approve
// app.post("/deposit/approve", async (req, res) => {
//   const { deposit_id } = req.body;
//   const client = await pool.connect();

//   try {
//     await client.query("BEGIN");

//     const { rows } = await client.query(
//       "SELECT * FROM deposits WHERE id = $1 FOR UPDATE",
//       [deposit_id]
//     );

//     if (!rows.length)
//       throw new Error("Deposit not found");

//     const deposit = rows[0];

//     if (deposit.status !== "pending")
//       throw new Error("Already processed");

//     await client.query(
//       "UPDATE users SET wallet = wallet + $1 WHERE id = $2",
//       [deposit.amount, deposit.user_id]
//     );

//     await client.query(
//       "UPDATE deposits SET status = 'approved' WHERE id = $1",
//       [deposit_id]
//     );

//     await client.query("COMMIT");

//     res.json({ message: "Deposit approved" });
//   } catch (err) {
//     await client.query("ROLLBACK");
//     res.status(500).json({ error: err.message });
//   } finally {
//     client.release();
//   }
// });




// // Get all deposit requests
// app.get("/admin/deposits", async (req, res) => {
//   try {
//     const result = await pool.query(
//       `SELECT d.id, d.user_id, u.name, u.email, d.amount, d.status, d.created_at
//        FROM deposits d
//        JOIN users u ON d.user_id = u.id
//        ORDER BY d.created_at DESC`
//     );

//     res.json(result.rows);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });



// //Check wallet balance

// app.get("/users/:id/wallet", async (req, res) => {
//   const { id } = req.params;
//   try {
//     const result = await pool.query(
//       "SELECT wallet FROM users WHERE id = $1",
//       [id]
//     );
//     if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
//     res.json({ wallet: result.rows[0].wallet });
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });



// // Get all users
// app.get("/users", async (req, res) => {
//   try {
//     const result = await pool.query("SELECT * FROM users");
//     res.json(result.rows);
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// // Get referrals of a user
// app.get("/users/:referral_code/referrals", async (req, res) => {
//   const { referral_code } = req.params;
//   try {
//     const result = await pool.query(
//       "SELECT * FROM users WHERE referred_by = $1",
//       [referral_code]
//     );
//     res.json(result.rows);
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// const PORT = process.env.PORT || 4000;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
import app from "./app.js";

const PORT = process.env.PORT || 22000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
