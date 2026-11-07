import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import AuditLog from "../src/models/AuditLog.js";
import Consent from "../src/models/Consent.js";
import Instalment from "../src/models/Instalment.js";
import Payment from "../src/models/Payment.js";
import Reminder from "../src/models/Reminder.js";
import Student from "../src/models/Student.js";
import User from "../src/models/User.js";
import paymentRoutes from "../src/routes/payment.routes.js";
import { confirmPayment } from "../src/services/payment/paymentConfirmation.service.js";
import {
  generateSignature,
} from "../src/services/payment/mockGateway.service.js";

const secret = "payment-test-jwt-secret";
const parentId = "64d000000000000000000001";
const otherParentId = "64d000000000000000000002";
const accountsId = "64d000000000000000000003";
const centreId = "64d000000000000000000004";
const otherCentreId = "64d000000000000000000005";
const studentId = "64d000000000000000000006";
const instalmentId = "64d000000000000000000007";
const paymentId1 = "64d000000000000000000008";
const paymentId2 = "64d000000000000000000009";

let server;
let endpoint;
let scenario;
let previousEnv;
let transactionTail = Promise.resolve();

const query = (getValue) => ({
  select() {
    return this;
  },
  populate() {
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

const createScenario = ({ role, userId, centreIds = [centreId] }) => {
  const student = {
    _id: studentId,
    parent: parentId,
    centre: centreId,
    studentId: "STU-PAY-001",
    name: "Payment Test Student",
  };
  const instalment = {
    _id: instalmentId,
    student: studentId,
    amountPaise: 10000,
    __v: 0,
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
    payments: [],
    audits: [],
    reminderCancellations: 0,
  };
};

const makePayment = ({
  id = paymentId1,
  amountPaise = 4000,
  paymentMethod = "GATEWAY",
  status = "PENDING",
  transactionId,
} = {}) => ({
  _id: id,
  student: studentId,
  instalment: instalmentId,
  amountPaise,
  paymentMethod,
  status,
  transactionId,
  paidAt: null,
  createdAt: new Date("2026-11-06T00:00:00.000Z"),
  async save() {
    if (
      this.transactionId &&
      scenario.payments.some(
        (payment) =>
          payment !== this &&
          payment.transactionId === this.transactionId
      )
    ) {
      const error = new Error("Duplicate transaction ID");
      error.code = 11000;
      throw error;
    }

    return this;
  },
});

const successfulPaid = (instalment) =>
  scenario.payments
    .filter(
      (payment) =>
        payment.instalment.toString() === instalment._id.toString() &&
        payment.status === "SUCCESS"
    )
    .reduce((sum, payment) => sum + payment.amountPaise, 0);

const authenticateRequest = (userId) => ({
  Authorization: `Bearer ${jwt.sign({ sub: userId }, secret)}`,
});

const post = async (path, userId, body) => {
  const response = await fetch(`${endpoint}${path}`, {
    method: "POST",
    headers: {
      ...authenticateRequest(userId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return { response, body: await response.json() };
};

const get = async (path, userId) => {
  const response = await fetch(`${endpoint}${path}`, {
    headers: authenticateRequest(userId),
  });

  return { response, body: await response.json() };
};

const confirmMock = async (payment, transactionId, status = "SUCCESS") => {
  const payload = {
    paymentId: payment._id.toString(),
    gatewayTransactionId: transactionId,
    amountPaise: payment.amountPaise,
    status,
  };
  return confirmPayment(payload, generateSignature(payload));
};

before(async () => {
  previousEnv = {
    JWT_SECRET: process.env.JWT_SECRET,
    MOCK_GATEWAY_SECRET: process.env.MOCK_GATEWAY_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  };
  process.env.JWT_SECRET = secret;
  process.env.MOCK_GATEWAY_SECRET = "payment-test-hmac-secret";
  process.env.NODE_ENV = "development";

  mock.method(User, "findById", () => ({
    select: async () => scenario.user,
  }));
  mock.method(Student, "findById", () => query(() => scenario.student));
  mock.method(Student, "findOne", async (filter) => {
    if (
      filter._id.toString() === scenario.student._id &&
      filter.parent.toString() === scenario.student.parent
    ) {
      return scenario.student;
    }
    return null;
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
  mock.method(Instalment, "findById", () =>
    query(() => scenario.instalment)
  );
  mock.method(Instalment, "findOneAndUpdate", async (filter) => {
    if (filter._id.toString() !== scenario.instalment._id) {
      return null;
    }
    scenario.instalment.__v += 1;
    return scenario.instalment;
  });
  mock.method(Instalment, "updateOne", async () => {
    scenario.instalment.__v += 1;
  });
  mock.method(Payment, "create", async (input) => {
    const records = Array.isArray(input) ? input : [input];
    for (const record of records) {
      if (
        record.transactionId &&
        scenario.payments.some(
          (payment) => payment.transactionId === record.transactionId
        )
      ) {
        const error = new Error("Duplicate transaction ID");
        error.code = 11000;
        throw error;
      }
    }

    if (Array.isArray(input)) {
      const payment = makePayment({
        id: new mongoose.Types.ObjectId().toString(),
        ...input[0],
      });
      scenario.payments.push(payment);
      return [payment];
    }
    const payment = makePayment({
      id: new mongoose.Types.ObjectId().toString(),
      ...input,
    });
    scenario.payments.push(payment);
    return payment;
  });
  mock.method(Payment, "findById", (id) =>
    query(() =>
      scenario.payments.find((payment) => payment._id.toString() === id.toString()) ??
      null
    )
  );
  mock.method(Payment, "aggregate", () => ({
    session() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve([
        {
          totalPaid: successfulPaid(scenario.instalment),
          total: successfulPaid(scenario.instalment),
        },
      ]).then(resolve, reject);
    },
  }));
  mock.method(Payment, "find", (filter) =>
    query(() => scenario.payments.filter(
      (payment) => payment.student.toString() === filter.student.toString()
    ))
  );
  mock.method(AuditLog, "create", async (entries) => {
    scenario.audits.push(...entries);
  });
  mock.method(Reminder, "updateMany", async () => {
    scenario.reminderCancellations += 1;
    return { modifiedCount: 1 };
  });
  mock.method(mongoose, "startSession", async () => ({
    async withTransaction(callback) {
      const pending = transactionTail.then(async () => {
        const paymentState = scenario.payments.map((payment) => ({
          payment,
          status: payment.status,
          transactionId: payment.transactionId,
          paidAt: payment.paidAt,
        }));
        const originalPaymentCount = scenario.payments.length;
        const originalAuditCount = scenario.audits.length;
        const originalReminderCount = scenario.reminderCancellations;
        const originalVersion = scenario.instalment.__v;

        try {
          return await callback();
        } catch (error) {
          for (const state of paymentState) {
            Object.assign(state.payment, {
              status: state.status,
              transactionId: state.transactionId,
              paidAt: state.paidAt,
            });
          }
          scenario.payments.length = originalPaymentCount;
          scenario.audits.length = originalAuditCount;
          scenario.reminderCancellations = originalReminderCount;
          scenario.instalment.__v = originalVersion;
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
  app.use("/api/payments", paymentRoutes);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  endpoint = `http://127.0.0.1:${server.address().port}/api/payments`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  mock.restoreAll();

  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test("parent initiates payment for own child", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });

  const { response, body } = await post("/initiate", parentId, {
    studentId,
    instalmentId,
    amountPaise: 4000,
  });

  assert.equal(response.status, 201);
  assert.equal(body.data.status, "PENDING");
  assert.equal(body.data.amountPaise, 4000);
  assert.equal(scenario.payments.length, 1);
});

test("parent cannot initiate payment for another parent's child", async () => {
  scenario = createScenario({ role: "PARENT", userId: otherParentId });

  const { response } = await post("/initiate", otherParentId, {
    studentId,
    instalmentId,
    amountPaise: 4000,
  });

  assert.equal(response.status, 404);
  assert.equal(scenario.payments.length, 0);
});

test("parent without consent cannot initiate payment", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });
  scenario.consent = null;

  const { response } = await post("/initiate", parentId, {
    studentId,
    instalmentId,
    amountPaise: 4000,
  });

  assert.equal(response.status, 403);
  assert.equal(scenario.payments.length, 0);
});

test("payment amount above outstanding balance is rejected", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });
  scenario.payments.push(makePayment({
    id: paymentId2,
    amountPaise: 8000,
    status: "SUCCESS",
    transactionId: "TXN-PAID-1",
  }));

  const { response, body } = await post("/initiate", parentId, {
    studentId,
    instalmentId,
    amountPaise: 3000,
  });

  assert.equal(response.status, 400);
  assert.match(body.message, /outstanding balance/);
});

test("a successful partial payment reduces only the paid amount", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });
  const payment = makePayment({ amountPaise: 4000 });
  scenario.payments.push(payment);

  const { response, body } = await post("/mock-process", parentId, {
    paymentId: payment._id,
    outcome: "SUCCESS",
  });

  assert.equal(response.status, 200);
  assert.equal(body.data.status, "SUCCESS");
  assert.equal(successfulPaid(scenario.instalment), 4000);
  assert.equal(scenario.reminderCancellations, 0);
});

test("successful gateway confirmation is processed and does not expose a signature", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });
  const payment = makePayment();
  scenario.payments.push(payment);

  const { response, body } = await post("/mock-process", parentId, {
    paymentId: payment._id,
    outcome: "SUCCESS",
    status: "SUCCESS",
    signature: "client-signature-is-ignored",
  });

  assert.equal(response.status, 200);
  assert.equal(body.data.status, "SUCCESS");
  assert.equal(JSON.stringify(body).includes("payment-test-hmac-secret"), false);
  assert.equal(body.data.transactionId.startsWith("MOCK_"), true);
});

test("failed gateway confirmation does not reduce balance", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });
  const payment = makePayment();
  scenario.payments.push(payment);

  const { response, body } = await post("/mock-process", parentId, {
    paymentId: payment._id,
    outcome: "FAILED",
  });

  assert.equal(response.status, 200);
  assert.equal(body.data.status, "FAILED");
  assert.equal(successfulPaid(scenario.instalment), 0);
});

test("duplicate successful gateway callback is idempotent", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });
  const payment = makePayment();
  scenario.payments.push(payment);

  const first = await confirmMock(payment, "TXN-DUPLICATE");
  const second = await confirmMock(payment, "TXN-DUPLICATE");

  assert.equal(first.status, "SUCCESS");
  assert.equal(second.status, "SUCCESS");
  assert.equal(successfulPaid(scenario.instalment), 4000);
});

test("gateway transaction ID cannot be reused for another payment", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });
  const firstPayment = makePayment({ id: paymentId1, amountPaise: 3000 });
  const secondPayment = makePayment({ id: paymentId2, amountPaise: 3000 });
  scenario.payments.push(firstPayment, secondPayment);

  await confirmMock(firstPayment, "TXN-UNIQUE");
  await assert.rejects(
    confirmMock(secondPayment, "TXN-UNIQUE"),
    (error) => error.code === 11000
  );
  assert.equal(secondPayment.status, "PENDING");
});

test("concurrent confirmations cannot overpay an instalment", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });
  const firstPayment = makePayment({ id: paymentId1, amountPaise: 7000 });
  const secondPayment = makePayment({ id: paymentId2, amountPaise: 7000 });
  scenario.payments.push(firstPayment, secondPayment);

  const results = await Promise.allSettled([
    confirmMock(firstPayment, "TXN-CONCURRENT-1"),
    confirmMock(secondPayment, "TXN-CONCURRENT-2"),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(successfulPaid(scenario.instalment), 7000);
});

test("accounts can record offline payment and audit it", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountsId });

  const { response, body } = await post("/offline", accountsId, {
    studentId,
    instalmentId,
    amountPaise: 5000,
    paymentMethod: "UPI",
    transactionId: "UPI-REFERENCE-001",
  });

  assert.equal(response.status, 201);
  assert.equal(body.data.status, "SUCCESS");
  assert.equal(body.data.paymentMethod, "UPI");
  assert.equal(scenario.audits.length, 1);
  assert.equal(scenario.audits[0].action, "OFFLINE_PAYMENT_RECORDED");
});

test("offline payment references cannot be reused", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountsId });
  scenario.payments.push(makePayment({
    amountPaise: 1000,
    status: "SUCCESS",
    transactionId: "UPI-DUPLICATE-001",
  }));

  const { response, body } = await post("/offline", accountsId, {
    studentId,
    instalmentId,
    amountPaise: 1000,
    paymentMethod: "UPI",
    transactionId: "UPI-DUPLICATE-001",
  });

  assert.equal(response.status, 409);
  assert.match(body.message, /already been used/);
  assert.equal(scenario.payments.length, 1);
});

test("accounts cannot record offline payment outside assigned centres", async () => {
  scenario = createScenario({
    role: "ACCOUNTS",
    userId: accountsId,
    centreIds: [otherCentreId],
  });

  const { response } = await post("/offline", accountsId, {
    studentId,
    instalmentId,
    amountPaise: 5000,
    paymentMethod: "CASH",
    receiptNumber: "CASH-UNAUTHORIZED-001",
  });

  assert.equal(response.status, 403);
  assert.equal(scenario.payments.length, 0);
});

test("fully paid instalment cancels reminders after offline payment", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountsId });
  scenario.payments.push(makePayment({
    id: paymentId1,
    amountPaise: 4000,
    status: "SUCCESS",
    transactionId: "TXN-PARTIAL",
  }));

  const { response } = await post("/offline", accountsId, {
    studentId,
    instalmentId,
    amountPaise: 6000,
    paymentMethod: "CASH",
    receiptNumber: "CASH-RECEIPT-001",
  });

  assert.equal(response.status, 201);
  assert.equal(successfulPaid(scenario.instalment), 10000);
  assert.equal(scenario.reminderCancellations, 1);
});

test("successful gateway payment cancels reminders when the instalment is fully paid", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });
  const payment = makePayment({ amountPaise: 10000 });
  scenario.payments.push(payment);

  const { response } = await post("/mock-process", parentId, {
    paymentId: payment._id,
    outcome: "SUCCESS",
  });

  assert.equal(response.status, 200);
  assert.equal(scenario.reminderCancellations, 1);
});

test("accounts can retrieve safe payment history for assigned centre", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountsId });
  scenario.payments.push(makePayment({
    amountPaise: 5000,
    status: "SUCCESS",
    transactionId: "TXN-HISTORY",
  }));

  const { response, body } = await get(`/student/${studentId}`, accountsId);

  assert.equal(response.status, 200);
  assert.equal(body.data.payments.length, 1);
  assert.equal(body.data.payments[0].status, "SUCCESS");
  assert.equal("recordedBy" in body.data.payments[0], false);
});
