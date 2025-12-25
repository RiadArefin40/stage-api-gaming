import express from "express";
import { pool } from "../db.js";
import { generateUniqueReferralCode } from "../utils/referral.js";

const router = express.Router();

// Create user
router.post("/", async (req, res) => {
  const { name, phone, password, referred_by, wallet } = req.body;

  if (!name || !phone || !password)
    return res.status(400).json({ error: "Missing fields" });

  try {
    const exists = await pool.query(
      "SELECT id FROM users WHERE phone=$1 OR name=$2",
      [phone, name]
    );

    if (exists.rows.length)
      return res.status(400).json({ error: "User already exists" });

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

    const referral_code = await generateUniqueReferralCode();

    const result = await pool.query(
      `INSERT INTO users (name, phone, password, referral_code, referred_by, wallet)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [name, phone, password, referral_code, validReferral, wallet || 0]
    );

    res.json({ message: "User created", user: result.rows[0] });
  } catch (err) {
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
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, phone, role, wallet } = req.body;

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

    // 2. Only check duplicates if changed
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

    // 3. Update user
    const result = await pool.query(
      `
      UPDATE users
      SET 
        name = $1,
        phone = $2,
        role = $3,
        wallet = $4
      WHERE id = $5
      RETURNING id, name, phone, role, wallet, referral_code, referred_by
      `,
      [name, phone, role, wallet, id]
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



export default router;
