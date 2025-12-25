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
  const { code, depositBonus, turnover, active, promo_type } = req.body;

  if (!code || depositBonus === undefined || turnover === undefined)
    return res.status(400).json({ error: "Missing fields" });

  try {
    // Check if promo code already exists
    const exists = await pool.query(
      "SELECT id FROM promo_codes WHERE code=$1",
      [code]
    );

    if (exists.rows.length)
      return res.status(400).json({ error: "Promo already exists" });

    // Insert new promo including promo_type (default 'any')
    const result = await pool.query(
      `INSERT INTO promo_codes (code, deposit_bonus, turnover, active, promo_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [code, depositBonus, turnover, active, promo_type || 'any']
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
  const { code, depositBonus, turnover, active, promo_type } = req.body; // added promo_type

  try {
    // Check for duplicate code excluding current id
    const exists = await pool.query(
      "SELECT id FROM promo_codes WHERE code=$1 AND id != $2",
      [code, id]
    );

    if (exists.rows.length)
      return res.status(400).json({ error: "Promo code already exists" });

    // Update including promo_type
    const result = await pool.query(
      `UPDATE promo_codes 
       SET code=$1, deposit_bonus=$2, turnover=$3, active=$4, promo_type=$5
       WHERE id=$6
       RETURNING *`,
      [code, depositBonus, turnover, active, promo_type, id]
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
