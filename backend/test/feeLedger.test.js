import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import Consent from "../src/models/Consent.js";
import FeePlan from "../src/models/FeePlan.js";
import Instalment from "../src/models/Instalment.js";
import Payment from "../src/models/Payment.js";
import Student from "../src/models/Student.js";
import User from "../src/models/User.js";
import feeRoutes from "../src/routes/fee.routes.js";

const secret = "fee-ledger-test-secret";
const parentId = "64c000000000000000000001";
const otherParentId = "64c000000000000000000002";
const accountId = "64c000000000000000000003";
const centreId = "64c000000000000000000004";
const otherCentreId = "64c000000000000000000005";
const batchId = "64c000000000000000000006";
const studentId = "64c000000000000000000007";
const feePlanId = "64c000000000000000000008";
const instalmentId = "64c000000000000000000009";
const paymentId = "64c000000000000000000010";

let server;
let endpoint;
let scenario;
let previousJwtSecret;

const query = (value) => ({
  select() {
    return this;
  },
  populate() {
    return this;
  },
  sort() {
    return this;
  },
  then(resolve, reject) {
    return Promise.resolve(value).then(resolve, reject);
  },
});

const createScenario = ({ role, userId, centreIds = [centreId] }) => {
  const student = {
    _id: studentId,
    studentId: "STU-001",
    name: "Sample Student",
    parent: parentId,
    status: "ACTIVE",
    courseStartDate: new Date("2026-01-01T00:00:00.000Z"),
    courseEndDate: new Date("2027-01-01T00:00:00.000Z"),
    centre: { _id: centreId, name: "North Centre", code: "NORTH" },
    batch: {
      _id: batchId,
      name: "JEE Morning",
      course: "JEE",
      academicYear: "2027",
    },
  };
  const instalment = {
    _id: instalmentId,
    instalmentNumber: 1,
    amountPaise: 10000,
    dueDate: new Date(Date.now() + 86400000),
  };

  return {
    user: {
      _id: userId,
      role,
      centres: centreIds,
      isActive: true,
    },
    student,
    instalment,
    consent: {
      parent: parentId,
      student: studentId,
      purpose: "STUDENT_DATA_PROCESSING",
      status: "GRANTED",
    },
    feePlan: {
      _id: feePlanId,
      status: "ACTIVE",
      totalCourseFeePaise: 10000,
      discountType: "FIXED",
      discountValue: 0,
      discountAmountPaise: 0,
      finalPayablePaise: 10000,
    },
    payment: {
      _id: paymentId,
      instalment: instalmentId,
      amountPaise: 2500,
      paymentMethod: "GATEWAY",
      transactionId: "TXN-001",
      paidAt: new Date("2026-10-01T00:00:00.000Z"),
    },
  };
};

const authenticateRequest = (userId) => ({
  Authorization: `Bearer ${jwt.sign({ sub: userId }, secret)}`,
});

const requestLedger = async (id = studentId, userId = scenario.user._id) => {
  const response = await fetch(`${endpoint}/${id}/ledger`, {
    headers: authenticateRequest(userId),
  });

  return {
    response,
    body: await response.json(),
  };
};

before(async () => {
  previousJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;

  mock.method(User, "findById", () => ({
    select: async () => scenario.user,
  }));
  mock.method(Student, "findById", () => query(scenario.student));
  mock.method(Student, "findOne", async (filter) => {
    const matchesId = filter._id.toString() === scenario.student._id;
    const matchesParent = filter.parent.toString() === scenario.student.parent;
    return matchesId && matchesParent ? scenario.student : null;
  });
  mock.method(Consent, "findOne", async (filter) => {
    if (
      filter.status === "GRANTED" &&
      scenario.consent?.student === filter.student.toString() &&
      scenario.consent?.parent === filter.parent.toString()
    ) {
      return scenario.consent;
    }

    return null;
  });
  mock.method(FeePlan, "findOne", async () => scenario.feePlan);
  mock.method(Instalment, "find", () => query([scenario.instalment]));
  mock.method(Instalment, "findById", async () => scenario.instalment);
  mock.method(Payment, "aggregate", async () => [{ totalPaid: 2500 }]);
  mock.method(Payment, "find", () => query([scenario.payment]));

  const app = express();
  app.use("/api/fees", feeRoutes);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  endpoint = `http://127.0.0.1:${server.address().port}/api/fees/students`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  mock.restoreAll();

  if (previousJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = previousJwtSecret;
  }
});

test("accounts can retrieve a ledger for an assigned centre", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountId });

  const { response, body } = await requestLedger();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.student.studentId, "STU-001");
  assert.equal(body.data.feePlan.finalPayablePaise, 10000);
  assert.equal(body.data.instalments[0].amountPaidPaise, 2500);
  assert.equal(body.data.instalments[0].remainingBalancePaise, 7500);
  assert.equal(body.data.instalments[0].paymentStatus, "PARTIALLY_PAID");
  assert.equal(body.data.paymentHistory.length, 1);
  assert.equal("parent" in body.data.student, false);
  assert.equal("password" in body.data.student, false);
});

test("accounts cannot retrieve a ledger outside assigned centres", async () => {
  scenario = createScenario({
    role: "ACCOUNTS",
    userId: accountId,
    centreIds: [otherCentreId],
  });

  const { response, body } = await requestLedger();

  assert.equal(response.status, 403);
  assert.equal(body.success, false);
});

test("counsellors cannot retrieve fee ledgers", async () => {
  scenario = createScenario({ role: "COUNSELLOR", userId: accountId });

  const { response, body } = await requestLedger();

  assert.equal(response.status, 403);
  assert.equal(body.success, false);
});

test("a parent can retrieve their own child's ledger with active consent", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });

  const { response, body } = await requestLedger();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
});

test("a parent cannot retrieve another parent's child's ledger", async () => {
  scenario = createScenario({ role: "PARENT", userId: otherParentId });

  const { response, body } = await requestLedger();

  assert.equal(response.status, 404);
  assert.equal(body.success, false);
});

test("a parent without active consent cannot retrieve a child's ledger", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });
  scenario.consent = null;

  const { response, body } = await requestLedger();

  assert.equal(response.status, 403);
  assert.equal(body.success, false);
});

test("invalid student IDs are rejected", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountId });

  const { response, body } = await requestLedger("not-an-object-id");

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.message, "Invalid student ID");
});
