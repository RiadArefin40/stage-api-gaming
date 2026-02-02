import { pool } from '../db.js';

export async function getAffiliateCronConfig() {
  const client = await pool.connect();

  try {
    const res = await client.query(
      `SELECT key, value
       FROM system_settings
       WHERE key IN (
         'affiliate_settlement_enabled',
         'affiliate_settlement_type',
         'affiliate_settlement_day',
         'affiliate_settlement_time'
       )`
    );

    const map = {};
    res.rows.forEach(row => {
      map[row.key] = row.value;
    });

    return {
      enabled: map.affiliate_settlement_enabled === 'true',
      type: map.affiliate_settlement_type || 'weekly',
      day: Number(map.affiliate_settlement_day || 1),
      time: map.affiliate_settlement_time || '00:05',
    };

  } finally {
    client.release();
  }
}
