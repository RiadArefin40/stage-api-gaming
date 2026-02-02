// cron.ts
import cron from 'node-cron';
import { runAffiliateSettlement } from './jobs/affiliateSettlement.js';
import { getAffiliateCronConfig } from './config/affiliateCronConfig.js';
import { buildCronExpression } from './utils/cronBuilder.js';

let task= null;

export async function initAffiliateCron() {
  const config = await getAffiliateCronConfig();

  if (!config.enabled) {
    console.log('Affiliate cron disabled');
    return;
  }

  const expression = buildCronExpression(
    config.type,
    config.day,
    config.time
  );

  if (task) task.stop();

  task = cron.schedule(expression, async () => {
    console.log('Affiliate settlement cron started');
    await runAffiliateSettlement();
  });

  console.log('Affiliate cron scheduled:', expression);
}
