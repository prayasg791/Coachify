import express from "express";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";
import { requireStudentConsent } from "../middlewares/consent.middleware.js";
import {
  createAttendanceController,
  createBulkAttendanceController,
  getStudentAttendanceController,
} from "../controllers/academicRecord.controller.js";

const router = express.Router();

router.post(
  "/bulk",
  authenticate,
  authorizeRoles("ACCOUNTS"),
  createBulkAttendanceController
);

router.post(
  "/",
  authenticate,
  authorizeRoles("ACCOUNTS"),
  createAttendanceController
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
  getStudentAttendanceController
);

export default router;
