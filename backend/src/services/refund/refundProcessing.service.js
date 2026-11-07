
import mongoose from "mongoose";
import Refund from "../../models/Refund.js";
import AuditLog from "../../models/AuditLog.js";
import { processMockRefund } from "./mockRefund.service.js";

const processRefund = async ({ refundId, processedBy }) => {
  if (process.env.NODE_ENV === "production") {
    const error = new Error("Refund processor is not configured");
    error.statusCode = 503;
    throw error;
  }
  const session = await mongoose.startSession();

  try {
    let updatedRefund;

    await session.withTransaction(async () => {
      const refund = await Refund.findOneAndUpdate(
        {
          _id: refundId,
          status: "APPROVED",
        },
        {
          $set: { status: "PROCESSING" },
        },
        { new: true, session }
      );

      if (!refund) {
        const error = new Error("Refund not approved or already processed");
        error.statusCode = 409;
        throw error;
      }

      const gatewayResult = processMockRefund({
        refundId: refund._id,
        amountPaise: refund.refundAmountPaise,
      });

      if (gatewayResult.status !== "SUCCESS") {
        throw new Error("Refund processing failed");
      }

      refund.status = "PROCESSED";
      refund.processedAt = gatewayResult.processedAt;
      refund.processedBy = processedBy;
      refund.refundTransactionId = gatewayResult.refundTransactionId;

      await refund.save({ session });

      await AuditLog.create(
        [
          {
            actor: processedBy,
            actorType: "USER",
            action: "REFUND_PROCESSED",
            entityType: "Refund",
            entityId: refund._id,
            details: {
              refundTransactionId: gatewayResult.refundTransactionId,
              amountPaise: refund.refundAmountPaise,
            },
          },
        ],
        { session }
      );

      updatedRefund = refund;
    });

    return updatedRefund;
  } finally {
    await session.endSession();
  }
};

export { processRefund };
