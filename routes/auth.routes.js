import express from "express";
import { pool } from "../db.js";

const router = express.Router();

// Login
router.post("/login", async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password)
    return res.status(400).json({ error: "Name/phone and password required" });

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE name = $1 OR phone = $1",
      [identifier]
    );

    if (!result.rows.length)
      return res.status(400).json({ error: "Invalid credentials" });

    const user = result.rows[0];

    if (user.password !== password)
      return res.status(400).json({ error: "Invalid credentials" });

    res.json({
      message: "Login successful",
      user
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
