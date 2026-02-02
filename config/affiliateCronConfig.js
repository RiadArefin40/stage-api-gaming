import db from '../db';

export async function getAffiliateCronConfig() {
  const rows = await db('system_settings')
    .whereIn('key', [
      'affiliate_settlement_enabled',
      'affiliate_settlement_type',
      'affiliate_settlement_day',
      'affiliate_settlement_time',
    ]);

  const map= {};
  rows.forEach(row => {
    map[row.key] = row.value;
  });

  return {
    enabled: map.affiliate_settlement_enabled === 'true',
    type: map.affiliate_settlement_type,
    day: Number(map.affiliate_settlement_day || 0),
    time: map.affiliate_settlement_time || '00:05',
  };
}
