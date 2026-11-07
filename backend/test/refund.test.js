import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import AuditLog from "../src/models/AuditLog.js";
import Consent from "../src/models/Consent.js";
import Payment from "../src/models/Payment.js";
import Refund from "../src/models/Refund.js";
import Student from "../src/models/Student.js";
import User from "../src/models/User.js";
import refundRoutes from "../src/routes/refund.routes.js";
import { calculateRefund } from "../src/services/refund/refund.service.js";

const secret = "refund-test-jwt-secret";
const parentId = "64e000000000000000000001";
const otherParentId = "64e000000000000000000002";
const accountsId = "64e000000000000000000003";
const centreId = "64e000000000000000000004";
const otherCentreId = "64e000000000000000000005";
const studentId = "64e000000000000000000006";
const refundId = "64e000000000000000000007";

let server;
let endpoint;
let scenario;
let previousJwtSecret;
let previousNodeEnv;
let transactionTail = Promise.resolve();

const query = (getValue) => ({
  select() {
    return this;
  },
  sort() {
    return this;
  },
  session() {
    return this;
  },
  then(resolve, reject) {
    return Promise.resolve().then(getValue).then(resolve, reject);
  },
});

const createScenario = ({ role, userId, centreIds = [centreId] }) => ({
  user: {
    _id: userId,
    role,
    centres: centreIds,
    isActive: true,
  },
  student: {
    _id: studentId,
    studentId: "STU-REFUND-001",
    name: "Refund Test Student",
    parent: parentId,
    centre: centreId,
    courseStartDate: new Date("2026-01-01T00:00:00.000Z"),
    courseEndDate: new Date("2027-01-01T00:00:00.000Z"),
    __v: 0,
  },
  consent: {
    parent: parentId,
    student: studentId,
    purpose: "STUDENT_DATA_PROCESSING",
    status: "GRANTED",
  },
  payments: [
    { amountPaise: 100000, status: "SUCCESS" },
    { amountPaise: 25000, status: "FAILED" },
    { amountPaise: 10000, status: "PENDING" },
  ],
  refunds: [],
  audits: [],
});

const makeRefund = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId().toString(),
  student: studentId,
  totalPaidPaise: 100000,
  eligibleAmountPaise: 100000,
  unusedCourseDays: 183,
  totalCourseDays: 365,
  refundAmountPaise: 50137,
  withdrawalDate: new Date("2026-07-02T00:00:00.000Z"),
  status: "PENDING",
  decisionBy: null,
  decisionAt: null,
  rejectionReason: null,
  approvedBy: null,
  processedAt: null,
  processedBy: null,
  refundTransactionId: null,
  createdAt: new Date("2026-11-06T00:00:00.000Z"),
  ...overrides,
  async save() {
    return this;
  },
});

const authenticateRequest = (userId) => ({
  Authorization: `Bearer ${jwt.sign({ sub: userId }, secret)}`,
});

const request = async (method, path, userId, body) => {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      ...authenticateRequest(userId),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  return { response, body: await response.json() };
};

const findRefund = (id) =>
  scenario.refunds.find((refund) => refund._id.toString() === id.toString());

const isActiveStatus = (status) =>
  ["PENDING", "APPROVED", "PROCESSING", "PROCESSED"].includes(status);

before(async () => {
  previousJwtSecret = process.env.JWT_SECRET;
  previousNodeEnv = process.env.NODE_ENV;
  process.env.JWT_SECRET = secret;
  process.env.NODE_ENV = "development";

  mock.method(User, "findById", () => ({
    select: async () => scenario.user,
  }));
  mock.method(Student, "findById", () => ({
    select: async () => scenario.student,
  }));
  mock.method(Student, "findOne", async (filter) => {
    if (
      filter._id.toString() === scenario.student._id &&
      filter.parent.toString() === scenario.student.parent
    ) {
      return scenario.student;
    }
    return null;
  });
  mock.method(Student, "findOneAndUpdate", async (filter) => {
    if (filter._id.toString() !== scenario.student._id) {
      return null;
    }
    scenario.student.__v += 1;
    return scenario.student;
  });
  mock.method(Consent, "findOne", async (filter) => {
    if (
      scenario.consent &&
      filter.status === "GRANTED" &&
      filter.student.toString() === scenario.student._id &&
      filter.parent.toString() === scenario.student.parent
    ) {
      return scenario.consent;
    }
    return null;
  });
  mock.method(Payment, "aggregate", (pipeline) => ({
    session() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve().then(() => {
        const successfulOnly = pipeline?.[0]?.$match?.status === "SUCCESS";
        const total = successfulOnly
          ? scenario.payments
            .filter((payment) => payment.status === "SUCCESS")
            .reduce((sum, payment) => sum + payment.amountPaise, 0)
          : 0;
        return total ? [{ total }] : [];
      }).then(resolve, reject);
    },
  }));
  mock.method(Refund, "aggregate", (pipeline) => ({
    session() {
      return this;
    },
    then(resolve, reject) {
      const statuses = pipeline[0].$match.status.$in;
      const total = scenario.refunds
        .filter((refund) => statuses.includes(refund.status))
        .reduce((sum, refund) => sum + refund.refundAmountPaise, 0);
      return Promise.resolve(total ? [{ total }] : []).then(resolve, reject);
    },
  }));
  mock.method(Refund, "findOne", (filter) =>
    query(() => scenario.refunds.find((refund) =>
      refund.student.toString() === filter.student.toString() &&
      refund.withdrawalDate.getTime() === filter.withdrawalDate.getTime() &&
      filter.status.$in.includes(refund.status)
    ) ?? null)
  );
  mock.method(Refund, "create", async (input) => {
    const records = Array.isArray(input) ? input : [input];
    for (const record of records) {
      const duplicate = scenario.refunds.some((refund) =>
        refund.student.toString() === record.student.toString() &&
        refund.withdrawalDate.getTime() === record.withdrawalDate.getTime() &&
        isActiveStatus(refund.status)
      );
      if (duplicate) {
        const error = new Error("Duplicate active refund");
        error.code = 11000;
        throw error;
      }
    }

    const created = records.map((record) =>
      makeRefund({
        ...record,
        _id: new mongoose.Types.ObjectId().toString(),
      })
    );
    scenario.refunds.push(...created);
    return Array.isArray(input) ? created : created[0];
  });
  mock.method(Refund, "findById", async (id) => findRefund(id) ?? null);
  mock.method(Refund, "findOneAndUpdate", async (filter, update) => {
    const refund = findRefund(filter._id);
    if (!refund || refund.status !== filter.status) {
      return null;
    }

    Object.assign(refund, update.$set);
    return refund;
  });
  mock.method(Refund, "find", (filter) =>
    query(() => scenario.refunds.filter(
      (refund) => refund.student.toString() === filter.student.toString()
    ))
  );
  mock.method(AuditLog, "create", async (records) => {
    scenario.audits.push(...records);
  });
  mock.method(mongoose, "startSession", async () => ({
    async withTransaction(callback) {
      const pending = transactionTail.then(async () => {
        const refundsSnapshot = scenario.refunds.map((refund) => ({
          refund,
          state: { ...refund },
        }));
        const auditCount = scenario.audits.length;
        const version = scenario.student.__v;

        try {
          return await callback();
        } catch (error) {
          for (const item of refundsSnapshot) {
            Object.assign(item.refund, item.state);
          }
          scenario.refunds.length = refundsSnapshot.length;
          scenario.audits.length = auditCount;
          scenario.student.__v = version;
          throw error;
        }
      });
      transactionTail = pending.catch(() => {});
      return pending;
    },
    async endSession() {},
  }));

  const app = express();
  app.use(express.json());
  app.use("/api/refunds", refundRoutes);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  endpoint = `http://127.0.0.1:${server.address().port}/api/refunds`;
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
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
});

test("valid refund calculation returns demo estimate", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });

  const { response, body } = await request(
    "POST",
    "/calculate",
    parentId,
    { studentId, withdrawalDate: "2026-07-02" }
  );

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.totalPaidPaise, 100000);
  assert.equal(body.data.eligibleAmountPaise, 100000);
  assert.equal(body.data.formulaAssumption.includes("not verified legal policy"), true);
});

test("refund calculation excludes failed and pending payments", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });
  scenario.payments.push(
    { amountPaise: 90000, status: "FAILED" },
    { amountPaise: 50000, status: "PENDING" }
  );

  const { body } = await request(
    "POST",
    "/calculate",
    parentId,
    { studentId, withdrawalDate: "2026-07-02" }
  );

  assert.equal(body.data.totalPaidPaise, 100000);
  assert.equal(body.data.eligibleAmountPaise, 100000);
});

test("refund formula rejects invalid course dates", () => {
  assert.throws(
    () => calculateRefund({
      eligiblePaidFeesPaise: 1000,
      courseStartDate: "not-a-date",
      courseEndDate: "2027-01-01",
      withdrawalDate: "2026-07-01",
    }),
    /Invalid course or withdrawal date/
  );
});

test("withdrawal date must be valid and within course dates", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });

  const malformed = await request("POST", "/calculate", parentId, {
    studentId,
    withdrawalDate: "2026-02-31",
  });
  const outsideCourse = await request("POST", "/calculate", parentId, {
    studentId,
    withdrawalDate: "2027-01-02",
  });

  assert.equal(malformed.response.status, 400);
  assert.equal(outsideCourse.response.status, 400);
});

test("refund request cannot use client-supplied amount above eligible payments", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });

  const { response, body } = await request("POST", "/", parentId, {
    studentId,
    withdrawalDate: "2026-07-02",
    refundAmountPaise: 999999999,
    eligibleAmountPaise: 999999999,
  });

  assert.equal(response.status, 201);
  assert.equal(body.data.refundAmountPaise <= 100000, true);
  assert.equal(body.data.eligibleAmountPaise, 100000);
  assert.equal(scenario.audits[0].action, "REFUND_REQUEST_CREATED");
});

test("duplicate active requests for the same withdrawal date are rejected", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });

  const first = await request("POST", "/", parentId, {
    studentId,
    withdrawalDate: "2026-07-02",
  });
  const duplicate = await request("POST", "/", parentId, {
    studentId,
    withdrawalDate: "2026-07-02",
  });

  assert.equal(first.response.status, 201);
  assert.equal(duplicate.response.status, 409);
  assert.equal(scenario.refunds.length, 1);
});

test("parent cannot create a refund for another parent's student", async () => {
  scenario = createScenario({ role: "PARENT", userId: otherParentId });

  const { response } = await request("POST", "/", otherParentId, {
    studentId,
    withdrawalDate: "2026-07-02",
  });

  assert.equal(response.status, 404);
  assert.equal(scenario.refunds.length, 0);
});

test("parent without active consent cannot create a refund", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });
  scenario.consent = null;

  const { response } = await request("POST", "/", parentId, {
    studentId,
    withdrawalDate: "2026-07-02",
  });

  assert.equal(response.status, 403);
  assert.equal(scenario.refunds.length, 0);
});

test("accounts cannot request or list refunds outside assigned centres", async () => {
  scenario = createScenario({
    role: "ACCOUNTS",
    userId: accountsId,
    centreIds: [otherCentreId],
  });

  const creation = await request("POST", "/", accountsId, {
    studentId,
    withdrawalDate: "2026-07-02",
  });
  const listing = await request(
    "GET",
    `/student/${studentId}`,
    accountsId
  );

  assert.equal(creation.response.status, 403);
  assert.equal(listing.response.status, 403);
});

test("only accounts users can decide a refund", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });
  const refund = makeRefund();
  scenario.refunds.push(refund);

  const { response } = await request(
    "PATCH",
    `/${refund._id}/decision`,
    parentId,
    { decision: "APPROVE" }
  );

  assert.equal(response.status, 403);
  assert.equal(refund.status, "PENDING");
});

test("rejecting a refund requires a reason", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountsId });
  const refund = makeRefund();
  scenario.refunds.push(refund);

  const { response } = await request(
    "PATCH",
    `/${refund._id}/decision`,
    accountsId,
    { decision: "REJECT" }
  );

  assert.equal(response.status, 400);
  assert.equal(refund.status, "PENDING");
});

test("only approved refunds can be processed", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountsId });
  const refund = makeRefund({ status: "PENDING" });
  scenario.refunds.push(refund);

  const { response } = await request(
    "POST",
    `/${refund._id}/process`,
    accountsId
  );

  assert.equal(response.status, 409);
  assert.equal(refund.status, "PENDING");
});

test("refund processing cannot be repeated", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountsId });
  const refund = makeRefund({ status: "APPROVED" });
  scenario.refunds.push(refund);

  const first = await request(
    "POST",
    `/${refund._id}/process`,
    accountsId
  );
  const second = await request(
    "POST",
    `/${refund._id}/process`,
    accountsId
  );

  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 409);
  assert.equal(refund.status, "PROCESSED");
  assert.ok(refund.refundTransactionId);
});

test("concurrent processing produces exactly one refund transaction", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountsId });
  const refund = makeRefund({ status: "APPROVED" });
  scenario.refunds.push(refund);

  const results = await Promise.all([
    request("POST", `/${refund._id}/process`, accountsId),
    request("POST", `/${refund._id}/process`, accountsId),
  ]);

  assert.deepEqual(
    results.map(({ response }) => response.status).sort(),
    [200, 409]
  );
  assert.equal(refund.status, "PROCESSED");
  assert.equal(scenario.audits.filter(
    (audit) => audit.action === "REFUND_PROCESSED"
  ).length, 1);
});

test("refund decision and processing create audit records", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountsId });
  const refund = makeRefund();
  scenario.refunds.push(refund);

  const decision = await request(
    "PATCH",
    `/${refund._id}/decision`,
    accountsId,
    { decision: "APPROVE" }
  );
  const processing = await request(
    "POST",
    `/${refund._id}/process`,
    accountsId
  );

  assert.equal(decision.response.status, 200);
  assert.equal(refund.decisionBy.toString(), accountsId);
  assert.ok(refund.decisionAt instanceof Date);
  assert.equal(processing.response.status, 200);
  assert.deepEqual(
    scenario.audits.map((audit) => audit.action),
    ["REFUND_APPROVED", "REFUND_PROCESSED"]
  );
});
