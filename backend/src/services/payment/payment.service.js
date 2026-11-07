
import mongoose from "mongoose";
import Instalment from "../../models/Instalment.js";
import Payment from "../../models/Payment.js";
import { getInstalmentSummary } from "../fee/fee.service.js";

const initiatePayment = async ({
  studentId,
  instalmentId,
  amountPaise,
}) => {
  if (
    !mongoose.Types.ObjectId.isValid(studentId) ||
    !mongoose.Types.ObjectId.isValid(instalmentId)
  ) {
    throw new Error("Invalid student or instalment ID");
  }

  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new Error("Invalid payment amount");
  }

  const instalment = await Instalment.findById(instalmentId);

  if (!instalment) {
    throw new Error("Instalment not found");
  }

  if (instalment.student.toString() !== studentId.toString()) {
    throw new Error("Student does not own this instalment");
  }

  const summary = await getInstalmentSummary(instalmentId);

  if (summary.paymentStatus === "PAID") {
    throw new Error("Instalment is already paid");
  }

  if (amountPaise > summary.balancePaise) {
    throw new Error("Payment exceeds outstanding balance");
  }

  const payment = await Payment.create({
    student: studentId,
    instalment: instalmentId,
    amountPaise,
    paymentMethod: "GATEWAY",
    status: "PENDING",
  });

  return payment;
};

export { initiatePayment };
