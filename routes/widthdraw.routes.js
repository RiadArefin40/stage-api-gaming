import express from "express";
import { pool } from "../db.js";

const router = express.Router();

// User submits a withdrawal request
router.post("/", async (req, res) => {
  const {
    user_id,
    amount,
    sender_number,
    receiver_number,
    payment_gateway,
  } = req.body;

  if (!user_id || !amount || !payment_gateway) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Check user wallet
    const userResult = await pool.query(
      "SELECT wallet FROM users WHERE id=$1",
      [user_id]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const wallet = parseFloat(userResult.rows[0].wallet);
    const withdrawAmount = parseFloat(amount);

    if (wallet < withdrawAmount) {
      return res.status(400).json({ error: "Insufficient wallet balance" });
    }

    // Insert withdrawal request
    const result = await pool.query(
      `
      INSERT INTO withdrawals 
      (user_id, amount, sender_number, receiver_number, payment_gateway)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [user_id, withdrawAmount, sender_number, receiver_number, payment_gateway]
    );

    // Deduct wallet balance
    await pool.query(
      "UPDATE users SET wallet = wallet - $1 WHERE id = $2",
      [withdrawAmount, user_id]
    );

    res.json({
      message: "Withdrawal request submitted successfully",
      withdrawal: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
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
    // await pool.query("UPDATE users SET wallet = wallet - $1 WHERE id=$2", [w.amount, w.user_id]);

    // Update withdrawal status
    await pool.query("UPDATE withdrawals SET status='approved' WHERE id=$1", [id]);

    res.json({ message: "Withdrawal approved", withdrawal: { ...w, status: "approved" } });

    
    // 6️⃣ CREATE NOTIFICATION ✅
    await client.query(
      `
      INSERT INTO notifications
      (user_id, title, message, type, is_read)
      VALUES ($1, $2, $3, $4, false)
      `,
      [
        w.user_id,
        "Deposit Approved",
        `Your Widthrawal of ৳${w.amount} has been approved successfully.`,
        "success",
      ]
    );

    await client.query("COMMIT");
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Reject withdrawal
router.patch("/:id/reject", async (req, res) => {
  const { id } = req.params;

  try {
    // Get withdrawal info
    const withdrawalResult = await pool.query(
      "SELECT * FROM withdrawals WHERE id = $1",
      [id]
    );

    if (!withdrawalResult.rows.length) {
      return res.status(404).json({ error: "Withdrawal not found" });
    }

    const withdrawal = withdrawalResult.rows[0];

    // Prevent double rejection
    if (withdrawal.status === "rejected") {
      return res.status(400).json({ error: "Withdrawal already rejected" });
    }

    // Refund amount to user wallet
    await pool.query(
      "UPDATE users SET wallet = wallet + $1 WHERE id = $2",
      [withdrawal.amount, withdrawal.user_id]
    );

    // Update withdrawal status
    await pool.query(
      "UPDATE withdrawals SET status = 'rejected' WHERE id = $1",
      [id]
    );

    res.json({
      message: "Withdrawal rejected and amount refunded",
      withdrawal: {
        ...withdrawal,
        status: "rejected",
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
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
