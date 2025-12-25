import express from "express";
import { pool } from "../db.js";

const router = express.Router();

// User submits a withdrawal request
router.post("/", async (req, res) => {
  const { user_id, amount } = req.body;

  if (!user_id || !amount) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    // Check if user has enough balance
    const user = await pool.query("SELECT wallet FROM users WHERE id=$1", [user_id]);
    if (!user.rows.length) return res.status(404).json({ error: "User not found" });

    if (parseFloat(user.rows[0].wallet) < parseFloat(amount)) {
      return res.status(400).json({ error: "Insufficient wallet balance" });
    }

    // Insert withdrawal request
    const result = await pool.query(
      `INSERT INTO withdrawals (user_id, amount) VALUES ($1, $2) RETURNING *`,
      [user_id, amount]
    );

    res.json({ message: "Withdrawal request submitted", withdrawal: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Approve withdrawal
router.patch("/:id/approve", async (req, res) => {
  const { id } = req.params;

  try {
    const withdrawal = await pool.query("SELECT * FROM withdrawals WHERE id=$1", [id]);
    if (!withdrawal.rows.length) return res.status(404).json({ error: "Withdrawal not found" });

    const w = withdrawal.rows[0];

    // Deduct from user wallet
    await pool.query("UPDATE users SET wallet = wallet - $1 WHERE id=$2", [w.amount, w.user_id]);

    // Update withdrawal status
    await pool.query("UPDATE withdrawals SET status='approved' WHERE id=$1", [id]);

    res.json({ message: "Withdrawal approved", withdrawal: { ...w, status: "approved" } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Reject withdrawal
router.patch("/:id/reject", async (req, res) => {
  const { id } = req.params;

  try {
    const withdrawal = await pool.query("SELECT * FROM withdrawals WHERE id=$1", [id]);
    if (!withdrawal.rows.length) return res.status(404).json({ error: "Withdrawal not found" });

    // Update withdrawal status
    await pool.query("UPDATE withdrawals SET status='rejected' WHERE id=$1", [id]);

    res.json({ message: "Withdrawal rejected", withdrawal: { ...withdrawal.rows[0], status: "rejected" } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all withdrawals (for admin)
router.get("/", async (_, res) => {
  try {
    const result = await pool.query(`
      SELECT w.*, u.name AS username 
      FROM withdrawals w 
      JOIN users u ON u.id = w.user_id
      ORDER BY w.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
