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
// Non-blocking notification
// Non-blocking notification
(async () => {
  try {
    const withdrawal = result.rows[0]; // use the correct variable

    const notificationMessage = `User ${withdrawal.user_id} requested a withdrawal of ${withdrawal.amount}`;

    await pool.query(
      `INSERT INTO withdraw_notifications (type, reference_id, message)
       VALUES ($1, $2, $3)`,
      ['withdraw_request', withdrawal.id, notificationMessage]
    );

    console.log(`✅ Admin notified for withdrawal ${withdrawal.id}`);
  } catch (err) {
    console.error(`❌ Failed to create withdraw notification:`, err.message);
  }
})();

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


// PATCH /admin/withdraw_notifications/:idOrRef/read
router.patch("/admin/withdraw_notifications/:idOrRef/read", async (req, res) => {
  const { idOrRef } = req.params;

  try {
    const result = await pool.query(
      "UPDATE withdraw_notifications SET read=true WHERE id=$1 OR reference_id=$1 RETURNING *",
      [idOrRef]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({
      message: "Withdrawal notification marked as read",
      updated: result.rows,
    });
  } catch (err) {
    console.error("Failed to mark withdrawal notification as read:", err);
    res.status(500).json({ error: "Failed to update notification" });
  }
});
// GET /admin/withdraw_notifications
router.get("/admin/withdraw_notifications", async (req, res) => {
  const { unread } = req.query; // optional: unread=true

  try {
    let query = "SELECT * FROM withdraw_notifications";
    const params = [];

    if (unread === "true") {
      query += " WHERE read = false";
    }

    query += " ORDER BY created_at DESC";

    const result = await pool.query(query, params);

    res.json({
      notifications: result.rows,
    });
  } catch (err) {
    console.error("Failed to fetch withdrawal notifications:", err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// Update turnover delay in minutes
router.patch("/system/settings/turnover-delay", async (req, res) => {
  const { value } = req.body;

  // Validate input
  const minutes = parseInt(value, 10);
  if (isNaN(minutes) || minutes < 0) {
    return res.status(400).json({ error: "Invalid turnover delay value" });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('turnover_delay', $1, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = $1, updated_at = NOW()
      RETURNING *
      `,
      [minutes]
    );

    res.json({
      message: "Turnover delay updated successfully",
      setting: result.rows[0],
    });
  } catch (err) {
    console.error("Failed to update turnover delay:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
// Get current turnover delay in minutes
router.get("/system/settings/turnover-delay", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT value FROM system_settings WHERE key='turnover_delay'"
    );

    const delay = result.rows.length ? parseInt(result.rows[0].value, 10) : 0;

    res.json({
      turnover_delay: delay,
    });
  } catch (err) {
    console.error("Failed to fetch turnover delay:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});




export default router;
