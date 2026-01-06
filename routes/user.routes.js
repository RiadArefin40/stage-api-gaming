import express from "express";
import { pool } from "../db.js";
import { generateUniqueReferralCode } from "../utils/referral.js";

const router = express.Router();




router.get("/headline", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM headline WHERE id = 1");
    res.json(result.rows[0]); // return the single row
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch headline" });
  }
});

// ---------------- UPDATE HEADLINE ----------------
router.put("/headline", async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: "Title is required" });

  try {
    const result = await pool.query(
      `UPDATE headline SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1 RETURNING *`,
      [title]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update headline" });
  }
});

// Create user
router.post("/", async (req, res) => {
  const { name, phone, password, referred_by, wallet } = req.body;

  if (!name || !phone || !password)
    return res.status(400).json({ error: "Missing fields" });

  try {
    // Check if user already exists
    const exists = await pool.query(
      "SELECT id FROM users WHERE phone=$1 OR name=$2",
      [phone, name]
    );

    if (exists.rows.length)
      return res.status(400).json({ error: "User already exists" });

    // Validate referral code if provided
    let validReferral = null;
    if (referred_by) {
      const ref = await pool.query(
        "SELECT id FROM users WHERE referral_code = $1",
        [referred_by]
      );
      if (!ref.rows.length)
        return res.status(400).json({ error: "Invalid referral code" });

      validReferral = referred_by;
    }

    // Generate unique referral code
    const referral_code = await generateUniqueReferralCode();

    // Insert user into users table
    const result = await pool.query(
      `INSERT INTO users (name, phone, password, referral_code, referred_by, wallet)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [name, phone, password, referral_code, validReferral, wallet || 0]
    );

    const newUser = result.rows[0];

    // Insert phone into user_phone_numbers table
    await pool.query(
      `INSERT INTO user_phone_numbers (user_id, phone)
       VALUES ($1, $2)`,
      [newUser.id, phone]
    );

    res.json({ message: "User created", user: newUser });
  } catch (err) {
    console.error("Error creating user:", err.message);
    res.status(500).json({ error: err.message });
  }
});


// Get all users
router.get("/", async (_, res) => {
  const result = await pool.query("SELECT * FROM users");
  res.json(result.rows);
});

// Get referrals
router.get("/:referral_code/referrals", async (req, res) => {
  const { referral_code } = req.params;
  const result = await pool.query(
    "SELECT * FROM users WHERE referred_by=$1",
    [referral_code]
  );
  res.json(result.rows);
});


router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Check if user exists
    const userCheck = await pool.query("SELECT id FROM users WHERE id=$1", [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Delete related deposits first
    await pool.query("DELETE FROM deposits WHERE user_id=$1", [id]);

    // Delete the user
    await pool.query("DELETE FROM users WHERE id=$1", [id]);

    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error(err);

    // Foreign key violation
    if (err.code === "23503") {
      return res.status(400).json({ error: "Cannot delete user with related records." });
    }

    res.status(500).json({ error: "Failed to delete user" });
  }
});


// Update user
import bcrypt from "bcrypt";

router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, phone, role, wallet, password } = req.body;

  try {
    // 1. Get existing user
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE id = $1",
      [id]
    );

    if (!existingUser.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentUser = existingUser.rows[0];

    // 2. Duplicate check if name/phone changed
    if (name !== currentUser.name || phone !== currentUser.phone) {
      const duplicateCheck = await pool.query(
        `
        SELECT id FROM users 
        WHERE (name = $1 OR phone = $2) 
        AND id != $3
        `,
        [name, phone, id]
      );

      if (duplicateCheck.rows.length) {
        return res
          .status(400)
          .json({ error: "Username or phone already in use" });
      }
    }

    // 3. Build dynamic update query
    const fields = ["name", "phone", "role", "wallet"];
    const values = [name, phone, role, wallet];
    let index = values.length + 1;

    // 🔐 Update password ONLY for admin / agent
    if ((role === "admin" || role === "agent") && password) {
      const hashedPassword = password;
      fields.push("password");
      values.push(hashedPassword);
    }

    const setQuery = fields
      .map((field, i) => `${field} = $${i + 1}`)
      .join(", ");

    const result = await pool.query(
      `
      UPDATE users
      SET ${setQuery}
      WHERE id = $${values.length + 1}
      RETURNING id, name, phone, role, wallet, referral_code, referred_by
      `,
      [...values, id]
    );

    res.json({
      message: "User updated successfully",
      user: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update user" });
  }
});


// Get user balance
// Get user balance and turnover
router.get("/:id/balance", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "SELECT wallet, turnover FROM users WHERE id = $1",
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const turnover = await pool.query(
      "SELECT * FROM user_turnover_history WHERE user_id = $1 ORDER BY created_at DESC",
      [id]
    );


    if (!result.rows.length) {
      return res.status(404).json({ error: "No turnover history found for this user" });
    }

  

    res.json({
      balance: result.rows[0].wallet,
      turnover: turnover.rows, // return turnover too
    });
    console.log('crypto block generation started for userId :' , id)
  } catch (err) {
    console.error("Balance API error:", err);
    res.status(500).json({ error: "Server error" });
  }
});



// Toggle active / deactive user
router.patch("/:id/toggle-status", async (req, res) => {
  const { id } = req.params;

  try {
    // Get current status
    const userResult = await pool.query(
      "SELECT is_block_user FROM users WHERE id = $1",
      [id]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentStatus = userResult.rows[0].is_block_user;
    const newStatus = !currentStatus;

    // Update status
    const updated = await pool.query(
      `
      UPDATE users
      SET is_block_user = $1
      WHERE id = $2
      RETURNING id, name, is_block_user
      `,
      [newStatus, id]
    );

    res.json({
      message: newStatus ? "User deactivated" : "User activated",
      user: updated.rows[0],
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to toggle user status" });
  }
});


// user phone numbers
router.post("/phone", async (req, res) => {
  const { user_id, phone } = req.body;

  if (!user_id || !phone) {
    return res.status(400).json({ error: "user_id and phone are required" });
  }

  try {
    const userExists = await pool.query(
      "SELECT phone FROM users WHERE id = $1",
      [user_id]
    );

    if (!userExists.rowCount) {
      return res.status(400).json({ error: "Invalid user" });
    }

    if (userExists.rows[0].phone === phone) {
      return res.status(400).json({
        error: "This phone is already your primary number",
      });
    }

    const count = await pool.query(
      "SELECT COUNT(*) FROM user_phone_numbers WHERE user_id = $1",
      [user_id]
    );

    if (parseInt(count.rows[0].count) >= 3) {
      return res.status(400).json({ error: "Maximum 3 phone numbers allowed" });
    }

    const exists = await pool.query(
      `SELECT 1 FROM user_phone_numbers WHERE user_id = $1 AND phone = $2`,
      [user_id, phone]
    );

    if (exists.rowCount) {
      return res.status(400).json({ error: "Phone number already added" });
    }

    const result = await pool.query(
      `INSERT INTO user_phone_numbers (user_id, phone)
       VALUES ($1, $2)
       RETURNING *`,
      [user_id, phone]
    );

    res.json({
      message: "Phone added. Please verify.",
      phone: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


//verify phone numbers
router.post("/phone/verify", async (req, res) => {
  const { user_id, phone } = req.body;

  if (!user_id || !phone) {
    return res.status(400).json({ error: "Missing data" });
  }

  try {
    const result = await pool.query(
      `UPDATE user_phone_numbers
       SET is_verified = true, verified_at = NOW()
       WHERE user_id = $1 AND phone = $2
       RETURNING *`,
      [user_id, phone]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Phone not found" });
    }

    res.json({
      message: "Phone verified",
      phone: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//delete if not verified
router.delete("/phone", async (req, res) => {
  try {
    const { user_id, phone } = req.body;

    if (!user_id || !phone)
      return res.status(400).json({ error: "Missing user_id or phone" });

    const uid = parseInt(user_id, 10);
    if (isNaN(uid)) return res.status(400).json({ error: "Invalid user_id" });

    const phoneTrimmed = String(phone).trim();

    const result = await pool.query(
      `DELETE FROM user_phone_numbers
       WHERE user_id=$1 AND phone=$2 AND is_verified=false
       RETURNING *`,
      [uid, phoneTrimmed] // ✅ user_id first, phone second
    );

    if (!result.rowCount) {
      return res.status(400).json({ error: "Cannot delete verified number or not found" });
    }

    res.json({ message: "Phone removed", phone: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete phone", details: err.message });
  }
});





// get all number

router.get("/phones/:user_id", async (req, res) => {
  const { user_id } = req.params;

  const result = await pool.query(
    `SELECT * FROM user_phone_numbers
     WHERE user_id = $1
     ORDER BY is_verified DESC, created_at ASC`,
    [user_id]
  );

  res.json(result.rows);
});




export default router;
