import mongoose from "mongoose";
import Payment from "../models/Payment.js";
import { logError } from "../utils/logger.js";

const resolveMockPaymentStudent = async (req, res, next) => {
  try {
    const { paymentId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(paymentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment ID",
      });
    }

    const payment = await Payment.findById(paymentId).select("student");
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    req.body.studentId = payment.student.toString();
    return next();
  } catch (error) {
    logError("Mock payment lookup failed", error);
    return res.status(500).json({
      success: false,
      message: "Unable to validate payment",
    });
  }
};

export { resolveMockPaymentStudent };
