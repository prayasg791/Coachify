import express from "express";
import { getParentStudents } from "../controllers/parentStudent.controller.js";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/students", authenticate, authorizeRoles("PARENT"), getParentStudents);

export default router;
