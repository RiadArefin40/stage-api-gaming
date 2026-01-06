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
    const turnoverCheck = await pool.query(
      `
      SELECT id
      FROM user_turnover_history
      WHERE user_id = $1
        AND (
          CAST(active_turnover_amount AS NUMERIC) > 0
          OR complete = false
        )
      LIMIT 1
      `,
      [user_id]
    );


    if (turnoverCheck.rows.length > 0) {
      return res.status(400).json({
        error: "You still have active turnover. Withdrawal is not allowed."
      });
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
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const withdrawalRes = await client.query(
      "SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE",
      [id]
    );

    if (!withdrawalRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Withdrawal not found" });
    }

    const w = withdrawalRes.rows[0];

    if (w.status === "approved") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Already approved" });
    }

    // Update withdrawal
    await client.query(
      "UPDATE withdrawals SET status = 'approved' WHERE id = $1",
      [id]
    );

    // Create notification
    await client.query(
      `
      INSERT INTO notifications
      (user_id, title, message, type, is_read)
      VALUES ($1, $2, $3, $4, false)
      `,
      [
        w.user_id,
        "Withdrawal Approved",
        `Your withdrawal of ৳${w.amount} has been approved successfully.`,
        "success",
      ]
    );

    await client.query("COMMIT");

    res.json({
      message: "Withdrawal approved successfully",
      withdrawal: { ...w, status: "approved" },
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});


// Admin: Reject withdrawal
router.patch("/:id/reject", async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query("BEGIN");

    // Get withdrawal
    const withdrawalResult = await client.query(
      "SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE",
      [id]
    );

    if (!withdrawalResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Withdrawal not found" });
    }

    const withdrawal = withdrawalResult.rows[0];

    // Prevent double rejection
    if (withdrawal.status === "rejected") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Withdrawal already rejected" });
    }

    // Refund wallet
    await client.query(
      "UPDATE users SET wallet = wallet + $1 WHERE id = $2",
      [withdrawal.amount, withdrawal.user_id]
    );

    // Update withdrawal status
    await client.query(
      "UPDATE withdrawals SET status = 'rejected' WHERE id = $1",
      [id]
    );

    // Insert notification
    await client.query(
      `
      INSERT INTO notifications
      (user_id, title, message, type, is_read)
      VALUES ($1, $2, $3, $4, false)
      `,
      [
        withdrawal.user_id,
        "Withdrawal Rejected",
        `Your withdrawal of ৳${withdrawal.amount} has been rejected and refunded.`,
        "error",
      ]
    );

    await client.query("COMMIT");

    res.json({
      message: "Withdrawal rejected and refunded",
      withdrawal: {
        ...withdrawal,
        status: "rejected",
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});



// Get all withdrawals (for admin)
router.get("/", async (_, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        w.*,
        u.name AS user_name
      FROM withdrawals w
      JOIN users u ON u.id = w.user_id
      ORDER BY w.created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// Get withdrawals for a specific user
router.get("/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT w.*, u.name AS username
      FROM withdrawals w
      JOIN users u ON u.id = w.user_id
      WHERE w.user_id = $1
      ORDER BY w.created_at DESC
      `,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


export default router;
