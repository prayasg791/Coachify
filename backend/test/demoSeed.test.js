import assert from "node:assert/strict";
import fs from "node:fs";
import dotenv from "dotenv";
import { test } from "node:test";
import {
  DEMO_ACCOUNTS,
  DEMO_ACCOUNTS_EXECUTIVES,
  DEMO_BATCH_DEFINITIONS,
  DEMO_CENTRES,
  DEMO_COUNSELLOR,
  STUDENT_DEFINITIONS,
  databaseNameFromUri,
  deterministicBatchId,
  isDemoDatabaseName,
  plannedPayments,
  splitIntoInstalments,
  validateDemoSeedEnvironment,
} from "../src/seed/demoSeed.js";
import { calculateFeePlan } from "../src/services/fee/feePlan.service.js";
import { generateInstalments } from "../src/services/fee/instalment.service.js";

const validEnvironment = {
  NODE_ENV: "development",
  DEMO_SEED_ENABLED: "true",
  DEMO_OTP_ENABLED: "true",
  MONGO_URI: "mongodb://localhost:27017/coachify_demo",
  DEMO_ACCOUNTS_PASSWORD: "test-accounts-password",
  DEMO_PARENT_PASSWORD: "test-parent-password",
  DEMO_COUNSELLOR_PASSWORD: "test-counsellor-password",
  DEMO_PARENT_PHONES: STUDENT_DEFINITIONS.map(({ parent }) => parent.phone).join(","),
};

test("demo seeding requires development opt-in, demo database, credentials and parent allowlist", () => {
  assert.doesNotThrow(() => validateDemoSeedEnvironment(validEnvironment));
  for (const patch of [
    { NODE_ENV: "production" },
    { DEMO_SEED_ENABLED: undefined },
    { DEMO_OTP_ENABLED: "false" },
    { MONGO_URI: "mongodb://localhost:27017/coachify" },
    { DEMO_ACCOUNTS_PASSWORD: "" },
    { DEMO_PARENT_PHONES: "" },
  ]) {
    assert.throws(() => validateDemoSeedEnvironment({ ...validEnvironment, ...patch }));
  }
});

test("database safety marker is extracted without exposing URI details", () => {
  const uri = "mongodb+srv://cluster.example/coachify-demo?retryWrites=true";
  const database = databaseNameFromUri(uri);
  assert.equal(isDemoDatabaseName(database), true);
  assert.equal(databaseNameFromUri("mongodb://localhost:27017/coachify"), "coachify");
  assert.equal(isDemoDatabaseName("coachify"), false);
});

test("seed contains 120 unique synthetic students and parent accounts evenly split across four centres", () => {
  assert.equal(DEMO_CENTRES.length, 4);
  assert.equal(STUDENT_DEFINITIONS.length, 120);
  assert.equal(new Set(STUDENT_DEFINITIONS.map(({ studentId }) => studentId)).size, 120);
  assert.equal(new Set(STUDENT_DEFINITIONS.map(({ parent }) => parent.email)).size, 120);
  assert.equal(new Set(STUDENT_DEFINITIONS.map(({ parent }) => parent.phone)).size, 120);
  assert.equal(new Set(STUDENT_DEFINITIONS.map(({ name }) => name)).size, 120);
  assert.equal(STUDENT_DEFINITIONS.every(({ parent }) => parent.email.endsWith("@example.test")), true);
  const counts = STUDENT_DEFINITIONS.reduce((result, { centreCode }) => {
    result[centreCode] = (result[centreCode] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(Object.values(counts), [30, 30, 30, 30]);
});

test("checked-in example allowlists all and only the seeded synthetic parent accounts", () => {
  const example = dotenv.parse(fs.readFileSync(new URL("../.env.example", import.meta.url)));
  const configured = new Set(example.DEMO_PARENT_PHONES.split(","));
  assert.equal(configured.size, 120);
  assert.equal(STUDENT_DEFINITIONS.every(({ parent }) => configured.has(parent.phone)), true);
});

test("seed reuses exactly sixteen centre/course/shift batches across two academic years", () => {
  assert.equal(DEMO_BATCH_DEFINITIONS.length, 16);
  assert.equal(new Set(DEMO_BATCH_DEFINITIONS.map(({ centreIndex, courseIndex, shiftIndex }) =>
    deterministicBatchId(centreIndex, courseIndex, shiftIndex).toString())).size, 16);
  assert.deepEqual(new Set(DEMO_BATCH_DEFINITIONS.map(({ academicYear }) => academicYear)), new Set(["2026", "2027"]));
  assert.equal(deterministicBatchId(0, 0, 0).toString(), deterministicBatchId(0, 0, 0).toString());
});

test("four Accounts Executive users are centre-specific and use the shared configured credential", () => {
  assert.equal(DEMO_ACCOUNTS_EXECUTIVES.length, 4);
  assert.equal(DEMO_ACCOUNTS.role, "ACCOUNTS");
  assert.equal(new Set(DEMO_ACCOUNTS_EXECUTIVES.map(({ email }) => email)).size, 4);
  assert.deepEqual(new Set(DEMO_ACCOUNTS_EXECUTIVES.map(({ centreCode }) => centreCode)), new Set(DEMO_CENTRES.map(({ code }) => code)));
  assert.equal(DEMO_COUNSELLOR.role, "COUNSELLOR");
  assert.equal(DEMO_COUNSELLOR.email.endsWith(".test"), true);
});

test("all fee plans split into four valid integer-paise instalments with the correct totals", () => {
  for (const student of STUDENT_DEFINITIONS) {
    const feePlan = calculateFeePlan({
      totalCourseFeePaise: student.totalCourseFeePaise,
      discountType: student.discountType,
      discountValue: student.discountValue,
    });
    const instalmentAmounts = splitIntoInstalments(feePlan.finalPayablePaise, student.index);
    const instalments = generateInstalments({
      feePlanId: "651000000000000000000001",
      studentId: "651000000000000000000002",
      finalPayablePaise: feePlan.finalPayablePaise,
      instalments: instalmentAmounts.map((amountPaise, index) => ({
        amountPaise,
        dueDate: new Date(Date.UTC(2026, index + 1, 10)),
      })),
    });
    assert.equal(instalments.length, 4);
    assert.equal(instalments.reduce((sum, item) => sum + item.amountPaise, 0), feePlan.finalPayablePaise);
    assert.equal(instalments.every(({ amountPaise }) => Number.isSafeInteger(amountPaise)), true);
    assert.equal(Number.isSafeInteger(feePlan.discountAmountPaise), true);
  }
});

test("payment profiles cover paid, partial, overdue, upcoming and no-payment situations", () => {
  const profileCounts = new Map();
  let paymentCount = 0;
  for (const student of STUDENT_DEFINITIONS) {
    profileCounts.set(student.profile, (profileCounts.get(student.profile) || 0) + 1);
    const plan = calculateFeePlan({
      totalCourseFeePaise: student.totalCourseFeePaise,
      discountType: student.discountType,
      discountValue: student.discountValue,
    });
    const amounts = splitIntoInstalments(plan.finalPayablePaise, student.index);
    paymentCount += plannedPayments(student, amounts).filter((amount) => amount > 0).length;
  }
  assert.deepEqual([...profileCounts.values()], [24, 24, 24, 24, 24]);
  assert.equal(paymentCount, 168);
});
