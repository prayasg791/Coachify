
import mongoose from "mongoose";
import Payment from "../../models/Payment.js";
import Instalment from "../../models/Instalment.js";
import { verifySignature } from "./mockGateway.service.js";
import { cancelInstalmentReminders } from "../reminder/reminder.service.js";

const confirmPayment = async (payload, signature) => {
  if (!verifySignature(payload, signature)) {
    throw new Error("Invalid gateway signature");
  }

  const {
    paymentId,
    gatewayTransactionId,
    amountPaise,
    status,
  } = payload;

  if (
    !mongoose.Types.ObjectId.isValid(paymentId) ||
    typeof gatewayTransactionId !== "string" ||
    !gatewayTransactionId.trim() ||
    gatewayTransactionId.length > 100 ||
    !["SUCCESS", "FAILED"].includes(status) ||
    !Number.isSafeInteger(amountPaise) ||
    amountPaise <= 0
  ) {
    throw new Error("Invalid payment confirmation");
  }

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const payment = await Payment.findById(paymentId).session(session);

      if (!payment) {
        throw new Error("Payment not found");
      }

      // Repeated callbacks with the same outcome and transaction are idempotent.
      if (payment.status !== "PENDING") {
        if (
          payment.status === status &&
          payment.transactionId === gatewayTransactionId
        ) {
          result = payment;
          return;
        }

        throw new Error("Payment already processed");
      }

      if (payment.paymentMethod !== "GATEWAY") {
        throw new Error("Only gateway payments can be confirmed");
      }

      if (payment.amountPaise !== amountPaise) {
        throw new Error("Payment amount mismatch");
      }

      if (status !== "SUCCESS") {
        payment.status = "FAILED";
        payment.transactionId = gatewayTransactionId;
        await payment.save({ session });
        result = payment;
        return;
      }

      const instalment = await Instalment.findById(
        payment.instalment
      ).session(session);

      if (!instalment) {
        throw new Error("Instalment not found");
      }

      // Lock the instalment against concurrent confirmations
      await Instalment.updateOne(
        { _id: instalment._id },
        { $inc: { __v: 1 } },
        { session }
      );

      const successfulPayments = await Payment.aggregate([
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

      const totalPaid = successfulPayments[0]?.total || 0;

      if (totalPaid + amountPaise > instalment.amountPaise) {
        throw new Error("Payment exceeds outstanding balance");
      }

      payment.status = "SUCCESS";
      payment.transactionId = gatewayTransactionId;
      payment.paidAt = new Date();

      await payment.save({ session });
      const updatedPayments = await Payment.aggregate([
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

const totalPaidPaise = updatedPayments[0]?.total || 0;

if (totalPaidPaise === instalment.amountPaise) {
  await cancelInstalmentReminders(instalment._id, session);
}

      result = payment;
    });

    return result;
  } finally {
    await session.endSession();
  }
};

export { confirmPayment };
