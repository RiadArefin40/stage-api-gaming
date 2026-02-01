import { pool } from "../db.js";

const COMMISSION_PERCENT = Number(process.env.AFFILIATE_COMMISSION_PERCENT || 10);
const MIN_LOSS = Number(process.env.AFFILIATE_MIN_LOSS || 0);

// --------------------
// Get last 7 days in UTC
// --------------------
function getLast7DaysUTC() {
  const to = new Date();
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return { from, to };
}

// --------------------
// Run affiliate settlement
// --------------------
export async function runAffiliateSettlement() {
  const client = await pool.connect();
  const { from, to } = getLast7DaysUTC();

  try {
    console.log("🔁 Affiliate settlement started", from.toISOString(), to.toISOString());

    // --------------------
    // Advisory lock: prevents overlapping runs
    // --------------------
    const lockRes = await client.query("SELECT pg_try_advisory_lock(987654321) AS acquired");
    if (!lockRes.rows[0].acquired) {
      console.log("⏭ Another settlement is running, skipping this run");
      return;
    }

    await client.query("BEGIN");

    // --------------------
    // 1️⃣ Get all referred users
    // --------------------
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

      // 3️⃣ Prevent duplicate settlement (per user per 7-day window)
      const exists = await client.query(
        `SELECT 1 FROM affiliate_commissions
         WHERE referred_user_id = $1
           AND from_date = $2
           AND to_date = $3`,
        [user.id, from, to]
      );
      if (exists.rows.length) continue;

      // 4️⃣ Total deposits (bonus excluded)
      const depRes = await client.query(
        `
        SELECT COALESCE(SUM(amount - COALESCE(bonus_amount,0)),0) AS total_deposit
        FROM deposits
        WHERE user_id = $1
          AND status = 'approved'
          AND created_at >= $2
          AND created_at < $3
        `,
        [user.id, from, to]
      );
      const totalDeposit = Number(depRes.rows[0].total_deposit);

      // 5️⃣ Total withdrawals
      const wdRes = await client.query(
        `
        SELECT COALESCE(SUM(amount),0) AS total_withdraw
        FROM withdrawals
        WHERE user_id = $1
          AND status = 'approved'
          AND created_at >= $2
          AND created_at < $3
        `,
        [user.id, from, to]
      );
      const totalWithdraw = Number(wdRes.rows[0].total_withdraw);

      const loss = totalDeposit - totalWithdraw;

      // 6️⃣ Skip if no loss or below min loss
      if (loss <= 0 || loss < MIN_LOSS) continue;

      const commission = Number(((loss * COMMISSION_PERCENT) / 100).toFixed(2));

      console.log(`User ${user.id} - Loss: ${loss}, Commission: ${commission}`);

      // 7️⃣ Insert commission safely
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
        [referrerId, user.id, totalDeposit, totalWithdraw, loss, COMMISSION_PERCENT, commission, from, to]
      );
    }

    await client.query("COMMIT");
    console.log("✅ Affiliate settlement completed");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Affiliate settlement failed", err);
  } finally {
    // --------------------
    // Release advisory lock
    // --------------------
    try {
      await client.query("SELECT pg_advisory_unlock(987654321)");
    } catch (_) {}
    client.release();
  }
}
