
import express from "express";
import { accountsLogin, counsellorLogin } from "../controllers/auth.controller.js";
import {
  sendOtp,
  verifyOtp,
} from "../controllers/parentAuth.controller.js";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";
import {
  grantConsent,
  withdrawConsent,
} from "../controllers/consent.controller.js";

const router = express.Router();

router.post("/accounts/login", accountsLogin);
router.post("/counsellor/login", counsellorLogin);
router.post("/parent/request-otp", sendOtp);
router.post("/parent/verify-otp", verifyOtp);
router.post(
  "/parent/consent",
  authenticate,
  authorizeRoles("PARENT"),
  grantConsent
);
router.post(
  "/parent/consent/withdraw",
  authenticate,
  authorizeRoles("PARENT"),
  withdrawConsent
);

export default router;
