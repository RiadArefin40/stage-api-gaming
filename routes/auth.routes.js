// import express from "express";
// import { pool } from "../db.js";

// const router = express.Router();

// // Login


// export default router;


import express from "express";
import { pool } from "../db.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const router = express.Router();

const JWT_SECRET = "your_super_secret_key"; // move to .env in production

// Login
router.post("/admin/login", async (req, res) => {
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

    // ⚠️ IMPORTANT: Compare hashed password

    
    const isMatch = user.password == password;
    if (!isMatch)
      return res.status(400).json({ error: "Invalid credentials" });

    // Create token (expire in 1 hour)
    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role
      }
    });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

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
