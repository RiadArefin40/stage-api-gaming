import crypto from "crypto";
import { pool } from "../db.js";

export async function generateUniqueReferralCode() {
  let code;
  let exists = true;

  while (exists) {
    code = crypto.randomBytes(4).toString("hex").toUpperCase();
    const result = await pool.query(
      "SELECT 1 FROM users WHERE referral_code = $1",
      [code]
    );
    exists = result.rows.length > 0;
  }

  return code;
}
