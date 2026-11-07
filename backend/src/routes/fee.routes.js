
import express from "express";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";
import { createFeePlan } from "../controllers/fee.controller.js";
import { getStudentFeeLedgerController } from "../controllers/feeLedger.controller.js";
import { requireFeeLedgerAccess } from "../middlewares/feeLedger.middleware.js";

const router = express.Router();

router.get(
  "/students/:studentId/ledger",
  authenticate,
  authorizeRoles("ACCOUNTS", "PARENT"),
  requireFeeLedgerAccess,
  getStudentFeeLedgerController
);

router.post(
  "/plans",
  authenticate,
  authorizeRoles("ACCOUNTS"),
  createFeePlan
);

export default router;
