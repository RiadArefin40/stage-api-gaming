import axios from "axios";
import crypto from "crypto";
import https from "https";
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({  
    rejectUnauthorized: false  // allow self-signed certs
  })
});

const API_BASE_URL = process.env.PAYOUT_API_URL;
const API_KEY = process.env.PAYOUT_API_KEY;

// Generate SHA-256 hash of the raw JSON payload
export const generatePayloadHash = (payload) => {
  const jsonString = JSON.stringify(payload);
  console.log("[DEBUG] Payload JSON:", jsonString);
  const hash = crypto.createHash("sha256").update(jsonString).digest("hex");
  console.log("[DEBUG] Generated SHA-256 Hash:", hash);
  return hash;
};

// -------------------- CHECK DEPOSIT --------------------
export const checkDeposit = async (transaction_id) => {
  try {
    console.log("[DEBUG] Checking deposit for transaction_id:", transaction_id);

    const payload = { transaction_id: 'CLF35NMKQH' };
    const hash = generatePayloadHash(payload);


    console.log("[DEBUG] Sending request to Check Deposit API...", API_BASE_URL);
    const response = await axiosInstance.post(
      `${API_BASE_URL}bot/check-payout`,
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

    console.log("[DEBUG] Check Deposit API Response:", response.data);
    return response.data;

  } catch (err) {
    console.error("[ERROR] Check Deposit API Error:", err.response?.data || err.message);
    return { success: false, message: err.response?.data?.message || err.message };
  }
};

// -------------------- CONFIRM DEPOSIT --------------------
export const confirmDeposit = async (payout_id) => {
  try {
    console.log("[DEBUG] Confirming deposit for payout_id:", payout_id);

    const payload = { payout_id };
    const hash = generatePayloadHash(payload);

    console.log("[DEBUG] Sending request to Confirm Deposit API...");
    const response = await axiosInstance.post(
      `${API_BASE_URL}bot/confirm-payout`,
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

    console.log("[DEBUG] Confirm Deposit API Response:", response.data);
    return response.data;

  } catch (err) {
    console.error("[ERROR] Confirm Deposit API Error:", err.response?.data || err.message);
    return { success: false, message: err.response?.data?.message || err.message };
  }
};
