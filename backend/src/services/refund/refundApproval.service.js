
import mongoose from "mongoose";
import Refund from "../../models/Refund.js";
import AuditLog from "../../models/AuditLog.js";

const decideRefund = async ({
  refundId,
  decidedBy,
  decision,
  rejectionReason,
}) => {
  const normalizedDecision = decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const session = await mongoose.startSession();

  try {
    let updatedRefund;

    await session.withTransaction(async () => {
      const refund = await Refund.findOneAndUpdate(
        {
          _id: refundId,
          status: "PENDING",
        },
        {
          $set: {
            status: normalizedDecision,
            decisionBy: decidedBy,
            decisionAt: new Date(),
            approvedBy: normalizedDecision === "APPROVED" ? decidedBy : null,
            rejectionReason:
              normalizedDecision === "REJECTED" ? rejectionReason : null,
          },
        },
        { new: true, runValidators: true, session }
      );

      if (!refund) {
        const error = new Error("Refund not found or already decided");
        error.statusCode = 409;
        throw error;
      }

      await AuditLog.create(
        [{
          actor: decidedBy,
          actorType: "USER",
          action: normalizedDecision === "APPROVED"
            ? "REFUND_APPROVED"
            : "REFUND_REJECTED",
          entityType: "Refund",
          entityId: refund._id,
          details: {
            refundAmountPaise: refund.refundAmountPaise,
            rejectionReason:
              normalizedDecision === "REJECTED" ? rejectionReason : null,
          },
        }],
        { session }
      );

      updatedRefund = refund;
    });

    return updatedRefund;
  } finally {
    await session.endSession();
  }
};

const approveRefund = async ({ refundId, approvedBy }) =>
  decideRefund({
    refundId,
    decidedBy: approvedBy,
    decision: "APPROVE",
  });

export { approveRefund, decideRefund };
