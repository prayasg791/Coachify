import express from "express";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";
import { getAccountsDashboardController } from "../controllers/dashboard.controller.js";

const router = express.Router();

router.get(
  "/accounts",
  authenticate,
  authorizeRoles("ACCOUNTS"),
  getAccountsDashboardController
);

export default router;
