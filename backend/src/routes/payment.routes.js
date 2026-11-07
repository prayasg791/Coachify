import express from "express";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";
import { requireStudentConsent } from "../middlewares/consent.middleware.js";
import { resolveMockPaymentStudent } from "../middlewares/payment.middleware.js";
import {
  getStudentPaymentHistoryController,
  initiateParentPaymentController,
  recordOfflinePaymentController,
  simulateParentPaymentController,
  unmatchedListController,
  unmatchedDetailController,
  unmatchedCreateController,
  unmatchedMatchController,
  unmatchedRejectController,
} from "../controllers/payment.controller.js";

const router = express.Router();

router.post(
  "/initiate",
  authenticate,
  authorizeRoles("PARENT"),
  requireStudentConsent,
  initiateParentPaymentController
);

router.post(
  "/mock-process",
  authenticate,
  authorizeRoles("PARENT"),
  resolveMockPaymentStudent,
  requireStudentConsent,
  simulateParentPaymentController
);

router.get(
  "/student/:studentId",
  authenticate,
  authorizeRoles("PARENT", "ACCOUNTS"),
  (req, res, next) => {
    if (req.user.role === "PARENT") {
      return requireStudentConsent(req, res, next);
    }

    return next();
  },
  getStudentPaymentHistoryController
);

router.post(
  "/offline",
  authenticate,
  authorizeRoles("ACCOUNTS"),
  recordOfflinePaymentController
);

router.get("/unmatched", authenticate, authorizeRoles("ACCOUNTS"), unmatchedListController);
router.post("/unmatched", authenticate, authorizeRoles("ACCOUNTS"), unmatchedCreateController);
router.get("/unmatched/:id", authenticate, authorizeRoles("ACCOUNTS"), unmatchedDetailController);
router.post("/unmatched/:id/match", authenticate, authorizeRoles("ACCOUNTS"), unmatchedMatchController);
router.post("/unmatched/:id/reject", authenticate, authorizeRoles("ACCOUNTS"), unmatchedRejectController);

export default router;
