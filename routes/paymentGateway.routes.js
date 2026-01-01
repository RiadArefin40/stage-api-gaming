import express from "express";
import { pool } from "../db.js";

const router = express.Router();







// POST /api/system-settings/auto-payment
router.post("/auto-payment", async (req, res) => {
  const { enabled } = req.body; // expects boolean true/false

  if (enabled === undefined) {
    return res.status(400).json({ success: false, error: "Missing 'enabled' field" });
  }

  try {
    await pool.query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ('auto_payment_enabled', $1, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [enabled ? "true" : "false"]
    );

    res.json({ success: true, auto_payment_enabled: enabled });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});
// GET /api/system-settings/auto-payment
router.get("/auto-payment", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT value FROM system_settings WHERE key='auto_payment_enabled'"
    );

    const enabled = result.rows.length && result.rows[0].value === "true";

    res.json({ success: true, auto_payment_enabled: enabled });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/**
 * GET all gateways
 */
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM payment_gateways ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * CREATE gateway
 */
router.post("/", async (req, res) => {
  const { name, agent_number, deposit_channel, is_active } = req.body;

  if (!name || !agent_number || !deposit_channel) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO payment_gateways 
      (name, agent_number, deposit_channel, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [name, agent_number, deposit_channel, is_active ?? true]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * UPDATE gateway
 */
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, agent_number, deposit_channel, is_active } = req.body;

  try {
    const result = await pool.query(
      `
      UPDATE payment_gateways
      SET name=$1,
          agent_number=$2,
          deposit_channel=$3,
          is_active=$4
      WHERE id=$5
      RETURNING *
      `,
      [name, agent_number, deposit_channel, is_active, id]
    );

    if (!result.rows.length)
      return res.status(404).json({ error: "Not found" });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE gateway
 */
router.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM payment_gateways WHERE id=$1", [req.params.id]);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
