import express from "express";
import { pool } from "../db.js";
import { generateUniqueReferralCode } from "../utils/referral.js";

const router = express.Router();
const ALLOWED_PLATFORMS = ["telegram", "whatsapp", "messenger"];
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";


// __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Upload folder
const uploadDir = "uploads/hero-sliders";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const categoryUploadDir = "uploads/game-categories";
if (!fs.existsSync(categoryUploadDir)) fs.mkdirSync(categoryUploadDir, { recursive: true });

const gameUploadDir = "uploads/games";
if (!fs.existsSync(gameUploadDir)) fs.mkdirSync(gameUploadDir, { recursive: true });

const eventUploadDir = "uploads/event-sliders";
if (!fs.existsSync(eventUploadDir)) fs.mkdirSync(eventUploadDir, { recursive: true });

// Multer storage config
const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, uploadDir),
filename: (req, file, cb) => {
const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
cb(null, uniqueSuffix + path.extname(file.originalname));
},
});

const categoryStorage = multer.diskStorage({
destination: (req, file, cb) => cb(null, categoryUploadDir),
filename: (req, file, cb) => {
const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
cb(null, uniqueSuffix + path.extname(file.originalname));
},
});

const gameStorage = multer.diskStorage({
destination: (req, file, cb) => cb(null, gameUploadDir),
filename: (req, file, cb) => {
const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
cb(null, uniqueSuffix + path.extname(file.originalname));
},
});



const upload = multer({
storage,
fileFilter: (req, file, cb) => {
if (file.mimetype.startsWith("image/")) cb(null, true);
else cb(new Error("Only images are allowed"));
},
limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max file size
});

const categoryUpload = multer({
  storage: categoryStorage, // ← fixed here
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only images are allowed"));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

const gameUpload = multer({
storage:gameStorage,
fileFilter: (req, file, cb) => {
if (file.mimetype.startsWith("image/")) cb(null, true);
else cb(new Error("Only images are allowed"));
},
limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max file size
});

const eventStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, eventUploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const eventUpload = multer({
  storage: eventStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only images are allowed"));
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});


router.get("/headline", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM headline WHERE id = 1");
    res.json(result.rows[0]); // return the single row
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch headline" });
  }
});

// ---------------- UPDATE HEADLINE ----------------
router.put("/headline", async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: "Title is required" });

  try {
    const result = await pool.query(
      `UPDATE headline SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1 RETURNING *`,
      [title]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update headline" });
  }
});

// Create user
// router.post("/", async (req, res) => {
//   const { name, phone, password, referred_by, wallet } = req.body;

//   if (!name || !phone || !password)
//     return res.status(400).json({ error: "Missing fields" });

//   try {
//     // Check if user already exists
//     const exists = await pool.query(
//       "SELECT id FROM users WHERE phone=$1 OR name=$2",
//       [phone, name]
//     );

//     if (exists.rows.length)
//       return res.status(400).json({ error: "User already exists" });

//     // Validate referral code if provided
//     let validReferral = null;
//     if (referred_by) {
//       const ref = await pool.query(
//         "SELECT id FROM users WHERE referral_code = $1",
//         [referred_by]
//       );
//       if (!ref.rows.length)
//         return res.status(400).json({ error: "Invalid referral code" });

//       validReferral = referred_by;
//     }

//     // Generate unique referral code
//     const referral_code = await generateUniqueReferralCode();

//     // Insert user into users table
//     const result = await pool.query(
//       `INSERT INTO users (name, phone, password, referral_code, referred_by, wallet)
//        VALUES ($1,$2,$3,$4,$5,$6)
//        RETURNING *`,
//       [name, phone, password, referral_code, validReferral, wallet || 0]
//     );

//     const newUser = result.rows[0];

//     // Insert phone into user_phone_numbers table
//     await pool.query(
//       `INSERT INTO user_phone_numbers (user_id, phone)
//        VALUES ($1, $2)`,
//       [newUser.id, phone]
//     );

//     res.json({ message: "User created", user: newUser });
//   } catch (err) {
//     console.error("Error creating user:", err.message);
//     res.status(500).json({ error: err.message });
//   }
// });

router.post("/", async (req, res) => {
  const { name, phone, password, referred_by, wallet } = req.body;

  if (!name || !phone || !password)
    return res.status(400).json({ error: "Missing fields" });

  try {
    // 1️⃣ Check if user already exists
    const exists = await pool.query(
      "SELECT id FROM users WHERE phone=$1 OR name=$2",
      [phone, name]
    );
    if (exists.rows.length)
      return res.status(400).json({ error: "User already exists" });

    // 2️⃣ Validate referral code if provided
    let validReferral = null;
    let ownerId = null;
    if (referred_by) {
      const ref = await pool.query(
        "SELECT id FROM users WHERE referral_code = $1",
        [referred_by]
      );
      if (!ref.rows.length)
        return res.status(400).json({ error: "Invalid referral code" });

      validReferral = referred_by;
      ownerId = ref.rows[0].id;
    }

    // 3️⃣ Generate unique referral code
    const referral_code = await generateUniqueReferralCode();

    // 4️⃣ Insert new user
    const result = await pool.query(
      `INSERT INTO users (name, phone, password, referral_code, referred_by, wallet)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [name, phone, password, referral_code, validReferral, wallet || 0]
    );

    const newUser = result.rows[0];

    // 5️⃣ Insert phone into user_phone_numbers
    await pool.query(
      `INSERT INTO user_phone_numbers (user_id, phone)
       VALUES ($1, $2)`,
      [newUser.id, phone]
    );

    // 6️⃣ Insert referral bonuses if referral exists
    if (validReferral && ownerId) {
      // Get bonus amounts from settings
      const settingRes = await pool.query(
        "SELECT referred_bonus, owner_bonus FROM referral_settings LIMIT 1"
      );
      const setting = settingRes.rows[0] || { referred_bonus: 100, owner_bonus: 150 };



    await pool.query("UPDATE users SET wallet=$1 WHERE id=$2", [setting.referred_bonus, newUser.id]);
    // Notification
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read)
       VALUES ($1, $2, $3, $4, false)`,
      [newUser.id, "Referral Bonus", `You got ৳${setting.referred_bonus} referral bonus using the valid referral code.`, "success"]
    );

        await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read)
       VALUES ($1, $2, $3, $4, false)`,
      [ownerId, "Claim your Referral Bonus", `You got a new ৳${setting.owner_bonus} referral bonus. .`, "success"]
    );
      // Insert bonus for owner
      await pool.query(
        "INSERT INTO referral_bonuses (user_id, owner_id, amount) VALUES ($1,$2,$3)",
        [newUser.id, ownerId, setting.owner_bonus]
      );

      
      await pool.query(
        `INSERT INTO user_turnover_history (user_id, promo_id, amount, type, code, complete, active_turnover_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newUser.id, 9, setting.referred_bonus, 'default', '৫% ডিপোজিট বোনাস', false, setting.referred_bonus]
      );
    }

    res.json({ message: "User created", user: newUser });
  } catch (err) {
    console.error("Error creating user:", err.message);
    res.status(500).json({ error: err.message });
  }
});



// Get all users
router.get("/", async (_, res) => {
  const result = await pool.query("SELECT * FROM users");
  res.json(result.rows);
});

// Get referrals
// Get referrals with claimed/unclaimed bonus
// GET /users/:referral_code/referrals
router.get("/:referral_code/referrals", async (req, res) => {
  const { referral_code } = req.params;

  try {
    // 1️⃣ Get the referral code owner
    const ownerRes = await pool.query(
      "SELECT id AS owner_id, name AS owner_name, email AS owner_email, referral_code FROM users WHERE referral_code=$1",
      [referral_code]
    );
    const owner = ownerRes.rows[0] || null;

    if (!owner) {
      return res.status(404).json({ error: "Referral code owner not found" });
    }

    const owner_id = owner.owner_id;

    // 2️⃣ Get all users referred by this code
    const usersRes = await pool.query(
      "SELECT id, name, email, phone, wallet, created_at, referral_code FROM users WHERE referred_by=$1",
      [referral_code]
    );
    const users = usersRes.rows;

    // 3️⃣ For each user, get bonuses
    const bonusPromises = users.map(async (user) => {
      const bonusRes = await pool.query(
        "SELECT id, owner_id, amount, is_claimed FROM referral_bonuses WHERE user_id=$1",
        [user.id]
      );

      const bonuses = bonusRes.rows || [];

      const claimedBonus = bonuses
        .filter(b => b.is_claimed)
        .reduce((sum, b) => sum + Number(b.amount), 0);

      const unclaimedBonus = bonuses
        .filter(b => !b.is_claimed)
        .reduce((sum, b) => sum + Number(b.amount), 0);

      return {
        ...user,
        bonuses, // full bonus array
        claimed_bonus: claimedBonus,
        unclaimed_bonus: unclaimedBonus,
        owner_id // include referral code owner's ID
      };
    });

    const result = await Promise.all(bonusPromises);

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});



// POST /api/referral/claim/:referralId
// Claim a bonus by its bonus ID
// routes/referral-bonuses.js
router.post("/:bonusId/claim", async (req, res) => {
  const { bonusId } = req.params;

  try {
    // 1️⃣ Get the bonus
    const bonusRes = await pool.query(
      "SELECT * FROM referral_bonuses WHERE id=$1 AND is_claimed=false",
      [bonusId]
    );
    const bonus = bonusRes.rows[0];
    if (!bonus) return res.status(404).json({ error: "Bonus not found or already claimed" });

    // 2️⃣ Get the user
    const userRes = await pool.query("SELECT wallet FROM users WHERE id=$1", [bonus.user_id]);
    const user = userRes.rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    // 3️⃣ Get the owner
    const ownerRes = await pool.query("SELECT wallet FROM users WHERE id=$1", [bonus.owner_id]);
    const owner = ownerRes.rows[0];
    if (!owner) return res.status(404).json({ error: "Owner not found" });

    // 4️⃣ Update wallets
    const newWallet = parseFloat(user.wallet) + parseFloat(bonus.amount);
    const newOwnerWallet = parseFloat(owner.wallet) + parseFloat(bonus.amount);


    await pool.query("UPDATE users SET wallet=$1 WHERE id=$2", [newOwnerWallet, bonus.owner_id]);

  
    // 5️⃣ Mark bonus as claimed
    await pool.query(
      "UPDATE referral_bonuses SET is_claimed=true, updated_at=NOW() WHERE id=$1",
      [bonusId]
    );


      await pool.query(
        `INSERT INTO user_turnover_history (user_id, promo_id, amount, type, code, complete, active_turnover_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [bonus.owner_id, 9, bonus.amount, 'default', '৫% ডিপোজিট বোনাস', false, bonus.amount]
      );

    res.json({ success: true,  newOwnerWallet });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});







router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Check if user exists
    const userCheck = await pool.query("SELECT id FROM users WHERE id=$1", [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Delete related deposits first
    await pool.query("DELETE FROM deposits WHERE user_id=$1", [id]);

    // Delete the user
    await pool.query("DELETE FROM users WHERE id=$1", [id]);

    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error(err);

    // Foreign key violation
    if (err.code === "23503") {
      return res.status(400).json({ error: "Cannot delete user with related records." });
    }

    res.status(500).json({ error: "Failed to delete user" });
  }
});


// Update user
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, phone, role, wallet , password} = req.body;

  try {
    // 1. Get existing user
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE id = $1",
      [id]
    );

    if (!existingUser.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentUser = existingUser.rows[0];

    // 2. Only check duplicates if changed
    if (name !== currentUser.name || phone !== currentUser.phone) {
      const duplicateCheck = await pool.query(
        `
        SELECT id FROM users 
        WHERE (name = $1 OR phone = $2) 
        AND id != $3
        `,
        [name, phone, id]
      );

      if (duplicateCheck.rows.length) {
        return res
          .status(400)
          .json({ error: "Username or phone already in use" });
      }
    }

    // 3. Update user
const result = await pool.query(
  `
  UPDATE users
  SET 
    name = $1,
    phone = $2,
    role = $3,
    wallet = $4,
    password = $5
  WHERE id = $6
  RETURNING id, name, phone, role, wallet, referral_code, referred_by
  `,
  [name, phone, role, wallet, password, id]  // ✅ password first, then id
);

    res.json({
      message: "User updated successfully",
      user: result.rows[0],
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// Get user balance
// Get user balance and turnover
router.get("/:id/balance", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "SELECT wallet, turnover FROM users WHERE id = $1",
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const turnover = await pool.query(
      "SELECT * FROM user_turnover_history WHERE user_id = $1 ORDER BY created_at DESC",
      [id]
    );


    if (!result.rows.length) {
      return res.status(404).json({ error: "No turnover history found for this user" });
    }

  

    res.json({
      balance: result.rows[0].wallet,
      turnover: turnover.rows, // return turnover too
    });
    console.log('crypto block generation started for userId :' , id)
  } catch (err) {
    console.error("Balance API error:", err);
    res.status(500).json({ error: "Server error" });
  }
});



// Toggle active / deactive user
router.patch("/:id/toggle-status", async (req, res) => {
  const { id } = req.params;

  try {
    // Get current status
    const userResult = await pool.query(
      "SELECT is_block_user FROM users WHERE id = $1",
      [id]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentStatus = userResult.rows[0].is_block_user;
    const newStatus = !currentStatus;

    // Update status
    const updated = await pool.query(
      `
      UPDATE users
      SET is_block_user = $1
      WHERE id = $2
      RETURNING id, name, is_block_user
      `,
      [newStatus, id]
    );

    res.json({
      message: newStatus ? "User deactivated" : "User activated",
      user: updated.rows[0],
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to toggle user status" });
  }
});


// user phone numbers
router.post("/phone", async (req, res) => {
  const { user_id, phone } = req.body;

  if (!user_id || !phone) {
    return res.status(400).json({ error: "user_id and phone are required" });
  }

  try {
    const userExists = await pool.query(
      "SELECT phone FROM users WHERE id = $1",
      [user_id]
    );

    if (!userExists.rowCount) {
      return res.status(400).json({ error: "Invalid user" });
    }

    if (userExists.rows[0].phone === phone) {
      return res.status(400).json({
        error: "This phone is already your primary number",
      });
    }

    const count = await pool.query(
      "SELECT COUNT(*) FROM user_phone_numbers WHERE user_id = $1",
      [user_id]
    );

    if (parseInt(count.rows[0].count) >= 3) {
      return res.status(400).json({ error: "Maximum 3 phone numbers allowed" });
    }

    const exists = await pool.query(
      `SELECT 1 FROM user_phone_numbers WHERE user_id = $1 AND phone = $2`,
      [user_id, phone]
    );

    if (exists.rowCount) {
      return res.status(400).json({ error: "Phone number already added" });
    }

    const result = await pool.query(
      `INSERT INTO user_phone_numbers (user_id, phone)
       VALUES ($1, $2)
       RETURNING *`,
      [user_id, phone]
    );

    res.json({
      message: "Phone added. Please verify.",
      phone: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


//verify phone numbers
router.post("/phone/verify", async (req, res) => {
  const { user_id, phone } = req.body;

  if (!user_id || !phone) {
    return res.status(400).json({ error: "Missing data" });
  }

  try {
    const result = await pool.query(
      `UPDATE user_phone_numbers
       SET is_verified = true, verified_at = NOW()
       WHERE user_id = $1 AND phone = $2
       RETURNING *`,
      [user_id, phone]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Phone not found" });
    }

    res.json({
      message: "Phone verified",
      phone: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//delete if not verified
router.delete("/phone", async (req, res) => {
  try {
    const { user_id, phone } = req.body;

    if (!user_id || !phone)
      return res.status(400).json({ error: "Missing user_id or phone" });

    const uid = parseInt(user_id, 10);
    if (isNaN(uid)) return res.status(400).json({ error: "Invalid user_id" });

    const phoneTrimmed = String(phone).trim();

    const result = await pool.query(
      `DELETE FROM user_phone_numbers
       WHERE user_id=$1 AND phone=$2 AND is_verified=false
       RETURNING *`,
      [uid, phoneTrimmed] // ✅ user_id first, phone second
    );

    if (!result.rowCount) {
      return res.status(400).json({ error: "Cannot delete verified number or not found" });
    }

    res.json({ message: "Phone removed", phone: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete phone", details: err.message });
  }
});





// get all number

router.get("/phones/:user_id", async (req, res) => {
  const { user_id } = req.params;

  const result = await pool.query(
    `SELECT * FROM user_phone_numbers
     WHERE user_id = $1
     ORDER BY is_verified DESC, created_at ASC`,
    [user_id]
  );

  res.json(result.rows);
});



router.get("/referral-setting", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, referred_bonus, owner_bonus, created_at, updated_at FROM referral_settings LIMIT 1"
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Referral settings not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching referral settings:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/referral-setting", async (req, res) => {
  const { referred_bonus, owner_bonus } = req.body;

  if (referred_bonus == null || owner_bonus == null) {
    return res.status(400).json({ error: "Both referred_bonus and owner_bonus are required" });
  }

  try {
    // Check if a row exists
    const existing = await pool.query("SELECT id FROM referral_settings LIMIT 1");

    let result;
    if (existing.rows.length) {
      // Update existing
      result = await pool.query(
        `UPDATE referral_settings
         SET referred_bonus=$1, owner_bonus=$2, updated_at=NOW()
         WHERE id=$3
         RETURNING *`,
        [referred_bonus, owner_bonus, existing.rows[0].id]
      );
    } else {
      // Insert new
      result = await pool.query(
        `INSERT INTO referral_settings (referred_bonus, owner_bonus)
         VALUES ($1, $2)
         RETURNING *`,
        [referred_bonus, owner_bonus]
      );
    }

    res.json({ message: "Referral settings updated", settings: result.rows[0] });
  } catch (err) {
    console.error("Error updating referral settings:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/userbet/:user_id", async (req, res) => {
  const { user_id } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM user_bets WHERE user_id=$1",
      [user_id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// social link

router.post("/social-link", async (req, res) => {
  try {
    const { platform, group_link, is_active = true } = req.body;

    if (!platform || !group_link) {
      return res.status(400).json({
        success: false,
        message: "platform and group_link are required",
      });
    }

    if (!ALLOWED_PLATFORMS.includes(platform)) {
      return res.status(400).json({
        success: false,
        message: "Invalid platform",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO social_group_links (platform, group_link, is_active)
      VALUES ($1, $2, $3)
      ON CONFLICT (platform)
      DO UPDATE SET
        group_link = EXCLUDED.group_link,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING *;
      `,
      [platform, group_link, is_active]
    );

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("SOCIAL LINK UPSERT ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * GET all social group links (ADMIN)
 * GET /social-link
 */
router.get("/social-link", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM social_group_links ORDER BY platform"
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("SOCIAL LINK FETCH ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * GET active social links only (FRONTEND)
 * GET /social-link/active
 */
router.get("/social-link/active", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT platform, group_link FROM social_group_links WHERE is_active = true"
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("ACTIVE SOCIAL LINK ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * ENABLE / DISABLE platform
 * PATCH /social-link/:platform/status
 */
router.patch("/social-link/:platform/status", async (req, res) => {
  try {
    const { platform } = req.params;
    const { is_active } = req.body;

    if (!ALLOWED_PLATFORMS.includes(platform)) {
      return res.status(400).json({
        success: false,
        message: "Invalid platform",
      });
    }

    if (typeof is_active !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "is_active must be boolean",
      });
    }

    const result = await pool.query(
      `
      UPDATE social_group_links
      SET is_active = $1, updated_at = NOW()
      WHERE platform = $2
      RETURNING *;
      `,
      [is_active, platform]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Platform not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("SOCIAL LINK STATUS ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});


//  * CREATE hero slider
//  * POST /hero-slider
//  */
// router.post("/hero-slider", async (req, res) => {
//   try {
//     const {
//       image_url,
//       title = null,
//       subtitle = null,
//       link_url = null,
//       position = 0,
//       is_active = true,
//     } = req.body;

//     if (!image_url) {
//       return res.status(400).json({
//         success: false,
//         message: "image_url is required",
//       });
//     }

//     const result = await pool.query(
//       `
//       INSERT INTO hero_sliders
//       (image_url, title, subtitle, link_url, position, is_active)
//       VALUES ($1, $2, $3, $4, $5, $6)
//       RETURNING *;
//       `,
//       [image_url, title, subtitle, link_url, position, is_active]
//     );

//     res.json({
//       success: true,
//       data: result.rows[0],
//     });
//   } catch (error) {
//     console.error("HERO SLIDER CREATE ERROR:", error.message);
//     res.status(500).json({
//       success: false,
//       message: "Internal server error",
//     });
//   }
// });

/**
 * UPDATE hero slider
 * PUT /hero-slider/:id
 */
// router.put("/hero-slider/:id", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const {
//       image_url,
//       title,
//       subtitle,
//       link_url,
//       position,
//       is_active,
//     } = req.body;

//     const result = await pool.query(
//       `
//       UPDATE hero_sliders SET
//         image_url = COALESCE($1, image_url),
//         title = COALESCE($2, title),
//         subtitle = COALESCE($3, subtitle),
//         link_url = COALESCE($4, link_url),
//         position = COALESCE($5, position),
//         is_active = COALESCE($6, is_active),
//         updated_at = NOW()
//       WHERE id = $7
//       RETURNING *;
//       `,
//       [image_url, title, subtitle, link_url, position, is_active, id]
//     );

//     if (result.rowCount === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Slider not found",
//       });
//     }

//     res.json({
//       success: true,
//       data: result.rows[0],
//     });
//   } catch (error) {
//     console.error("HERO SLIDER UPDATE ERROR:", error.message);
//     res.status(500).json({
//       success: false,
//       message: "Internal server error",
//     });
//   }
// });

/**
 * DELETE hero slider
 * DELETE /hero-slider/:id
 */
// router.delete("/hero-slider/:id", async (req, res) => {
//   try {
//     const { id } = req.params;

//     const result = await pool.query(
//       "DELETE FROM hero_sliders WHERE id = $1 RETURNING id",
//       [id]
//     );

//     if (result.rowCount === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Slider not found",
//       });
//     }

//     res.json({
//       success: true,
//       message: "Slider deleted",
//     });
//   } catch (error) {
//     console.error("HERO SLIDER DELETE ERROR:", error.message);
//     res.status(500).json({
//       success: false,
//       message: "Internal server error",
//     });
//   }
// });

/**
 * ENABLE / DISABLE slider
 * PATCH /hero-slider/:id/status
 */
// router.patch("/hero-slider/:id/status", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { is_active } = req.body;

//     if (typeof is_active !== "boolean") {
//       return res.status(400).json({
//         success: false,
//         message: "is_active must be boolean",
//       });
//     }

//     const result = await pool.query(
//       `
//       UPDATE hero_sliders
//       SET is_active = $1, updated_at = NOW()
//       WHERE id = $2
//       RETURNING *;
//       `,
//       [is_active, id]
//     );

//     if (result.rowCount === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Slider not found",
//       });
//     }

//     res.json({
//       success: true,
//       data: result.rows[0],
//     });
//   } catch (error) {
//     console.error("HERO SLIDER STATUS ERROR:", error.message);
//     res.status(500).json({
//       success: false,
//       message: "Internal server error",
//     });
//   }
// });

/**
 * GET all sliders (ADMIN)
 * GET /hero-slider
 */


router.post("/hero-slider", upload.single("image"), async (req, res) => {
  try {
    const {
      title = null,
      subtitle = null,
      link_url = null,
      position = 0,
      is_active = true,
    } = req.body;

    if (!req.file)
      return res.status(400).json({ success: false, message: "Image required" });

    const image_url = `/uploads/hero-sliders/${req.file.filename}`;

    const result = await pool.query(
      `INSERT INTO hero_sliders
       (image_url, title, subtitle, link_url, position, is_active)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [image_url, title, subtitle, link_url, position, is_active]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("HERO SLIDER CREATE ERROR:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


router.put("/hero-slider/:id", upload.single("image"), async (req, res) => {
try {
const { id } = req.params;
const { image_url: bodyImageUrl, title, subtitle, link_url, position, is_active } = req.body;


let image_url = bodyImageUrl;


if (req.file) image_url = "/" + req.file.path.replace(/\\/g, "/");


const result = await pool.query(
`UPDATE hero_sliders SET
image_url = COALESCE($1, image_url),
title = COALESCE($2, title),
subtitle = COALESCE($3, subtitle),
link_url = COALESCE($4, link_url),
position = COALESCE($5, position),
is_active = COALESCE($6, is_active),
updated_at = NOW()
WHERE id = $7
RETURNING *;`,
[image_url, title, subtitle, link_url, position, is_active, id]
);


if (result.rowCount === 0) return res.status(404).json({ success: false, message: "Slider not found" });


res.json({ success: true, data: result.rows[0] });
} catch (error) {
console.error("HERO SLIDER UPDATE ERROR:", error.message);
res.status(500).json({ success: false, message: "Internal server error" });
}
});


router.get("/hero-slider", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM hero_sliders ORDER BY position ASC"
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("HERO SLIDER FETCH ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * GET active sliders (FRONTEND)
 * GET /hero-slider/active
 */
router.get("/hero-slider/active", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT image_url, title, subtitle, link_url
      FROM hero_sliders
      WHERE is_active = true
      ORDER BY position ASC
      `
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("ACTIVE HERO SLIDER ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});


router.delete("/hero-slider/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the slider first to get the image path
    const existing = await pool.query("SELECT * FROM hero_sliders WHERE id = $1", [id]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: "Slider not found" });

    const slider = existing.rows[0];

    // Delete the file from disk if exists
    if (slider.image_url) {
      const filePath = path.join(__dirname, slider.image_url.replace(/^\/+/, "")); // remove leading slash
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
          if (err) console.error("Failed to delete slider image:", err.message);
        });
      }
    }

    // Delete the DB record
    await pool.query("DELETE FROM hero_sliders WHERE id = $1", [id]);

    res.json({ success: true, message: "Slider deleted successfully" });
  } catch (error) {
    console.error("HERO SLIDER DELETE ERROR:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


/**
 * CREATE event slider
 * POST /event-slider
 */
// CREATE
router.post("/event-slider", eventUpload.single("image"), async (req, res) => {
  try {
    const { title = null, subtitle = null, link_url = null, position = 0, is_active = true } = req.body;

    if (!req.file)
      return res.status(400).json({ success: false, message: "Image is required" });

    const image_url = `/uploads/event-sliders/${req.file.filename}`;

    const result = await pool.query(
      `INSERT INTO event_sliders (image_url, title, subtitle, link_url, position, is_active)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [image_url, title, subtitle, link_url, position, is_active]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("EVENT SLIDER CREATE ERROR:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// UPDATE
router.put("/event-slider/:id", eventUpload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, subtitle, link_url, position, is_active } = req.body;

    let image_url = req.body.image_url || null;
    if (req.file) image_url = `/uploads/event-sliders/${req.file.filename}`;

    const result = await pool.query(
      `UPDATE event_sliders SET
        image_url = COALESCE($1, image_url),
        title = COALESCE($2, title),
        subtitle = COALESCE($3, subtitle),
        link_url = COALESCE($4, link_url),
        position = COALESCE($5, position),
        is_active = COALESCE($6, is_active),
        updated_at = NOW()
      WHERE id = $7
      RETURNING *`,
      [image_url, title, subtitle, link_url, position, is_active, id]
    );

    if (result.rowCount === 0)
      return res.status(404).json({ success: false, message: "Event slider not found" });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("EVENT SLIDER UPDATE ERROR:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE
router.delete("/event-slider/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query("DELETE FROM event_sliders WHERE id = $1 RETURNING id", [id]);

    if (result.rowCount === 0)
      return res.status(404).json({ success: false, message: "Event slider not found" });

    res.json({ success: true, message: "Event slider deleted" });
  } catch (error) {
    console.error("EVENT SLIDER DELETE ERROR:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ENABLE/DISABLE
router.patch("/event-slider/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== "boolean")
      return res.status(400).json({ success: false, message: "is_active must be boolean" });

    const result = await pool.query(
      `UPDATE event_sliders SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [is_active, id]
    );

    if (result.rowCount === 0)
      return res.status(404).json({ success: false, message: "Event slider not found" });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("EVENT SLIDER STATUS ERROR:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET all (ADMIN)
router.get("/event-slider", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM event_sliders ORDER BY position ASC");
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("EVENT SLIDER FETCH ERROR:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET active (FRONTEND)
router.get("/event-slider/active", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT image_url, title, subtitle, link_url FROM event_sliders WHERE is_active = true ORDER BY position ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("ACTIVE EVENT SLIDER ERROR:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


router.post(
  "/game-categories",
  categoryUpload.single("image"),
  async (req, res) => {
    try {
      const { title, position = 0, is_active = true } = req.body;

      if (!title)
        return res.status(400).json({ message: "Title is required" });

      if (!req.file)
        return res.status(400).json({ message: "Image is required" });

      const image_url = `/uploads/game-categories/${req.file.filename}`;

      const result = await pool.query(
        `INSERT INTO game_categories
         (title, image_url, position, is_active)
         VALUES ($1,$2,$3,$4)
         RETURNING *`,
        [title, image_url, position, is_active]
      );

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error("GAME CATEGORY CREATE ERROR:", err.message);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get("/game-categories", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM game_categories
       WHERE is_active = true
       ORDER BY position ASC, id DESC`
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put(
  "/game-categories/:id",
  categoryUpload.single("image"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { title, position = 0, is_active = true } = req.body;

      const existing = await pool.query(
        "SELECT * FROM game_categories WHERE id=$1",
        [id]
      );

      if (!existing.rows.length)
        return res.status(404).json({ message: "Category not found" });

      let image_url = existing.rows[0].image_url;

      if (req.file) {
        image_url = `/uploads/game-categories/${req.file.filename}`;
        // optional: delete old image here
      }

      const result = await pool.query(
        `UPDATE game_categories
         SET title=$1, image_url=$2, position=$3, is_active=$4, updated_at=now()
         WHERE id=$5
         RETURNING *`,
        [title, image_url, position, is_active, id]
      );

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);



router.delete("/game-categories/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT image_url FROM game_categories WHERE id=$1",
      [id]
    );

    if (!result.rows.length)
      return res.status(404).json({ message: "Not found" });

    const imagePath = path.join(
      __dirname,
      "..",
      result.rows[0].image_url
    );

    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);

    await pool.query("DELETE FROM game_categories WHERE id=$1", [id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});



// CREATE game
router.post(
  "/games",
  gameUpload.single("image"),
  async (req, res) => {
    try {
      let {
        category_id,
        parent_id = null,
        uid,
        title,
        position = 0,
        is_active = true,
        is_provider = false,
      } = req.body;

      /* ---------------- NORMALIZE INPUT ---------------- */

      // normalize UID: empty / whitespace → NULL
      uid =
        typeof uid === "string" && uid.trim() !== ""
          ? uid.trim()
          : null;

      // normalize booleans (FormData sends strings)
      is_active = is_active === true || is_active === "true";
      is_provider = is_provider === true || is_provider === "true";

      // normalize numbers
      position = Number(position) || 0;
      category_id = Number(category_id);
      parent_id = parent_id ? Number(parent_id) : null;

      /* ---------------- VALIDATION ---------------- */

      if (!category_id || !title) {
        console.warn("⚠️ Missing required fields", req.body);
        return res.status(400).json({
          message: "Missing required fields",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          message: "Image is required",
        });
      }

      /* ---------------- CATEGORY CHECK ---------------- */

      const cat = await pool.query(
        "SELECT id FROM game_categories WHERE id = $1",
        [category_id]
      );

      if (!cat.rows.length) {
        return res.status(400).json({
          message: "Invalid category",
        });
      }

      /* ---------------- PARENT CHECK ---------------- */

      if (parent_id) {
        const parent = await pool.query(
          "SELECT id, is_provider FROM games WHERE id = $1",
          [parent_id]
        );

        if (!parent.rows.length || !parent.rows[0].is_provider) {
          return res.status(400).json({
            message: "Invalid parent provider game",
          });
        }
      }

      /* ---------------- UID UNIQUENESS ---------------- */

      // only check when uid has a real value
      if (uid !== null) {
        const exists = await pool.query(
          "SELECT 1 FROM games WHERE uid = $1 LIMIT 1",
          [uid]
        );

        if (exists.rows.length) {
          return res.status(400).json({
            message: "UID already exists",
          });
        }
      }

      /* ---------------- INSERT ---------------- */

      const image_url = `/uploads/games/${req.file.filename}`;

      const result = await pool.query(
        `
        INSERT INTO games
          (category_id, parent_id, uid, title, image_url, position, is_active, is_provider)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *
        `,
        [
          category_id,
          parent_id,
          uid, // NULL or unique value
          title,
          image_url,
          position,
          is_active,
          is_provider,
        ]
      );

      return res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (err) {
      // handle unique index violation (extra safety)
      if (err.code === "23505") {
        return res.status(400).json({
          message: "UID already exists",
        });
      }

      console.error("GAME CREATE ERROR:", err);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }
);


// UPDATE game
router.put(
  "/games/:id",
  gameUpload.single("image"),
  async (req, res) => {
    try {
      const { id } = req.params;

      let {
        category_id,
        parent_id = null,
        uid,
        title,
        position = 0,
        is_active = true,
        is_provider = false,
      } = req.body;

      /* ---------------- NORMALIZE INPUT ---------------- */

      // normalize UID ("" / whitespace → NULL)
      uid =
        typeof uid === "string" && uid.trim() !== ""
          ? uid.trim()
          : null;

      // normalize booleans (FormData)
      is_active = is_active === true || is_active === "true";
      is_provider = is_provider === true || is_provider === "true";

      // normalize numbers
      position = Number(position) || 0;
      category_id = Number(category_id);
      parent_id = parent_id ? Number(parent_id) : null;

      /* ---------------- REQUIRED VALIDATION ---------------- */

      if (!category_id || !title) {
        return res.status(400).json({
          message: "Missing required fields",
        });
      }

      /* ---------------- EXISTING GAME ---------------- */

      const existing = await pool.query(
        "SELECT * FROM games WHERE id = $1",
        [id]
      );

      if (!existing.rows.length) {
        return res.status(404).json({
          message: "Game not found",
        });
      }

      const oldGame = existing.rows[0];

      /* ---------------- CATEGORY CHECK ---------------- */

      const cat = await pool.query(
        "SELECT id FROM game_categories WHERE id = $1",
        [category_id]
      );

      if (!cat.rows.length) {
        return res.status(400).json({
          message: "Invalid category",
        });
      }

      /* ---------------- PARENT CHECK ---------------- */

      if (parent_id) {
        // prevent self-parenting
        if (parent_id === Number(id)) {
          return res.status(400).json({
            message: "Game cannot be its own parent",
          });
        }

        const parent = await pool.query(
          "SELECT id, is_provider FROM games WHERE id = $1",
          [parent_id]
        );

        if (!parent.rows.length || !parent.rows[0].is_provider) {
          return res.status(400).json({
            message: "Invalid parent provider game",
          });
        }
      }

      /* ---------------- UID UNIQUENESS ---------------- */

      // only when uid has a real value and changed
      if (uid !== null && uid !== oldGame.uid) {
        const exists = await pool.query(
          "SELECT 1 FROM games WHERE uid = $1 AND id <> $2 LIMIT 1",
          [uid, id]
        );

        if (exists.rows.length) {
          return res.status(400).json({
            message: "UID already exists",
          });
        }
      }

      /* ---------------- IMAGE ---------------- */

      let image_url = oldGame.image_url;
      if (req.file) {
        image_url = `/uploads/games/${req.file.filename}`;
      }

      /* ---------------- UPDATE ---------------- */

      const result = await pool.query(
        `
        UPDATE games
        SET
          category_id = $1,
          parent_id   = $2,
          uid         = $3,
          title       = $4,
          image_url   = $5,
          position    = $6,
          is_active   = $7,
          is_provider = $8,
          updated_at  = now()
        WHERE id = $9
        RETURNING *
        `,
        [
          category_id,
          parent_id,
          uid, // NULL or unique value
          title,
          image_url,
          position,
          is_active,
          is_provider,
          id,
        ]
      );

      return res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (err) {
      // unique index safety
      if (err.code === "23505") {
        return res.status(400).json({
          message: "UID already exists",
        });
      }

      console.error("GAME UPDATE ERROR:", err);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }
);




router.get("/game-categories/:id/games", async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch games with category title
    const result = await pool.query(
      `SELECT g.*, c.title AS category_title
       FROM games g
       JOIN game_categories c ON g.category_id = c.id
       WHERE g.category_id = $1
       ORDER BY g.position ASC, g.id DESC`,
      [id]
    );

    res.json({
      category_id: id,
      category_title: result.rows[0]?.category_title || null,
      games: result.rows,
    });
  } catch (err) {
    console.error("FETCH GAMES ERROR:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});





router.delete("/games/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT image_url FROM games WHERE id=$1",
      [req.params.id]
    );

    if (!result.rows.length)
      return res.status(404).json({ message: "Game not found" });

    const imagePath = path.join(__dirname, "..", result.rows[0].image_url);

    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);

    await pool.query("DELETE FROM games WHERE id=$1", [req.params.id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.post("/:id/set-once", async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, dob } = req.body;

    // Ensure exactly one field is provided
    const fieldsProvided = [full_name, dob].filter(v => v !== undefined);
    if (fieldsProvided.length !== 1) {
      return res.status(400).json({
        message: "Provide exactly one field: full_name OR dob",
      });
    }

    // Validate DOB if provided
    if (dob && isNaN(Date.parse(dob))) {
      return res.status(400).json({ message: "Invalid DOB format" });
    }

    // Fetch existing user
    const userRes = await pool.query(
      "SELECT full_name, dob FROM users WHERE id = $1",
      [id]
    );

    if (!userRes.rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userRes.rows[0];

    // Determine which field to update
    let fieldName, fieldValue;

    if (full_name !== undefined) {
      if (user.full_name) {
        return res.status(400).json({ message: "Full name already set" });
      }
      fieldName = "full_name";
      fieldValue = full_name.trim();
    } else {
      if (user.dob) {
        return res.status(400).json({ message: "DOB already set" });
      }
      fieldName = "dob";
      fieldValue = dob;
    }

    // Update the field
    const result = await pool.query(
      `UPDATE users
       SET ${fieldName} = $1,
           updated_at = now()
       WHERE id = $2
       RETURNING id, full_name, dob`,
      [fieldValue, id]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("SET ONCE ERROR:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.patch("/affiliate/:id/approve", async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const commissionRes = await client.query(
      `SELECT * FROM affiliate_commissions WHERE id=$1 FOR UPDATE`,
      [id]
    );

    if (!commissionRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Commission not found" });
    }

    const commission = commissionRes.rows[0];
    if (commission.status === "approved") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Already approved" });
    }

    // Credit referrer wallet
    await client.query(
      `UPDATE users SET wallet = wallet + $1 WHERE id=$2`,
      [commission.commission_amount, commission.referrer_id]
    );

    // Update commission status
    await client.query(
      `UPDATE affiliate_commissions SET status='approved', approved_at=NOW() WHERE id=$1`,
      [id]
    );

    // Notification
    await client.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read)
       VALUES ($1,'Commission Approved', $2, 'success', false)`,
      [commission.referrer_id, `Your affiliate commission of ৳${commission.commission_amount} has been approved.`]
    );

    await client.query("COMMIT");
    res.json({ message: "Commission approved successfully" });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});
router.patch("/affiliate/:id/reject", async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const commissionRes = await client.query(
      `SELECT * FROM affiliate_commissions WHERE id=$1 FOR UPDATE`,
      [id]
    );
    if (!commissionRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Commission not found" });
    }

    await client.query(
      `UPDATE affiliate_commissions SET status='rejected', approved_at=NOW() WHERE id=$1`,
      [id]
    );

    // Notification
    await client.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read)
       VALUES ($1,'Commission Rejected', $2, 'error', false)`,
      [commissionRes.rows[0].referrer_id, `Your affiliate commission of ৳${commissionRes.rows[0].commission_amount} was rejected.`]
    );

    await client.query("COMMIT");
    res.json({ message: "Commission rejected successfully" });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});
router.get("/affiliate/balance/:userId", async (req, res) => {
  const { userId } = req.params;
  const client = await pool.connect();

  try {
    const pendingRes = await client.query(
      `SELECT COALESCE(SUM(commission_amount),0) AS pending
       FROM affiliate_commissions
       WHERE referrer_id=$1 AND status='pending'`,
      [userId]
    );

    const approvedRes = await client.query(
      `SELECT COALESCE(SUM(commission_amount),0) AS approved
       FROM affiliate_commissions
       WHERE referrer_id=$1 AND status='approved'`,
      [userId]
    );

    res.json({
      pending_balance: Number(pendingRes.rows[0].pending),
      approved_balance: Number(approvedRes.rows[0].approved),
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

// GET all commissions
router.get("/affiliate/commissions", async (req, res) => {
  const { status, from, to } = req.query;
  let query = `SELECT ac.*, 
                      u1.name AS referrer_name,
                      u2.name AS referred_name
               FROM affiliate_commissions ac
               JOIN users u1 ON ac.referrer_id = u1.id
               JOIN users u2 ON ac.referred_user_id = u2.id
               WHERE 1=1`;
  const params = [];

  if (status) {
    params.push(status);
    query += ` AND ac.status = $${params.length}`;
  }

  if (from) {
    params.push(from);
    query += ` AND ac.from_date >= $${params.length}`;
  }

  if (to) {
    params.push(to);
    query += ` AND ac.to_date <= $${params.length}`;
  }

  try {
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch commissions" });
  }
});

// GET /affiliate/commission/:userId
// Node/Express example
router.get("/:referral_code/commissions", async (req, res) => {
  const { referral_code } = req.params;
  try {
    const commissions = await pool.query(`
      SELECT u.id as user_id, u.name, u.email, u.phone,
             SUM(CASE WHEN ac.is_claimed THEN ac.amount ELSE 0 END) as claimed_bonus,
             SUM(CASE WHEN NOT ac.is_claimed THEN ac.amount ELSE 0 END) as unclaimed_bonus
      FROM users u
      LEFT JOIN affiliate_commissions ac ON ac.user_id = u.id
      WHERE u.referral_code = $1
      GROUP BY u.id
    `, [referral_code]);

    res.json(commissions.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch commissions" });
  }
});

// GET /users/:user_id/commission-summary
router.get("/:user_id/commission-summary", async (req, res) => {
  const { user_id } = req.params;
  try {
    const result = await pool.query(`
      SELECT 
        COALESCE(SUM(amount),0) as total_commission,
        COALESCE(SUM(CASE WHEN is_claimed THEN amount ELSE 0 END),0) as claimed,
        COALESCE(SUM(CASE WHEN NOT is_claimed THEN amount ELSE 0 END),0) as unclaimed
      FROM affiliate_commissions
      WHERE user_id = $1
    `, [user_id]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch commission summary" });
  }
});


router.post('/affiliate/settlement/run', async (req, res) => {
  try {
    await runAffiliateSettlement();
    res.json({
      success: true,
      message: 'Affiliate settlement executed successfully',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Failed to run settlement',
    });
  }
});

// --------------------
// GET cron config
// --------------------
router.get('/affiliate-cron', async (req, res) => {
  try {
    const client = await pool.connect();

    const result = await client.query(`
      SELECT key, value
      FROM system_settings
      WHERE key IN (
        'affiliate_settlement_enabled',
        'affiliate_settlement_type',
        'affiliate_settlement_day',
        'affiliate_settlement_time'
      )
    `);

    client.release();

    const map = {};
    result.rows.forEach(row => (map[row.key] = row.value));

    res.json({
      enabled: map.affiliate_settlement_enabled === 'true',
      type: map.affiliate_settlement_type || 'weekly',
      day: Number(map.affiliate_settlement_day || 1),
      time: map.affiliate_settlement_time || '00:05',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch cron config' });
  }
});

// --------------------
// PATCH / UPDATE cron config
// --------------------
router.patch('/affiliate-cron', async (req, res) => {
  const { enabled, type, day, time } = req.body;

  if (!['daily', 'weekly', 'monthly'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type' });
  }
  if (day < 0 || day > 7) {
    return res.status(400).json({ error: 'Invalid day (0-7)' });
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ error: 'Invalid time (HH:MM)' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updates = [
      ['affiliate_settlement_enabled', enabled ? 'true' : 'false'],
      ['affiliate_settlement_type', type],
      ['affiliate_settlement_day', day.toString()],
      ['affiliate_settlement_time', time],
    ];

    for (const [key, value] of updates) {
      await client.query(
        `INSERT INTO system_settings(key, value)
         VALUES ($1, $2)
         ON CONFLICT (key)
         DO UPDATE SET value = EXCLUDED.value`,
        [key, value]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Affiliate cron config updated successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to update cron config' });
  } finally {
    client.release();
  }
});
router.post('/sms', async (req, res) => {
  const { type, sender, message, timestamp } = req.body;

  if (!sender || !message) {
    return res.status(400).json({ error: 'Invalid SMS payload' });
  }
console.log('Received SMS:', { type, sender, message, timestamp });
  const client = await pool.connect();
  try {
    await client.query(
      `
      INSERT INTO incoming_sms (type, sender, message, received_at)
      VALUES ($1, $2, $3, $4)
      `,
      [
        type || 'SMS',
        sender,
        message,
        timestamp ? new Date(timestamp) : new Date()
      ]
    );

    res.json({ message: 'SMS stored successfully' });
  } catch (err) {
    console.error('SMS insert failed:', err);
    res.status(500).json({ error: 'Failed to store SMS' });
  } finally {
    client.release();
  }
});
router.get('/admin/sms', async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        id,
        type,
        sender,
        message,
        received_at,
        created_at
      FROM incoming_sms
      ORDER BY received_at DESC
      LIMIT 500
    `);

    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch SMS:', err);
    res.status(500).json({ error: 'Failed to fetch SMS' });
  } finally {
    client.release();
  }
});


router.get("/admin/chats", async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        c.id,
        c.user_id,
        c.status,
        MAX(m.created_at) AS last_message_at,
        COUNT(*) FILTER (WHERE m.sender = 'user') AS user_messages
      FROM live_chats c
      LEFT JOIN live_chat_messages m ON m.chat_id = c.id
      GROUP BY c.id
      ORDER BY last_message_at DESC
      LIMIT 200
    `);

    res.json(rows);
  } catch (err) {
    console.error("Failed to fetch chats:", err);
    res.status(500).json({ error: "Failed to fetch chats" });
  } finally {
    client.release();
  }
});

router.get("/admin/chats/:chatId/messages", async (req, res) => {
  const { chatId } = req.params;
  const client = await pool.connect();

  try {
    const { rows } = await client.query(
      `
      SELECT
        id,
        sender,
        message,
        created_at
      FROM live_chat_messages
      WHERE chat_id = $1
      ORDER BY created_at ASC
      LIMIT 500
      `,
      [chatId]
    );

    res.json(rows);
  } catch (err) {
    console.error("Failed to fetch messages:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  } finally {
    client.release();
  }
});

router.post("/admin/chats/:chatId/message", async (req, res) => {
  const { chatId } = req.params;
  const { message } = req.body;

  const client = await pool.connect();

  try {
    const { rows } = await client.query(
      `
      INSERT INTO live_chat_messages (chat_id, sender, message)
      VALUES ($1, 'support', $2)
      RETURNING *
      `,
      [chatId, message]
    );

    // 🔔 Emit to room after insert
    req.io.to(chatId).emit("receive_message", rows[0]);

    console.log(`[DEBUG] Admin message emitted to room ${chatId}:`, rows[0]);

    res.json(rows[0]);
  } catch (err) {
    console.error("Failed to send message:", err);
    res.status(500).json({ error: "Failed to send message" });
  } finally {
    client.release();
  }
});




// ----------------- ROUTES -----------------
// Example: init chat for user
router.post("/chat/init", async (req, res) => {
  const { user_id } = req.body;
  const client = await pool.connect();
  try {
    const existing = await client.query(
      `SELECT * FROM live_chats WHERE user_id = $1 AND status = 'open' LIMIT 1`,
      [user_id]
    );

    if (existing.rows.length) return res.json(existing.rows[0]);

    const { rows } = await client.query(
      `INSERT INTO live_chats (id, user_id) VALUES (gen_random_uuid(), $1) RETURNING *`,
      [user_id]
    );

    res.json(rows[0]);
  } finally {
    client.release();
  }
});

// Example: get messages
router.get("/chat/:user_id/:chatId/messages", async (req, res) => {
  const { chatId, user_id } = req.params;
  const client = await pool.connect();
  try {
    const chat = await client.query(
      `SELECT 1 FROM live_chats WHERE id = $1 AND user_id = $2`,
      [chatId, user_id]
    );

    if (!chat.rowCount) return res.status(403).json({ error: "Access denied" });

    const { rows } = await client.query(
      `SELECT id, sender, message, created_at FROM live_chat_messages WHERE chat_id = $1 ORDER BY created_at ASC`,
      [chatId]
    );

    res.json(rows);
  } finally {
    client.release();
  }
});

router.post("/chat/:user_id/:chatId/message", async (req, res) => {
  const { chatId } = req.params;
  const { message } = req.body;
  const { user_id } = req.params;
  const client = await pool.connect();

  try {
    // Ownership check
    const chat = await client.query(
      `SELECT 1 FROM live_chats WHERE id = $1 AND user_id = $2 AND status = 'open'`,
      [chatId, user_id]
    );

    if (!chat.rowCount) {
      return res.status(403).json({ error: "Chat closed or forbidden" });
    }

    const { rows } = await client.query(
      `INSERT INTO live_chat_messages (chat_id, sender, message)
       VALUES ($1, 'user', $2)
       RETURNING *`,
      [chatId, message]
    );

    // socket emit later
    req.io?.to(chatId).emit("receive_message", rows[0]);

    res.json(rows[0]);
  } finally {
    client.release();
  }
});



export default router;
