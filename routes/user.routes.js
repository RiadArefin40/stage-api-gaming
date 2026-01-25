import express from "express";
import { pool } from "../db.js";
import { generateUniqueReferralCode } from "../utils/referral.js";

const router = express.Router();
const ALLOWED_PLATFORMS = ["telegram", "whatsapp", "messenger"];
const multer = require("multer");
const path = require("path");
const fs = require("fs");


// Upload folder
const uploadDir = "uploads/hero-sliders";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });


// Multer storage config
const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, uploadDir),
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
let { image_url, title = null, subtitle = null, link_url = null, position = 0, is_active = true } = req.body;


// Override image_url if a file is uploaded
if (req.file) image_url = "/" + req.file.path.replace(/\\/g, "/");


if (!image_url) return res.status(400).json({ success: false, message: "image_url or image file is required" });


const result = await pool.query(
`INSERT INTO hero_sliders (image_url, title, subtitle, link_url, position, is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
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


/**
 * CREATE event slider
 * POST /event-slider
 */
router.post("/event-slider", async (req, res) => {
  try {
    const {
      image_url,
      title = null,
      subtitle = null,
      link_url = null,
      position = 0,
      is_active = true,
    } = req.body;

    if (!image_url) {
      return res.status(400).json({
        success: false,
        message: "image_url is required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO event_sliders
      (image_url, title, subtitle, link_url, position, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
      `,
      [image_url, title, subtitle, link_url, position, is_active]
    );

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("EVENT SLIDER CREATE ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * UPDATE event slider
 * PUT /event-slider/:id
 */
router.put("/event-slider/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      image_url,
      title,
      subtitle,
      link_url,
      position,
      is_active,
    } = req.body;

    const result = await pool.query(
      `
      UPDATE event_sliders SET
        image_url = COALESCE($1, image_url),
        title = COALESCE($2, title),
        subtitle = COALESCE($3, subtitle),
        link_url = COALESCE($4, link_url),
        position = COALESCE($5, position),
        is_active = COALESCE($6, is_active),
        updated_at = NOW()
      WHERE id = $7
      RETURNING *;
      `,
      [image_url, title, subtitle, link_url, position, is_active, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Event slider not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("EVENT SLIDER UPDATE ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * DELETE event slider
 * DELETE /event-slider/:id
 */
router.delete("/event-slider/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM event_sliders WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Event slider not found",
      });
    }

    res.json({
      success: true,
      message: "Event slider deleted",
    });
  } catch (error) {
    console.error("EVENT SLIDER DELETE ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * ENABLE / DISABLE event slider
 * PATCH /event-slider/:id/status
 */
router.patch("/event-slider/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "is_active must be boolean",
      });
    }

    const result = await pool.query(
      `
      UPDATE event_sliders
      SET is_active = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *;
      `,
      [is_active, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Event slider not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("EVENT SLIDER STATUS ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * GET all event sliders (ADMIN)
 * GET /event-slider
 */
router.get("/event-slider", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM event_sliders ORDER BY position ASC"
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("EVENT SLIDER FETCH ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * GET active event sliders (FRONTEND)
 * GET /event-slider/active
 */
router.get("/event-slider/active", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT image_url, title, subtitle, link_url
      FROM event_sliders
      WHERE is_active = true
      ORDER BY position ASC
      `
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("ACTIVE EVENT SLIDER ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});



export default router;
