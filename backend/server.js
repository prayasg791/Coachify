import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import connectDB from "./src/config/db.js";
import { startReminderJob, stopReminderJob } from "./src/jobs/reminder.job.js";
import { logError } from "./src/utils/logger.js";
import authRoutes from "./src/routes/auth.routes.js";
import feeRoutes from "./src/routes/fee.routes.js";
import paymentRoutes from "./src/routes/payment.routes.js";
import refundRoutes from "./src/routes/refund.routes.js";
import attendanceRoutes from "./src/routes/attendance.routes.js";
import testScoreRoutes from "./src/routes/testScore.routes.js";
import dashboardRoutes from "./src/routes/dashboard.routes.js";
import studentRoutes from "./src/routes/student.routes.js";
import riskRoutes from "./src/routes/risk.routes.js";
import parentRoutes from "./src/routes/parent.routes.js";
import reminderRoutes from "./src/routes/reminder.routes.js";
import receiptRoutes from "./src/routes/receipt.routes.js";
import reportsRoutes from "./src/routes/reports.routes.js";

export const validateRuntimeConfig = (env = process.env) => {
  if (!env.MONGO_URI || !/^mongodb(?:\+srv)?:\/\//.test(env.MONGO_URI)) {
    throw new Error("MONGO_URI must be a valid MongoDB connection URI");
  }
  if (typeof env.JWT_SECRET !== "string" || Buffer.byteLength(env.JWT_SECRET) < 32) {
    throw new Error("JWT_SECRET must contain at least 32 bytes");
  }
  const nodeEnv = env.NODE_ENV || "development";
  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error("NODE_ENV must be development, test, or production");
  }
  const port = env.PORT === undefined ? 5000 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }
  const corsOrigins = (env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
  if (nodeEnv === "production") {
    if (!corsOrigins.length || corsOrigins.includes("*")) {
      throw new Error("CORS_ORIGINS must list one or more trusted production origins");
    }
    for (const origin of corsOrigins) {
      let parsed;
      try { parsed = new URL(origin); } catch { throw new Error("CORS_ORIGINS contains an invalid URL"); }
      if (parsed.protocol !== "https:" || parsed.origin !== origin) {
        throw new Error("Production CORS origins must be exact HTTPS origins");
      }
    }
  }

  const taxability = env.INSTITUTE_GST_TAXABILITY || "NOT_CONFIGURED";
  if (!["NOT_CONFIGURED", "TAXABLE", "NON_TAXABLE"].includes(taxability)) {
    throw new Error("INSTITUTE_GST_TAXABILITY has an invalid value");
  }
  if ((env.INSTITUTE_NAME && !env.INSTITUTE_ADDRESS) || (!env.INSTITUTE_NAME && env.INSTITUTE_ADDRESS)) {
    throw new Error("INSTITUTE_NAME and INSTITUTE_ADDRESS must be configured together");
  }
  if (taxability === "TAXABLE") {
    const rateBps = Number(env.INSTITUTE_GST_RATE_BPS);
    if (!Number.isSafeInteger(rateBps) || rateBps <= 0 || !["INCLUSIVE", "EXCLUSIVE"].includes(env.INSTITUTE_GST_TREATMENT)) {
      throw new Error("Taxable GST configuration requires a positive rate in basis points and a valid treatment");
    }
  }
  return { nodeEnv, port, corsOrigins };
};

const app = express();
app.disable("x-powered-by");
const configuredOrigins = (process.env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || process.env.NODE_ENV !== "production" || configuredOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  credentials: false,
  maxAge: 600,
}));
app.use(express.json({ limit: "1mb" }));
app.use(async (req, res, next) => {
  if (req.path === "/" || req.path === "/health") return next();
  try {
    validateRuntimeConfig();
    await connectDB();
    return next();
  } catch {
    return res.status(503).json({ success: false, message: "Service unavailable" });
  }
});
app.use("/api/auth", authRoutes);
app.use("/api/fees", feeRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/refunds", refundRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/tests", testScoreRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/risk", riskRoutes);
app.use("/api/parent", parentRoutes);
app.use("/api/reminders", reminderRoutes);
app.use("/api/receipts", receiptRoutes);
app.use("/api/reports/accounts", reportsRoutes);

app.get("/health", async (_req, res) => {
  try {
    validateRuntimeConfig();
    await connectDB();
    const ready = mongoose.connection.readyState === 1;
    return res.status(ready ? 200 : 503).json({ status: ready ? "ok" : "not_ready" });
  } catch {
    return res.status(503).json({ status: "not_ready" });
  }
});
app.get("/", (_req, res) => res.status(200).json({ success: true, message: "Coachify API is running" }));

let httpServer;
let shutdownStarted = false;
export const startServer = async () => {
  const config = validateRuntimeConfig();
  await connectDB();
  startReminderJob();
  httpServer = await new Promise((resolve, reject) => {
    const server = app.listen(config.port, () => resolve(server));
    server.once("error", reject);
  });
  console.log(`Server listening on port ${config.port}.`);
  return httpServer;
};

export const shutdown = async (signal = "shutdown") => {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(`Shutting down after ${signal}.`);
  stopReminderJob();
  if (httpServer?.listening) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  await mongoose.disconnect();
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.once("SIGTERM", () => shutdown("SIGTERM").catch((error) => { logError("Shutdown failed", error); process.exitCode = 1; }));
  process.once("SIGINT", () => shutdown("SIGINT").catch((error) => { logError("Shutdown failed", error); process.exitCode = 1; }));
  startServer().catch((error) => {
    logError("Server startup failed", error);
    process.exitCode = 1;
  });
}

export default app;
