import express from "express";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";
import { requireStudentConsent } from "../middlewares/consent.middleware.js";
import {
  calculateRefundController,
  createRefundController,
  decideRefundController,
  listStudentRefundsController,
  listAccountsRefundQueueController,
  processRefundController,
} from "../controllers/refund.controller.js";

const requireParentConsent = (req, res, next) => {
  if (req.user.role === "PARENT") {
    return requireStudentConsent(req, res, next);
  }

  return next();
};

const router = express.Router();

router.get(
  "/",
  authenticate,
  authorizeRoles("ACCOUNTS"),
  listAccountsRefundQueueController
);

router.post(
  "/calculate",
  authenticate,
  authorizeRoles("PARENT", "ACCOUNTS"),
  requireParentConsent,
  calculateRefundController
);

router.post(
  "/",
  authenticate,
  authorizeRoles("PARENT", "ACCOUNTS"),
  requireParentConsent,
  createRefundController
);

router.get(
  "/student/:studentId",
  authenticate,
  authorizeRoles("PARENT", "ACCOUNTS"),
  requireParentConsent,
  listStudentRefundsController
);

router.patch(
  "/:refundId/decision",
  authenticate,
  authorizeRoles("ACCOUNTS"),
  decideRefundController
);

router.post(
  "/:refundId/process",
  authenticate,
  authorizeRoles("ACCOUNTS"),
  processRefundController
);

export default router;
