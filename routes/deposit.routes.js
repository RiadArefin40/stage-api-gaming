import express from "express";
import { pool } from "../db.js";

const router = express.Router();

// Create deposit

// Create deposit request
router.post("/", async (req, res) => {
  const {
    user_id,
    amount,
    sender_number,
    receiver_number,
    payment_gateway,
    transaction_id,
    promo_code
  } = req.body;

  // Validate required fields
  if (!user_id || !amount || !sender_number || !receiver_number || !payment_gateway || !transaction_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Check if transaction_id already exists
    const txExists = await pool.query("SELECT id FROM deposits WHERE transaction_id=$1", [transaction_id]);
    if (txExists.rows.length) {
      return res.status(400).json({ error: "Transaction ID already exists" });
    }

    // Initialize bonus and turnover
    let bonus = 0;
    let turnover_required = 0;

    // Apply promo code if provided
    let appliedPromo = "";
    if (promo_code) {
      const promo = await pool.query(
        "SELECT * FROM promo_codes WHERE code=$1 AND active=true",
        [promo_code]
      );

      if (!promo.rows.length) {
        return res.status(400).json({ error: "Invalid or inactive promo code" });
      }

      appliedPromo = promo_code;
      // bonus = (amount * parseFloat(promo.rows[0].deposit_bonus)) / 100;
      // turnover_required = bonus * parseFloat(promo.rows[0].turnover);

      bonus = (amount * parseFloat(promo.rows[0].deposit_bonus)) / 100;

    const totalPlayable = amount + bonus;
 
    turnover_required =
   totalPlayable * parseFloat(promo.rows[0].turnover);
    }

    const totalAmount = parseFloat(amount) + bonus;

    // Insert deposit
    const result = await pool.query(
      `INSERT INTO deposits 
        (user_id, amount, sender_number, receiver_number, payment_gateway, transaction_id, promo_code, bonus_amount, turnover_required, status) 
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending') 
       RETURNING id, user_id, amount, status, created_at, sender_number, receiver_number, payment_gateway, transaction_id, promo_code, bonus_amount, turnover_required`,
      [
        user_id,
        totalAmount,
        sender_number,
        receiver_number,
        payment_gateway,
        transaction_id,
        appliedPromo,
        bonus,
        turnover_required
      ]
    );

    res.json({ message: "Deposit request submitted", deposit: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM deposits ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve deposit
router.patch("/:id/approve", async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Lock deposit row ONLY
    const depositResult = await client.query(
      `SELECT * FROM deposits WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (!depositResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Deposit not found" });
    }

    const deposit = depositResult.rows[0];

    if (deposit.status === "approved") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Deposit already approved" });
    }

    // 2️⃣ Get promo data (NO LOCK needed)
    let promo = null;
    if (deposit.promo_code) {
      const promoResult = await client.query(
        `SELECT id, turnover FROM promo_codes WHERE code = $1`,
        [deposit.promo_code]
      );
      promo = promoResult.rows[0] || null;
    }

    // 3️⃣ Approve deposit
    await client.query(
      `UPDATE deposits SET status = 'approved' WHERE id = $1`,
      [id]
    );

    // 4️⃣ Add wallet balance
    await client.query(
      `UPDATE users SET wallet = wallet + $1 WHERE id = $2`,
      [deposit.amount, deposit.user_id]
    );

    // 5️⃣ Handle turnover
    if (promo && promo.turnover) {
      const turnoverAmount = deposit.amount * promo.turnover;

      await client.query(
        `UPDATE users SET turnover = turnover + $1 WHERE id = $2`,
        [turnoverAmount, deposit.user_id]
      );

      await client.query(
        `INSERT INTO user_turnover_history 
         (user_id, promo_id, amount)
         VALUES ($1, $2, $3)`,
        [deposit.user_id, promo.id, turnoverAmount]
      );
    }

    await client.query("COMMIT");

    res.json({
      message: "Deposit approved successfully",
      deposit_id: id,
    });

  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});





// Reject deposit
router.patch("/:id/reject", async (req, res) => {
  const { id } = req.params;

  try {
    // Check if deposit exists
    const depositResult = await pool.query("SELECT * FROM deposits WHERE id=$1", [id]);
    if (!depositResult.rows.length) return res.status(404).json({ error: "Deposit not found" });

    // Update deposit status
    await pool.query("UPDATE deposits SET status='rejected' WHERE id=$1", [id]);

    // Fetch the updated deposit
    const updatedDepositResult = await pool.query("SELECT * FROM deposits WHERE id=$1", [id]);

    res.json({ message: "Deposit rejected", deposit: updatedDepositResult.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


export default router;
