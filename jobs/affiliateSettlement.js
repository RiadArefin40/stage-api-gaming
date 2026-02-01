import { pool } from "../db.js";

const COMMISSION_PERCENT = Number(process.env.AFFILIATE_COMMISSION_PERCENT || 10);
const MIN_LOSS = Number(process.env.AFFILIATE_MIN_LOSS || 0);

// yesterday 00:00 → 23:59
function getDateRange() {
  const from = new Date();
  from.setDate(from.getDate() - 1);
  from.setHours(0, 0, 0, 0);

  const to = new Date(from);
  to.setHours(23, 59, 59, 999);

  return { from, to };
}

export async function runAffiliateSettlement() {
  const client = await pool.connect();
  const { from, to } = getDateRange();

  try {
    console.log("🔁 Affiliate settlement started", from, to);
    await client.query("BEGIN");

    // 1️⃣ Get referred users
    const usersRes = await client.query(`
      SELECT id, referred_by
      FROM users
      WHERE referred_by IS NOT NULL
    `);
console.log(`Found ${usersRes.rows.length} referred users`);
    for (const user of usersRes.rows) {
      // 2️⃣ Get referrer
      const refRes = await client.query(
        `SELECT id FROM users WHERE referral_code = $1`,
        [user.referred_by]
      );

      if (!refRes.rows.length) continue;
      const referrerId = refRes.rows[0].id;

      // 3️⃣ Prevent duplicate settlement
      const exists = await client.query(
        `
        SELECT 1 FROM affiliate_commissions
        WHERE referred_user_id = $1
          AND from_date = $2
          AND to_date = $3
        `,
        [user.id, from, to]
      );

      if (exists.rows.length) continue;

      // 4️⃣ Calculate deposits (bonus excluded)
      const depRes = await client.query(
        `
        SELECT COALESCE(SUM(amount - COALESCE(bonus_amount,0)),0) AS total_deposit
        FROM deposits
        WHERE user_id = $1
          AND status = 'approved'
          AND created_at BETWEEN $2 AND $3
        `,
        [user.id, from, to]
      );
console.log(`User ${user.id} - Total Deposit: ${depRes.rows[0].total_deposit}`);
      // 5️⃣ Calculate withdrawals
      const wdRes = await client.query(
        `
        SELECT COALESCE(SUM(amount),0) AS total_withdraw
        FROM withdrawals
        WHERE user_id = $1
          AND status = 'approved'
          AND created_at BETWEEN $2 AND $3
        `,
        [user.id, from, to]
      );
console.log(`User ${user.id} - Total Withdraw: ${wdRes.rows[0].total_withdraw}`);
      const totalDeposit = Number(depRes.rows[0].total_deposit);
      const totalWithdraw = Number(wdRes.rows[0].total_withdraw);
      const loss = totalDeposit - totalWithdraw;

      if (loss <= 0 || loss < MIN_LOSS) continue;

      const commission = Number(
        ((loss * COMMISSION_PERCENT) / 100).toFixed(2)
      );
console.log(`User ${user.id} - Loss: ${loss}, Commission: ${commission}`);
      // 6️⃣ Insert commission
      await client.query(
        `
        INSERT INTO affiliate_commissions
        (
          referrer_id,
          referred_user_id,
          total_deposit,
          total_withdraw,
          loss_amount,
          commission_percent,
          commission_amount,
          from_date,
          to_date
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `,
        [
          referrerId,
          user.id,
          totalDeposit,
          totalWithdraw,
          loss,
          COMMISSION_PERCENT,
          commission,
          from,
          to,
        ]
      );
    }

    await client.query("COMMIT");
    console.log("✅ Affiliate settlement completed");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Affiliate settlement failed", err);
  } finally {
    client.release();
  }
}
