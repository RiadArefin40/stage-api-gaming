import { pool } from "../db.js";

const MIN_LOSS = 0;

function getCurrentWeekUTC() {
  const now = new Date();
  const day = now.getUTCDay() || 7;

  const from = new Date(now);
  from.setUTCDate(now.getUTCDate() - day + 1);
  from.setUTCHours(0, 0, 0, 0);

  const to = new Date(from);
  to.setUTCDate(from.getUTCDate() + 6);
  to.setUTCHours(23, 59, 59, 999);

  return { from, to };
}

async function getCommissionPercent(client) {
  const res = await client.query(`
    SELECT value FROM system_settings
    WHERE key = 'affiliate_commission_percent'
  `);
  return Number(res.rows[0]?.value || 10);
}

export async function runAffiliateSettlement() {
  const client = await pool.connect();
  const { from, to } = getCurrentWeekUTC();

  try {
    console.log("🔁 Affiliate settlement", from.toISOString(), to.toISOString());

    const lock = await client.query(
      "SELECT pg_try_advisory_lock(7777777) acquired"
    );
    if (!lock.rows[0].acquired) return;

    await client.query("BEGIN");

    const COMMISSION_PERCENT = await getCommissionPercent(client);

    const users = await client.query(`
      SELECT id, referred_by
      FROM users
      WHERE referred_by IS NOT NULL
    `);

    for (const u of users.rows) {
      const ref = await client.query(
        "SELECT id FROM users WHERE referral_code = $1",
        [u.referred_by]
      );
      if (!ref.rows.length) continue;

      const exists = await client.query(`
        SELECT 1 FROM affiliate_commissions
        WHERE referred_user_id = $1
          AND from_date = $2
          AND to_date = $3
      `, [u.id, from, to]);

      if (exists.rowCount) continue;

      const dep = await client.query(`
        SELECT COALESCE(SUM(amount - COALESCE(bonus_amount,0)),0) d
        FROM deposits
        WHERE user_id = $1
          AND status='approved'
          AND created_at BETWEEN $2 AND $3
      `, [u.id, from, to]);

      const wd = await client.query(`
        SELECT COALESCE(SUM(amount),0) w
        FROM withdrawals
        WHERE user_id = $1
          AND status='approved'
          AND created_at BETWEEN $2 AND $3
      `, [u.id, from, to]);

      const deposit = Number(dep.rows[0].d);
      const withdraw = Number(wd.rows[0].w);
      const loss = deposit - withdraw;

      if (loss <= MIN_LOSS) continue;

      const commission = +(loss * COMMISSION_PERCENT / 100).toFixed(2);

      await client.query(`
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
          to_date,
          status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
      `, [
        ref.rows[0].id,
        u.id,
        deposit,
        withdraw,
        loss,
        COMMISSION_PERCENT,
        commission,
        from,
        to
      ]);
    }

    await client.query("COMMIT");
    console.log("✅ Settlement done");

  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
  } finally {
    await client.query("SELECT pg_advisory_unlock(7777777)");
    client.release();
  }
}
