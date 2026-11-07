import express from "express";
import { getAccountsRemindersController, getParentRemindersController } from "../controllers/reminderRead.controller.js";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/parent", authenticate, authorizeRoles("PARENT"), getParentRemindersController);
router.get("/accounts", authenticate, authorizeRoles("ACCOUNTS"), getAccountsRemindersController);

export default router;
