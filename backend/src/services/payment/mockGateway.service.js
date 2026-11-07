
import crypto from "crypto";

const generateSignature = (payload) => {
  if (!process.env.MOCK_GATEWAY_SECRET) {
    throw new Error("MOCK_GATEWAY_SECRET is not configured");
  }

  return crypto
    .createHmac("sha256", process.env.MOCK_GATEWAY_SECRET)
    .update(JSON.stringify(payload))
    .digest("hex");
};

const verifySignature = (payload, signature) => {
  const expectedSignature = generateSignature(payload);

  const received = Buffer.from(signature || "", "hex");
  const expected = Buffer.from(expectedSignature, "hex");

  return (
    received.length === expected.length &&
    crypto.timingSafeEqual(received, expected)
  );
};

const createMockGatewayResult = (payment, status) => {
  if (!["SUCCESS", "FAILED"].includes(status)) {
    throw new Error("Invalid mock payment outcome");
  }

  const payload = {
    paymentId: payment._id.toString(),
    gatewayTransactionId: `MOCK_${crypto.randomUUID()}`,
    amountPaise: payment.amountPaise,
    status,
  };

  return {
    payload,
    signature: generateSignature(payload),
  };
};

export { generateSignature, verifySignature, createMockGatewayResult };
