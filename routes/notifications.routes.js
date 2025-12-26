import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/**
 * ADMIN → Send notification to user
 */
router.post("/", async (req, res) => {
  const { user_id, title, message, type } = req.body;

  if (!user_id || !title || !message) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO notifications 
      (user_id, title, message, type)
      VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [user_id, title, message, type || "info"]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * USER → Get own notifications
 */
router.get("/user/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    // Get notifications
    const notificationsResult = await pool.query(
      `
      SELECT *
      FROM notifications
      WHERE user_id = $1
        AND is_active = true
      ORDER BY created_at DESC
      `,
      [userId]
    );

    // Get unread count
    const unreadResult = await pool.query(
      `
      SELECT COUNT(*) 
      FROM notifications 
      WHERE user_id = $1 AND is_read = false
      `,
      [userId]
    );

    res.json({
      unread_count: Number(unreadResult.rows[0].count),
      notifications: notificationsResult.rows,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Mark as read
 */
router.patch("/:id/read", async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = true WHERE id = $1`,
      [req.params.id]
    );

    res.json({ message: "Marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Soft delete notification
 */
router.patch("/:id/archive", async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_active = false WHERE id = $1`,
      [req.params.id]
    );

    res.json({ message: "Notification archived" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
