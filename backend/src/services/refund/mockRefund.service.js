
import crypto from "crypto";

const processMockRefund = ({ refundId, amountPaise }) => {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) {
    throw new Error("Invalid refund amount");
  }

  return {
    refundId,
    refundTransactionId: `REFUND_${crypto.randomUUID()}`,
    amountPaise,
    status: "SUCCESS",
    processedAt: new Date(),
  };
};

export { processMockRefund };
