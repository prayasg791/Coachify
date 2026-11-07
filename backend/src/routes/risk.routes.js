import express from "express";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";
import {
  assignRiskTaskController,
  listCounsellorTasksController,
  listActiveCounsellorsController,
  listRiskFlagsController,
  reviewRiskTaskController,
} from "../controllers/risk.controller.js";

const router = express.Router();

router.get(
  "/flags",
  authenticate,
  authorizeRoles("ACCOUNTS"),
  listRiskFlagsController,
);
router.get(
  "/counsellors",
  authenticate,
  authorizeRoles("ACCOUNTS"),
  listActiveCounsellorsController,
);
router.post(
  "/flags/:riskFlagId/assignment",
  authenticate,
  authorizeRoles("ACCOUNTS"),
  assignRiskTaskController,
);
router.get(
  "/tasks",
  authenticate,
  authorizeRoles("COUNSELLOR"),
  listCounsellorTasksController,
);
router.patch(
  "/tasks/:riskFlagId/review",
  authenticate,
  authorizeRoles("COUNSELLOR"),
  reviewRiskTaskController,
);

export default router;
