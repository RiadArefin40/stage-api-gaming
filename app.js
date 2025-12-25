import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import depositRoutes from "./routes/deposit.routes.js";
import promoRoutes from "./routes/promos.routes.js"
import widthdrawRoutes from "./routes/widthdraw.routes.js"
import gameRoutes from "./routes/game.routes.js"
const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_, res) => res.send("Server running"));

app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/deposit", depositRoutes);
app.use("/promos", promoRoutes);
app.use("/withdrawals", widthdrawRoutes);
app.use("/games", gameRoutes);

app.post("/result", (req, res) => {
  console.log("🎮 GAME CALLBACK RECEIVED");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);

  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({
      error: "Empty body — callback not parsed",
    });
  }

  const {
    mobile,
    bet_amount,
    win_amount,
    game_uid,
    game_round,
    token,
    wallet_before,
    wallet_after,
    change,
    currency_code,
    timestamp,
  } = req.body;

  console.table({
    mobile,
    bet_amount,
    win_amount,
    game_uid,
    game_round,
    token,
    wallet_before,
    wallet_after,
    change,
    currency_code,
    timestamp,
  });

  return res.json({
    status: "success",
    message: "Callback received",
  });
});


export default app;
