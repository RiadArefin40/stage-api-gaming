import axios from "axios";
import crypto from "crypto";

const API_BASE_URL = process.env.PAYOUT_API_URL || "https://demo.com.bd/api/v1";
const API_KEY = process.env.PAYOUT_API_KEY;

// Generate SHA-256 hash of the raw JSON payload
export const generatePayloadHash = (payload) => {
  const jsonString = JSON.stringify(payload);
  return crypto.createHash("sha256").update(jsonString).digest("hex");
};

// -------------------- CHECK DEPOSIT --------------------
export const checkDeposit = async (transaction_id) => {
  try {
    const payload = { transaction_id };
    const hash = generatePayloadHash(payload);

    const response = await axios.post(
      `${API_BASE_URL}/bot/check-payout`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": API_KEY,
          "X-PAYLOAD-HASH": hash,
        },
        timeout: 5000, // 5 seconds
      }
    );

    return response.data;

  } catch (err) {
    console.error("Check Deposit API Error:", err.response?.data || err.message);
    return { success: false, message: err.response?.data?.message || err.message };
  }
};

// -------------------- CONFIRM DEPOSIT --------------------
export const confirmDeposit = async (payout_id) => {
  try {
    const payload = { payout_id };
    const hash = generatePayloadHash(payload);

    const response = await axios.post(
      `${API_BASE_URL}`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": API_KEY,
          "X-PAYLOAD-HASH": hash,
        },
        timeout: 5000, // 5 seconds
      }
    );

    return response.data;

  } catch (err) {
    console.error("Confirm Deposit API Error:", err.response?.data || err.message);
    return { success: false, message: err.response?.data?.message || err.message };
  }
};
