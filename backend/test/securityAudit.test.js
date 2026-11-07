import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { after, mock, test } from "node:test";
import AuditLog from "../src/models/AuditLog.js";
import Consent from "../src/models/Consent.js";
import Student from "../src/models/Student.js";
import User from "../src/models/User.js";
import { grantParentalConsent } from "../src/services/auth/consent.service.js";
import { requestParentOtp, verifyParentOtp } from "../src/services/auth/otp.service.js";
import { initiateParentPayment } from "../src/services/payment/paymentApi.service.js";
import { processRefund } from "../src/services/refund/refundProcessing.service.js";

const secret = "security-audit-test-secret-with-at-least-32-bytes";
const userId = "64f000000000000000000001";
const studentId = "64f000000000000000000002";
const previous = {
  NODE_ENV: process.env.NODE_ENV,
  JWT_SECRET: process.env.JWT_SECRET,
  DEMO_OTP_ENABLED: process.env.DEMO_OTP_ENABLED,
  DEMO_PARENT_PHONES: process.env.DEMO_PARENT_PHONES,
};
process.env.NODE_ENV = "development";
process.env.JWT_SECRET = secret;
process.env.DEMO_OTP_ENABLED = "true";
process.env.DEMO_PARENT_PHONES = "9876543210";
after(() => {
  mock.restoreAll();
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("consent cannot be granted without a recent OTP-authenticated session claim", async (t) => {
  t.mock.method(Student, "findOne", () => { throw new Error("must not query student"); });
  await assert.rejects(grantParentalConsent({ parentId: userId, studentId, policyVersion: "v1" }), (error) => error.statusCode === 403);
  await assert.rejects(grantParentalConsent({ parentId: userId, studentId, policyVersion: "v1", otpVerifiedAt: Date.now() - 11 * 60 * 1000 }), (error) => error.statusCode === 403);
});

test("development OTP verification issues a signed claim consumed by consent grant", async (t) => {
  const user = { _id: userId, name: "Parent", role: "PARENT", phone: "9876543210", email: "parent@example.test" };
  t.mock.method(User, "findOne", async () => user);
  t.mock.method(Student, "findOne", async () => ({ _id: studentId }));
  t.mock.method(Consent, "findOneAndUpdate", async (_filter, update) => ({ _id: "consent-1", ...update.$set }));
  t.mock.method(AuditLog, "create", async () => []);
  const challenge = await requestParentOtp(user.phone);
  assert.equal(typeof challenge.devOtp, "string");
  const login = await verifyParentOtp({ phone: user.phone, otp: challenge.devOtp });
  const claims = jwt.verify(login.accessToken, secret);
  assert.equal(claims.authMethod, "PARENT_OTP");
  const consent = await grantParentalConsent({ parentId: userId, studentId, policyVersion: "v1", otpVerifiedAt: claims.otpVerifiedAt });
  assert.equal(consent.status, "GRANTED");
  assert.equal(consent.verificationMethod, "OTP");
});

test("demo OTP is hidden unless explicitly enabled for allowlisted synthetic accounts", async (t) => {
  process.env.DEMO_OTP_ENABLED = "false";
  const user = { _id: userId, role: "PARENT", phone: "9876543210", email: "parent@example.test" };
  t.mock.method(User, "findOne", async () => user);
  const challenge = await requestParentOtp(user.phone);
  assert.equal("devOtp" in challenge, false);
  await assert.rejects(verifyParentOtp({ phone: user.phone, otp: "000000" }));
});

test("parent OTP is unavailable in production without a delivery provider", async () => {
  process.env.NODE_ENV = "production";
  await assert.rejects(requestParentOtp("9876543210"), (error) => error.statusCode === 503);
  process.env.NODE_ENV = "development";
});

test("mock online payments and refunds cannot be recorded as real production transactions", async () => {
  process.env.NODE_ENV = "production";
  await assert.rejects(initiateParentPayment({ studentId, instalmentId: studentId, amountPaise: 100, user: { _id: userId, role: "PARENT" } }), (error) => error.statusCode === 503);
  await assert.rejects(processRefund({ refundId: studentId, processedBy: userId }), (error) => error.statusCode === 503);
  process.env.NODE_ENV = "development";
});
