import mongoose from "mongoose";
import Student from "../../models/Student.js";
import Instalment from "../../models/Instalment.js";
import Payment from "../../models/Payment.js";
import AuditLog from "../../models/AuditLog.js";
import { initiatePayment } from "./payment.service.js";
import { confirmPayment } from "./paymentConfirmation.service.js";
import { createMockGatewayResult } from "./mockGateway.service.js";
import { cancelInstalmentReminders } from "../reminder/reminder.service.js";

const createError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const ensureStudentAccess = async ({ studentId, user }) => {
  const student = await Student.findById(studentId).select(
    "parent centre studentId name"
  );

  if (!student) {
    throw createError("Student not found", 404);
  }

  if (user.role === "PARENT") {
    if (student.parent.toString() !== user._id.toString()) {
      throw createError("Student not found", 404);
    }
  } else if (user.role === "ACCOUNTS") {
    const hasCentreAccess = user.centres?.some(
      (centreId) => centreId.toString() === student.centre.toString()
    );

    if (!hasCentreAccess) {
      throw createError("You cannot access students at this centre", 403);
    }
  } else {
    throw createError("You are not authorized for this action", 403);
  }

  return student;
};

const initiateParentPayment = async ({
  studentId,
  instalmentId,
  amountPaise,
  user,
}) => {
  if (process.env.NODE_ENV === "production") {
    throw createError("Online payment gateway is not configured", 503);
  }
  await ensureStudentAccess({ studentId, user });

  try {
    return await initiatePayment({ studentId, instalmentId, amountPaise });
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }

    const clientErrors = new Map([
      ["Invalid student or instalment ID", 400],
      ["Invalid payment amount", 400],
      ["Instalment not found", 404],
      ["Student does not own this instalment", 400],
      ["Instalment is already paid", 409],
      ["Payment exceeds outstanding balance", 400],
    ]);
    const statusCode = clientErrors.get(error.message);

    if (statusCode) {
      throw createError(error.message, statusCode);
    }

    throw error;
  }
};

const simulateParentPayment = async ({ paymentId, outcome, user }) => {
  if (process.env.NODE_ENV !== "development") {
    throw createError("Mock payment processing is available only in development", 404);
  }

  if (!mongoose.Types.ObjectId.isValid(paymentId)) {
    throw createError("Invalid payment ID", 400);
  }

  const payment = await Payment.findById(paymentId);

  if (!payment || payment.paymentMethod !== "GATEWAY") {
    throw createError("Gateway payment not found", 404);
  }

  await ensureStudentAccess({ studentId: payment.student, user });

  if (payment.status !== "PENDING") {
    throw createError("Payment is not pending", 409);
  }

  if (!["SUCCESS", "FAILED"].includes(outcome)) {
    throw createError("Outcome must be SUCCESS or FAILED", 400);
  }

  let gatewayResult;
  try {
    gatewayResult = createMockGatewayResult(payment, outcome);
    return await confirmPayment(
      gatewayResult.payload,
      gatewayResult.signature
    );
  } catch (error) {
    if (error.code === 11000) {
      throw createError("Gateway transaction ID has already been used", 409);
    }

    if (error.message === "MOCK_GATEWAY_SECRET is not configured") {
      throw createError("Mock gateway is not configured", 500);
    }

    const clientErrors = new Map([
      ["Payment already processed", 409],
      ["Payment is not pending", 409],
      ["Payment not found", 404],
      ["Invalid gateway signature", 400],
      ["Invalid payment confirmation", 400],
      ["Payment amount mismatch", 400],
      ["Payment exceeds outstanding balance", 400],
      ["Instalment not found", 404],
    ]);
    const statusCode = clientErrors.get(error.message);

    if (statusCode) {
      throw createError(error.message, statusCode);
    }

    throw error;
  }
};

const getStudentPaymentHistory = async ({ studentId, user }) => {
  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw createError("Invalid student ID", 400);
  }

  await ensureStudentAccess({ studentId, user });

  const payments = await Payment.find({ student: studentId })
    .select("instalment amountPaise paymentMethod transactionId status paidAt createdAt")
    .sort({ createdAt: -1 });

  return payments.map((payment) => ({
    id: payment._id,
    instalmentId: payment.instalment,
    amountPaise: payment.amountPaise,
    paymentMethod: payment.paymentMethod,
    transactionId: payment.transactionId,
    status: payment.status,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt,
  }));
};

const recordOfflinePaymentInTransaction = async ({
  studentId,
  instalmentId,
  amountPaise,
  paymentMethod,
  transactionId,
  user,
  session,
  paidAt = new Date(),
}) => {
  if (
    !mongoose.Types.ObjectId.isValid(studentId) ||
    !mongoose.Types.ObjectId.isValid(instalmentId)
  ) {
    throw createError("Invalid student or instalment ID", 400);
  }

  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw createError("Invalid payment amount", 400);
  }

  const allowedMethods = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"];
  if (!allowedMethods.includes(paymentMethod)) {
    throw createError("Invalid offline payment method", 400);
  }

  const normalizedTransactionId =
    typeof transactionId === "string" ? transactionId.trim() : "";

  if (
    !normalizedTransactionId ||
    normalizedTransactionId.length > 100
  ) {
    throw createError("A valid reference or receipt number is required", 400);
  }

  const student = await ensureStudentAccess({ studentId, user });

  const instalment = await Instalment.findById(instalmentId).session(session);
  if (!instalment || instalment.student.toString() !== student._id.toString()) {
    throw createError("Instalment not found for student", 404);
  }

  if (!(paidAt instanceof Date) || Number.isNaN(paidAt.getTime())) {
    throw createError("Invalid payment date", 400);
  }

  const lockedInstalment = await Instalment.findOneAndUpdate(
    { _id: instalmentId },
    { $inc: { __v: 1 } },
    { new: true, session }
  );

  if (!lockedInstalment || lockedInstalment.student.toString() !== student._id.toString()) {
    throw createError("Instalment not found for student", 404);
  }

  const paymentSummary = await Payment.aggregate([
    { $match: { instalment: lockedInstalment._id, status: "SUCCESS" } },
    { $group: { _id: null, total: { $sum: "$amountPaise" } } },
  ]).session(session);

  const totalPaidPaise = paymentSummary[0]?.total || 0;
  if (totalPaidPaise + amountPaise > lockedInstalment.amountPaise) {
    throw createError("Payment exceeds outstanding balance", 400);
  }

  const [payment] = await Payment.create(
    [{
      student: student._id,
      instalment: lockedInstalment._id,
      amountPaise,
      paymentMethod,
      transactionId: normalizedTransactionId,
      status: "SUCCESS",
      paidAt,
      recordedBy: user._id,
    }],
    { session }
  );

  await AuditLog.create(
    [{
      actor: user._id,
      actorType: "USER",
      action: "OFFLINE_PAYMENT_RECORDED",
      entityType: "Payment",
      entityId: payment._id,
      details: {
        studentId: student._id,
        instalmentId: lockedInstalment._id,
        amountPaise,
        paymentMethod,
        transactionId: normalizedTransactionId,
      },
    }],
    { session }
  );

  const updatedSummary = await getInstalmentSummaryInSession(
    Payment,
    lockedInstalment,
    session
  );
  if (updatedSummary === lockedInstalment.amountPaise) {
    await cancelInstalmentReminders(lockedInstalment._id, session);
  }

  return payment;
};

const recordOfflinePayment = async (data) => {
  const session = await mongoose.startSession();
  try {
    let payment;
    await session.withTransaction(async () => {
      payment = await recordOfflinePaymentInTransaction({ ...data, session });
    });
    return payment;
  } catch (error) {
    if (error.code === 11000) {
      throw createError("Payment reference has already been used", 409);
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

const getInstalmentSummaryInSession = async (PaymentModel, instalment, session) => {
  const result = await PaymentModel.aggregate([
    {
      $match: {
        instalment: instalment._id,
        status: "SUCCESS",
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amountPaise" },
      },
    },
  ]).session(session);

  return result[0]?.total || 0;
};

export {
  getStudentPaymentHistory,
  initiateParentPayment,
  recordOfflinePayment,
  recordOfflinePaymentInTransaction,
  simulateParentPayment,
};
