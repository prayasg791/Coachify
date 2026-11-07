import assert from "node:assert/strict";
import { test } from "node:test";
import Consent from "../src/models/Consent.js";
import { withProductionConsentGuard } from "../src/utils/consentQuery.js";

test("synthetic seed consent has an explicit non-legal marker and defaults real consent off demo mode", () => {
  assert.equal(Consent.schema.path("isDemoConsent").defaultValue, false);
  assert.deepEqual(Consent.schema.path("verificationMethod").enumValues, ["OTP", "DEMO_SEED"]);
});

test("demo consent is eligible only outside production consent queries", () => {
  const base = { parent: "parent-id", student: "student-id", purpose: "STUDENT_DATA_PROCESSING", status: "GRANTED" };
  assert.deepEqual(withProductionConsentGuard(base, { NODE_ENV: "development" }), base);
  assert.deepEqual(withProductionConsentGuard(base, { NODE_ENV: "production" }), {
    ...base,
    isDemoConsent: { $ne: true },
  });
});
