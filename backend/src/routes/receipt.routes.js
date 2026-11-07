import express from "express";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";
import { requireStudentConsent } from "../middlewares/consent.middleware.js";
import { getPaymentReceiptController, getReceiptController, listStudentReceiptsController } from "../controllers/receipt.controller.js";

const router = express.Router();
router.get("/student/:studentId", authenticate, authorizeRoles("PARENT", "ACCOUNTS"), (req, res, next) => {
  if (req.user.role === "PARENT") return requireStudentConsent(req, res, next);
  return next();
}, listStudentReceiptsController);
router.get("/payment/:paymentId", authenticate, authorizeRoles("PARENT", "ACCOUNTS"), getPaymentReceiptController);
router.get("/:receiptId", authenticate, authorizeRoles("PARENT", "ACCOUNTS"), getReceiptController);
export default router;
