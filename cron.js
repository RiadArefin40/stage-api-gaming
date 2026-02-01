import cron from "node-cron";
import { runAffiliateSettlement } from "./jobs/affiliateSettlement.js";

// 🔥 every second (TESTING ONLY)
// cron.schedule("* * * * * *", async () => {
//   await runAffiliateSettlement();
// });

let running = false;

cron.schedule("* * * * * *", async () => {
  if (running) return;
  running = true;
  await runAffiliateSettlement();
  running = false;
});

