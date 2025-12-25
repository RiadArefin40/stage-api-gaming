import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/**
 * GET all promo codes
 */
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM promo_codes ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * CREATE promo
 */
router.post("/", async (req, res) => {
  const { code, depositBonus, turnover, active } = req.body;

  if (!code || !depositBonus || !turnover)
    return res.status(400).json({ error: "Missing fields" });

  try {
    const exists = await pool.query(
      "SELECT id FROM promo_codes WHERE code=$1",
      [code]
    );

    if (exists.rows.length)
      return res.status(400).json({ error: "Promo already exists" });

    const result = await pool.query(
      `INSERT INTO promo_codes (code, deposit_bonus, turnover, active)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [code, depositBonus, turnover, active]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * UPDATE promo
 */
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { code, depositBonus, turnover, active } = req.body;

  try {
    const exists = await pool.query(
      "SELECT id FROM promo_codes WHERE code=$1 AND id != $2",
      [code, id]
    );

    if (exists.rows.length)
      return res.status(400).json({ error: "Promo code already exists" });

    const result = await pool.query(
      `UPDATE promo_codes 
       SET code=$1, deposit_bonus=$2, turnover=$3, active=$4
       WHERE id=$5
       RETURNING *`,
      [code, depositBonus, turnover, active, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * TOGGLE ACTIVE STATUS
 */
router.patch("/:id/toggle", async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE promo_codes
       SET active = NOT active
       WHERE id=$1
       RETURNING *`,
      [req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE promo
 */
router.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM promo_codes WHERE id=$1", [req.params.id]);
    res.json({ message: "Promo deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
