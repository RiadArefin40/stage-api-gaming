import express from "express";
import { pool } from "../db.js";
import { checkDeposit, confirmDeposit } from "./services.routes.js";
const router = express.Router();

// Create deposit


const autoApproveDeposit = async (depositId) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      "SELECT * FROM deposits WHERE id=$1 FOR UPDATE",
      [depositId]
    );

    if (!rows.length) return;

    const deposit = rows[0];

    // Allow retry only for these states
    if (!["pending", "processing"].includes(deposit.status)) {
      await client.query("ROLLBACK");
      return;
    }

    // ---------------- STEP 1: VERIFY EXTERNAL API ----------------
 // ---------------- STEP 1: VERIFY EXTERNAL API ----------------
if (!deposit.external_payout_id) {
  const check = await checkDeposit(deposit.transaction_id);

  if (!check?.success) {
    await client.query(
      `UPDATE deposits
       SET status = 'processing',
           retry_count = retry_count + 1,
           failure_reason = $1
       WHERE id = $2`,
      [check.message || "External payout not ready", deposit.id]
    );

    await client.query("COMMIT");
    return;
  }

  await client.query(
    `UPDATE deposits 
     SET external_payout_id=$1, status='processing' 
     WHERE id=$2`,
    [check.data.payout_id, deposit.id]
  );

  deposit.external_payout_id = check.data.payout_id;
}


    // ---------------- STEP 2: CONFIRM PAYOUT ----------------
    const confirm = await confirmDeposit(deposit.external_payout_id);

    const payoutAmount = Number(confirm?.data?.amount);
    const depositAmount = Number(deposit.amount);
    const bonusAmount = Number(deposit.bonus_amount);

    if (
      !confirm?.success ||
      Number.isNaN(payoutAmount) ||
      payoutAmount !== depositAmount - bonusAmount
    ) {
      await client.query(
        `UPDATE deposits
         SET status='failed',
             retry_count = retry_count + 1,
             failure_reason = $1
         WHERE id = $2`,
        ["Payout mismatch", deposit.id]
      );

      await client.query("COMMIT");
      return;
    }

    // ---------------- STEP 3: FINALIZE ----------------
    await client.query(
      `UPDATE deposits 
       SET status='approved', external_payout_id=$1 
       WHERE id=$2`,
      [confirm.data.payout_id, deposit.id]
    );

    await client.query(
      `UPDATE users 
       SET wallet = wallet + $1 
       WHERE id = $2`,
      [deposit.amount, deposit.user_id]
    );

    await client.query("COMMIT");

    console.log(`✅ Deposit ${deposit.id} auto-approved`);

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Auto approval failed:", err.message);
  } finally {
    client.release();
  }
};




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

//   if (!user_id || !amount || !sender_number || !receiver_number || !payment_gateway || !transaction_id) {
//     return res.status(400).json({ error: "Missing required fields" });
//   }

//   const numericAmount = Number(amount);
//   if (isNaN(numericAmount) || numericAmount <= 0) {
//     return res.status(400).json({ error: "Invalid amount" });
//   }

//   const client = await pool.connect();

//   try {
//     await client.query("BEGIN");

//     // Check duplicate transaction
//     const txExists = await client.query(
//       "SELECT id FROM deposits WHERE transaction_id=$1",
//       [transaction_id]
//     );

//     if (txExists.rows.length) {
//       await client.query("ROLLBACK");
//       return res.status(400).json({ error: "Transaction ID already exists" });
//     }

//     let bonus = 0;
//     let turnover_required = 0;
//     let appliedPromo = "";

//     if (promo_code) {
//       const promo = await client.query(
//         "SELECT * FROM promo_codes WHERE code=$1 AND active=true",
//         [promo_code]
//       );

//       if (!promo.rows.length) {
//         await client.query("ROLLBACK");
//         return res.status(400).json({ error: "Invalid or inactive promo code" });
//       }

//       appliedPromo = promo_code;

//       bonus = (numericAmount * parseFloat(promo.rows[0].deposit_bonus)) / 100;
//       const totalPlayable = numericAmount + bonus;
//       turnover_required = totalPlayable * parseFloat(promo.rows[0].turnover);
//     }

//     const totalAmount = numericAmount + bonus;

//     const result = await client.query(
//       `INSERT INTO deposits 
//         (user_id, amount, sender_number, receiver_number, payment_gateway, transaction_id, promo_code, bonus_amount, turnover_required, status, external_payout_id)
//        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',NULL)
//        RETURNING *`,
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

//     await client.query("COMMIT");

//     // Non-blocking admin notification
// // Non-blocking admin notification
// (async () => {
//   try {
//     const deposit = result.rows[0]; // ✅ get the inserted deposit
//     const notificationMessage = `User ${deposit.user_id} created a deposit request of ${deposit.amount}`;

//     await pool.query(
//       `INSERT INTO admin_notifications (type, reference_id, message)
//       VALUES ($1, $2, $3)`,
//       ['deposit_request', deposit.id, notificationMessage]
//     );

//     console.log(`✅ Admin notified for deposit ${deposit.id}`);
//   } catch (err) {
//     console.error(`❌ Failed to create admin notification:`, err.message);
//   }
// })();



//     // Respond immediately
//     res.json({
//       message: "Deposit request submitted",
//       deposit: result.rows[0]
//     });

// try {
//   const settingRes = await pool.query(
//     "SELECT value FROM system_settings WHERE key='auto_payment_enabled'"
//   );

//   const autoPaymentEnabled = settingRes.rows.length && settingRes.rows[0].value === "true";

//   if (autoPaymentEnabled) {
//     setTimeout(() => {
//       autoApproveDeposit(result.rows[0].id);
//     }, 10 * 1000);
//   } else {
//     console.log(`Deposit ${result.rows[0].id} will stay pending: global auto-payment is OFF`);
//   }
// } catch (err) {
//   console.error("Failed to read global auto-payment setting:", err);
// }

//   } catch (err) {
//     await client.query("ROLLBACK");
//     console.error(err);
//     res.status(500).json({ error: err.message });
//   } finally {
//     client.release();
//   }
// });

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

  if (!user_id || !amount || !sender_number || !receiver_number || !payment_gateway || !transaction_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Check duplicate transaction
    const txExists = await client.query(
      "SELECT id FROM deposits WHERE transaction_id=$1",
      [transaction_id]
    );

    if (txExists.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Transaction ID already exists" });
    }

    let bonus = 0;
    let turnover_required = 0;
    let appliedPromo = "";

    if (promo_code) {
      const promo = await client.query(
        "SELECT * FROM promo_codes WHERE code=$1 AND active=true",
        [promo_code]
      );

      if (!promo.rows.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Invalid or inactive promo code" });
      }

      appliedPromo = promo_code;

      bonus = (numericAmount * parseFloat(promo.rows[0].deposit_bonus)) / 100;
      const totalPlayable = numericAmount + bonus;
      turnover_required = totalPlayable * parseFloat(promo.rows[0].turnover);
    }

    const totalAmount = numericAmount + bonus;

    const result = await client.query(
      `INSERT INTO deposits 
        (user_id, amount, sender_number, receiver_number, payment_gateway, transaction_id, promo_code, bonus_amount, turnover_required, status, external_payout_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',NULL)
       RETURNING *`,
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

    await client.query("COMMIT");

    // Get the inserted deposit
    const deposit = result.rows[0];
    console.log("💰 Deposit inserted:", deposit);

    // --- Admin notification (non-blocking) ---
    const notifyAdmin = async () => {
      try {
        const notificationMessage = `User ${deposit.user_id} created a deposit request of ${deposit.amount}`;

        const notifRes = await pool.query(
          `INSERT INTO admin_notifications (type, reference_id, message)
           VALUES ($1, $2, $3)
           RETURNING *`,
          ['deposit_request', deposit.id, notificationMessage]
        );

        console.log(`✅ Admin notification created:`, notifRes.rows[0]);
      } catch (err) {
        console.error(`❌ Failed to create admin notification for deposit ${deposit.id}:`, err.message);
      }
    };

    // Fire notification without blocking response
    notifyAdmin();

    // Respond immediately to user
    res.json({
      message: "Deposit request submitted",
      deposit: deposit
    });

    // --- Auto-approve logic ---
    try {
      const settingRes = await pool.query(
        "SELECT value FROM system_settings WHERE key='auto_payment_enabled'"
      );

      const autoPaymentEnabled = settingRes.rows.length && settingRes.rows[0].value === "true";

      if (autoPaymentEnabled) {
        setTimeout(() => {
          autoApproveDeposit(deposit.id);
        }, 10 * 1000);
      } else {
        console.log(`Deposit ${deposit.id} will stay pending: global auto-payment is OFF`);
      }
    } catch (err) {
      console.error("Failed to read global auto-payment setting:", err);
    }

  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});





router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        d.*,
        u.name AS user_name
      FROM deposits d
      JOIN users u ON u.id = d.user_id
      ORDER BY d.created_at DESC
    `);

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
router.patch("/:id/:action", async (req, res) => {
  const { id, action } = req.params;          // 'approve' or 'reject'
  const { ownerId, actionBy } = req.body;     // actionBy = username/admin name
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const depositResult = await client.query(
      `SELECT * FROM deposits WHERE id=$1 FOR UPDATE`,
      [id]
    );

    if (!depositResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Deposit not found" });
    }

    const deposit = depositResult.rows[0];

    if (deposit.status === action) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `Deposit already ${action}` });
    }

    // Owner wallet deduction (if not admin)
    if (ownerId) {
      const ownerResult = await client.query(
        `SELECT id, wallet, role FROM users WHERE id=$1 FOR UPDATE`,
        [ownerId]
      );

      if (!ownerResult.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Owner not found" });
      }

      const owner = ownerResult.rows[0];

      if (owner.role !== "admin" && parseFloat(deposit.amount) > 0) {
        if (parseFloat(owner.wallet) < parseFloat(deposit.amount)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Owner balance insufficient" });
        }

        if (action === "approved") {
          await client.query(
            `UPDATE users SET wallet = wallet - $1 WHERE id=$2`,
            [deposit.amount, ownerId]
          );
        }
      }
    }

    // Update deposit status
    await client.query(
      `UPDATE deposits SET status=$1 WHERE id=$2`,
      [action, id]
    );

    // Credit user wallet if approved
    if (action === "approved") {
      await client.query(
        `UPDATE users SET wallet = wallet + $1 WHERE id=$2`,
        [deposit.amount, deposit.user_id]
      );
    }

    // Record action in deposit_actions
    if (actionBy) {
      await client.query(
        `INSERT INTO deposit_actions (deposit_id, action_by, action_type, action_amount)
         VALUES ($1, $2, $3, $4)`,
        [id, actionBy, action, deposit.amount]
      );
    }

    // Commit transaction
    await client.query("COMMIT");

    res.json({ message: `Deposit ${action} successfully`, deposit_id: id });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});


// GET /deposit/:depositId/actions
router.get("/:depositId/actions", async (req, res) => {
  const { depositId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id, deposit_id, action_type, action_by, action_amount, created_at
       FROM deposit_actions
       WHERE deposit_id = $1
       ORDER BY created_at DESC`,
      [depositId]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch deposit actions" });
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
router.patch("/:id/rejected", async (req, res) => {
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





// GET /admin/notifications?unread=true
router.get("/admin/notifications", async (req, res) => {
  const { unread } = req.query;

  let query = "SELECT * FROM admin_notifications";
  const params = [];

  if (unread === "true") {
    query += " WHERE read = $1 ORDER BY created_at DESC";
    params.push(false);
  } else {
    query += " ORDER BY created_at DESC";
  }

  try {
    const result = await pool.query(query, params);
    res.json({ notifications: result.rows });
  } catch (err) {
    console.error("Failed to fetch admin notifications:", err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});
// PATCH /admin/notifications/:id/read
// PATCH /admin/notifications/:idOrRef/read
router.patch("/admin/notifications/:idOrRef/read", async (req, res) => {
  const { idOrRef } = req.params;

  try {
    // Try updating by ID first
    const result = await pool.query(
      "UPDATE admin_notifications SET read=true WHERE id=$1 OR reference_id=$1 RETURNING *",
      [idOrRef]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({
      message: "Notification marked as read",
      updated: result.rows,
    });
  } catch (err) {
    console.error("Failed to mark notification as read:", err);
    res.status(500).json({ error: "Failed to update notification" });
  }
});



export default router;
