import express from "express";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";
import { requireStudentConsent } from "../middlewares/consent.middleware.js";
import {
  createBulkTestScoresController,
  createTestScoreController,
  getStudentTestHistoryController,
} from "../controllers/academicRecord.controller.js";

const router = express.Router();

router.post(
  "/scores/bulk",
  authenticate,
  authorizeRoles("ACCOUNTS"),
  createBulkTestScoresController
);

router.post(
  "/scores",
  authenticate,
  authorizeRoles("ACCOUNTS"),
  createTestScoreController
);

router.get(
  "/student/:studentId",
  authenticate,
  authorizeRoles("ACCOUNTS", "PARENT"),
  (req, res, next) => {
    if (req.user.role === "PARENT") {
      return requireStudentConsent(req, res, next);
    }

    return next();
  },
  getStudentTestHistoryController
);

export default router;
