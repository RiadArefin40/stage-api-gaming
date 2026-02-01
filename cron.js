import cron from "node-cron";
import { runAffiliateSettlement } from "./jobs/affiliateSettlement.js";

// 🔥 every second (TESTING ONLY)
cron.schedule("* * * * * *", async () => {
  await runAffiliateSettlement();
});
