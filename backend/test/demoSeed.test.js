import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEMO_ACCOUNTS,
  DEMO_CENTRES,
  DEMO_COUNSELLOR,
  STUDENT_DEFINITIONS,
  deterministicBatchId,
  validateDemoSeedEnvironment,
} from "../src/seed/demoSeed.js";
import { calculateFeePlan } from "../src/services/fee/feePlan.service.js";
import { generateInstalments } from "../src/services/fee/instalment.service.js";

const validEnvironment = {
  NODE_ENV: "development",
  DEMO_SEED_ENABLED: "true",
  MONGO_URI: "mongodb://localhost:27017/coachify_demo",
  DEMO_ACCOUNTS_PASSWORD: "test-accounts-password",
  DEMO_PARENT_PASSWORD: "test-parent-password",
  DEMO_COUNSELLOR_PASSWORD: "test-counsellor-password",
};

test("demo seeding requires explicit development safety configuration", () => {
  assert.doesNotThrow(() => validateDemoSeedEnvironment(validEnvironment));
  assert.throws(
    () => validateDemoSeedEnvironment({
      ...validEnvironment,
      NODE_ENV: "production",
    }),
    /NODE_ENV=development/
  );
  assert.throws(
    () => validateDemoSeedEnvironment({
      ...validEnvironment,
      DEMO_SEED_ENABLED: undefined,
    }),
    /DEMO_SEED_ENABLED=true/
  );
  assert.throws(
    () => validateDemoSeedEnvironment({
      ...validEnvironment,
      MONGO_URI: "mongodb://localhost:27017/coachify",
    }),
    /database whose name includes/
  );
  assert.throws(
    () => validateDemoSeedEnvironment({
      ...validEnvironment,
      DEMO_ACCOUNTS_PASSWORD: "",
    }),
    /DEMO_ACCOUNTS_PASSWORD/
  );
});

test("demo records contain four centres and repeatable batch IDs", () => {
  assert.equal(DEMO_CENTRES.length, 4);
  assert.deepEqual(
    DEMO_CENTRES.map((centre) => centre.name),
    ["Jaipur Central", "Jaipur North", "Jaipur South", "Jaipur West"]
  );
  assert.equal(
    new Set(DEMO_CENTRES.map((centre) => centre.code)).size,
    DEMO_CENTRES.length
  );
  assert.equal(
    deterministicBatchId(0, 0, 0).toString(),
    deterministicBatchId(0, 0, 0).toString()
  );
  assert.notEqual(
    deterministicBatchId(0, 0, 0).toString(),
    deterministicBatchId(0, 0, 1).toString()
  );
});

test("demo identities use expected roles and synthetic test domains", () => {
  assert.equal(DEMO_ACCOUNTS.role, "ACCOUNTS");
  assert.equal(DEMO_COUNSELLOR.role, "COUNSELLOR");
  assert.equal(DEMO_ACCOUNTS.email.endsWith(".test"), true);
  assert.equal(DEMO_COUNSELLOR.email.endsWith(".test"), true);
  assert.equal(STUDENT_DEFINITIONS.length, 3);
  assert.equal(
    STUDENT_DEFINITIONS.every((student) =>
      student.parent.email.endsWith(".test") &&
      /^\d{10}$/.test(student.parent.phone)
    ),
    true
  );
});

test("fee and instalment seed amounts are valid and mathematically consistent", () => {
  for (const student of STUDENT_DEFINITIONS) {
    const feePlan = calculateFeePlan({
      totalCourseFeePaise: student.totalFeePaise,
      discountType: student.discountType,
      discountValue: student.discountValue,
    });
    const instalments = generateInstalments({
      feePlanId: "651000000000000000000001",
      studentId: "651000000000000000000002",
      finalPayablePaise: feePlan.finalPayablePaise,
      instalments: [{
        amountPaise: student.instalmentAmountPaise,
        dueDate: student.dueDate,
      }],
    });

    assert.equal(
      instalments.reduce((sum, item) => sum + item.amountPaise, 0),
      feePlan.finalPayablePaise
    );
    assert.equal(Number.isSafeInteger(feePlan.discountAmountPaise), true);
    assert.equal(Number.isSafeInteger(feePlan.finalPayablePaise), true);
    assert.equal(
      student.payments.reduce((sum, payment) => sum + payment.amountPaise, 0),
      student.studentId === "STU-0412"
        ? 3000000
        : student.studentId === "STU-0587"
          ? 1500000
          : 0
    );
  }
});

test("successful demo transaction identifiers are unique", () => {
  const transactionIds = STUDENT_DEFINITIONS.flatMap((student) =>
    student.payments.map((payment) => payment.transactionId)
  );

  assert.equal(new Set(transactionIds).size, transactionIds.length);
});
