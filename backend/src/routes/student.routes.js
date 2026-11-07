import express from "express";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";
import { getStudentsController } from "../controllers/student.controller.js";

const router = express.Router();

router.get("/", authenticate, authorizeRoles("ACCOUNTS"), getStudentsController);

export default router;
