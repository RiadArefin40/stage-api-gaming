import express from "express";
import { pool } from "../db.js";
import { checkDeposit, confirmDeposit } from "./services.routes.js";
const router = express.Router();

// Create deposit

// Create deposit request
// router.post("/", async (req, res) => {
//   const {
//     user_id,
//     amount,
//     sender_number,
//     receiver_number,
//     payment_gateway,
//     transaction_id,
//     promo_code
//   } = req.body;

//   // Validate required fields
//   if (!user_id || !amount || !sender_number || !receiver_number || !payment_gateway || !transaction_id) {
//     return res.status(400).json({ error: "Missing required fields" });
//   }

//   try {
//     // Check if transaction_id already exists
//     const txExists = await pool.query("SELECT id FROM deposits WHERE transaction_id=$1", [transaction_id]);
//     if (txExists.rows.length) {
//       return res.status(400).json({ error: "Transaction ID already exists" });
//     }

//     // Initialize bonus and turnover
//     let bonus = 0;
//     let turnover_required = 0;

//     // Apply promo code if provided
//     let appliedPromo = "";
//     if (promo_code) {
//       const promo = await pool.query(
//         "SELECT * FROM promo_codes WHERE code=$1 AND active=true",
//         [promo_code]
//       );

//       if (!promo.rows.length) {
//         return res.status(400).json({ error: "Invalid or inactive promo code" });
//       }

//       appliedPromo = promo_code;
//       // bonus = (amount * parseFloat(promo.rows[0].deposit_bonus)) / 100;
//       // turnover_required = bonus * parseFloat(promo.rows[0].turnover);

//       bonus = (amount * parseFloat(promo.rows[0].deposit_bonus)) / 100;

//     const totalPlayable = amount + bonus;
 
//     turnover_required =
//    totalPlayable * parseFloat(promo.rows[0].turnover);
//     }

//     const totalAmount = parseFloat(amount) + bonus;

//     // Insert deposit
//     const result = await pool.query(
//       `INSERT INTO deposits 
//         (user_id, amount, sender_number, receiver_number, payment_gateway, transaction_id, promo_code, bonus_amount, turnover_required, status) 
//        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending') 
//        RETURNING id, user_id, amount, status, created_at, sender_number, receiver_number, payment_gateway, transaction_id, promo_code, bonus_amount, turnover_required`,
//       [
//         user_id,
//         totalAmount,
//         sender_number,
//         receiver_number,
//         payment_gateway,
//         transaction_id,
//         appliedPromo,
//         bonus,
//         turnover_required
//       ]
//     );

//     res.json({ message: "Deposit request submitted", deposit: result.rows[0] });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: err.message });
//   }
// });

const result = await pool.query(
  `INSERT INTO deposits 
    (user_id, amount, sender_number, receiver_number, payment_gateway, transaction_id, promo_code, bonus_amount, turnover_required, status, external_payout_id) 
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending', $10) 
   RETURNING id, user_id, amount, status, created_at, sender_number, receiver_number, payment_gateway, transaction_id, promo_code, bonus_amount, turnover_required, external_payout_id`,
  [
    user_id,
    totalAmount,
    sender_number,
    receiver_number,
    payment_gateway,
    transaction_id,
    appliedPromo,
    bonus,
    turnover_required,
    null // external_payout_id initially null
  ]
);



router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM deposits ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/transactions/:userId
router.get("/:userId", async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    // Make sure your table is called "transactions" and exists in the DB
    const result = await pool.query(
      `SELECT *
       FROM deposits
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error("Error fetching transactions:", err.message);

    // Check if the table exists
    if (err.routine === "parserOpenTable") {
      return res.status(500).json({
        success: false,
        message: "Table 'transactions' does not exist in the database.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
      error: err.message,
    });
  }
});


// Approve deposit
// router.patch("/:id/approve", async (req, res) => {
//   const { id } = req.params;
//   const client = await pool.connect();

//   try {
//     await client.query("BEGIN");

//     // 1️⃣ Lock deposit row
//     const depositResult = await client.query(
//       `SELECT * FROM deposits WHERE id = $1 FOR UPDATE`,
//       [id]
//     );

//     if (!depositResult.rows.length) {
//       await client.query("ROLLBACK");
//       return res.status(404).json({ error: "Deposit not found" });
//     }

//     const deposit = depositResult.rows[0];

//     if (deposit.status === "approved") {
//       await client.query("ROLLBACK");
//       return res.status(400).json({ error: "Deposit already approved" });
//     }

//     // 2️⃣ Get promo (optional)
//     let promo = null;
//     if (deposit.promo_code) {
//       const promoResult = await client.query(
//         `SELECT * FROM promo_codes WHERE code = $1`,
//         [deposit.promo_code]
//       );
//       promo = promoResult.rows[0] || null;
//     }

//     // 3️⃣ Approve deposit
//     await client.query(
//       `UPDATE deposits SET status = 'approved' WHERE id = $1`,
//       [id]
//     );

//     // 4️⃣ Update wallet
//     await client.query(
//       `UPDATE users SET wallet = wallet + $1 WHERE id = $2`,
//       [deposit.amount, deposit.user_id]
//     );

//     // 5️⃣ Turnover logic
//     if (promo && promo.turnover) {
//       const turnoverAmount = deposit.amount * promo.turnover;

//       await client.query(
//         `UPDATE users SET turnover = turnover + $1 WHERE id = $2`,
//         [turnoverAmount, deposit.user_id]
//       );
//       console.log('promo', promo)
//       await client.query(
//         `INSERT INTO user_turnover_history (user_id, promo_id, amount,type, code, complete, active_turnover_amount)
//          VALUES ($1, $2, $3, $4, $5 , $6, $7)`,
//         [deposit.user_id, promo.id, turnoverAmount,promo.promo_type, promo.code, false, turnoverAmount]
//       );
//     }

//     // 6️⃣ CREATE NOTIFICATION ✅
//     await client.query(
//       `
//       INSERT INTO notifications
//       (user_id, title, message, type, is_read)
//       VALUES ($1, $2, $3, $4, false)
//       `,
//       [
//         deposit.user_id,
//         "Deposit Approved",
//         `Your deposit of ৳${deposit.amount} has been approved successfully.`,
//         "success",
//       ]
//     );

//     await client.query("COMMIT");

//     res.json({
//       message: "Deposit approved successfully",
//       deposit_id: id,
//     });

//   } catch (err) {
//     await client.query("ROLLBACK");
//     res.status(500).json({ error: err.message });
//   } finally {
//     client.release();
//   }
// });

// ---------------------- APPROVE DEPOSIT ----------------------
router.patch("/:id/approve", async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Lock deposit row
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

    // ---------------- STEP 1: VERIFY EXTERNAL API ----------------
    if (!deposit.external_payout_id) {
      const check = await checkDeposit(deposit.transaction_id);

      if (!check.success) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Deposit verification failed with external API" });
      }

      // Store external payout_id and mark as processing
      await client.query(
        `UPDATE deposits SET external_payout_id=$1, status='processing' WHERE id=$2`,
        [check.data.payout_id, deposit.id]
      );

      deposit.external_payout_id = check.data.payout_id;
    }

    // ---------------- STEP 2: CONFIRM EXTERNAL API ----------------
    const confirm = await confirmDeposit(deposit.external_payout_id);
    if (!confirm.success) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Deposit confirmation failed with external API" });
    }

    // ---------------- INTERNAL UPDATES ----------------
    // Update deposit status to approved
    await client.query(
      `UPDATE deposits SET status='approved' WHERE id=$1`,
      [id]
    );

    // Update user wallet
    await client.query(
      `UPDATE users SET wallet = wallet + $1 WHERE id=$2`,
      [deposit.amount, deposit.user_id]
    );

    // Promo / turnover logic
    let promo = null;
    if (deposit.promo_code) {
      const promoResult = await client.query(
        `SELECT * FROM promo_codes WHERE code=$1`,
        [deposit.promo_code]
      );
      promo = promoResult.rows[0] || null;
    }

    if (promo && promo.turnover) {
      const turnoverAmount = deposit.amount * promo.turnover;

      await client.query(
        `UPDATE users SET turnover = turnover + $1 WHERE id=$2`,
        [turnoverAmount, deposit.user_id]
      );

      await client.query(
        `INSERT INTO user_turnover_history (user_id, promo_id, amount, type, code, complete, active_turnover_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [deposit.user_id, promo.id, turnoverAmount, promo.promo_type, promo.code, false, turnoverAmount]
      );
    }

    // Notification
    await client.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read)
       VALUES ($1, $2, $3, $4, false)`,
      [deposit.user_id, "Deposit Approved", `Your deposit of ৳${deposit.amount} has been approved successfully.`, "success"]
    );

    await client.query("COMMIT");

    res.json({
      message: "Deposit approved and confirmed successfully",
      deposit_id: id,
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});





// get users turover
// Get turnover history for a specific user
router.get("/turnover/:user_id", async (req, res) => {
  const { user_id } = req.params;
  console.log('id', user_id)
  try {
    const result = await pool.query(
      "SELECT * FROM user_turnover_history WHERE user_id = $1 ORDER BY created_at DESC",
      [user_id]
    );


    if (!result.rows.length) {
      return res.status(404).json({ error: "No turnover history found for this user" });
    }

    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
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
