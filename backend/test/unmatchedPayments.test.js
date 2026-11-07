import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import AuditLog from "../src/models/AuditLog.js";
import Instalment from "../src/models/Instalment.js";
import Payment from "../src/models/Payment.js";
import Student from "../src/models/Student.js";
import UnmatchedPayment from "../src/models/UnmatchedPayment.js";
import { listUnmatchedPayments, matchUnmatchedPayment, rejectUnmatchedPayment } from "../src/services/payment/unmatchedPayment.service.js";

const centre = "64d000000000000000000004";
const otherCentre = "64d000000000000000000005";
const chain = (value) => {
  const result = {
    select() { return this; }, populate() { return this; }, sort() { return this; },
    skip() { return this; }, limit() { return this; }, session() { return this; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
  return result;
};

test("unmatched list is paginated, centre-scoped, and filters status/method", async (t) => {
  const expected = [{ _id: "receipt-1", status: "UNMATCHED" }];
  let observed;
  t.mock.method(UnmatchedPayment, "find", (filter) => { observed = filter; return chain(expected); });
  t.mock.method(UnmatchedPayment, "countDocuments", async () => 1);
  const result = await listUnmatchedPayments({ user: { centres: [centre] }, filters: { status: "UNMATCHED", paymentMethod: "UPI", page: "2", limit: "5" } });
  assert.deepEqual(observed, { centre: { $in: [centre] }, status: "UNMATCHED", paymentMethod: "UPI" });
  assert.equal(result.items[0]._id, expected[0]._id);
  assert.deepEqual(result.pagination, { page: 2, limit: 5, total: 1, pages: 1 });
});

test("unmatched list rejects unauthorized centre filter before querying", async (t) => {
  t.mock.method(UnmatchedPayment, "find", () => { throw new Error("must not query"); });
  await assert.rejects(
    listUnmatchedPayments({ user: { centres: [centre] }, filters: { centreId: otherCentre } }),
    (error) => error.statusCode === 403,
  );
});

test("unmatched list rejects invalid pagination and status", async (t) => {
  t.mock.method(UnmatchedPayment, "find", () => { throw new Error("must not query"); });
  const user = { centres: [centre] };
  await assert.rejects(listUnmatchedPayments({ user, filters: { page: "0" } }), (error) => error.statusCode === 400);
  await assert.rejects(listUnmatchedPayments({ user, filters: { status: "SUCCESS" } }), (error) => error.statusCode === 400);
});

test("rejection requires a reason and updates only the unmatched record", async (t) => {
  const id = "64d000000000000000000010";
  let update;
  const record = { _id: id, centre, transactionId: "receipt-10" };
  t.mock.method(mongoose, "startSession", async () => ({
    withTransaction: async (callback) => callback(), endSession: async () => {},
  }));
  t.mock.method(UnmatchedPayment, "findOne", () => chain(record));
  t.mock.method(UnmatchedPayment, "updateOne", async (filter, set) => { update = { filter, set }; return { modifiedCount: 1 }; });
  t.mock.method(AuditLog, "create", async () => []);
  await assert.rejects(rejectUnmatchedPayment({ id, user: { _id: "user-1", centres: [centre] }, reason: "  " }), (error) => error.statusCode === 400);
  await rejectUnmatchedPayment({ id, user: { _id: "user-1", centres: [centre] }, reason: "No supporting receipt" });
  assert.deepEqual(update.filter, { _id: id, status: "UNMATCHED" });
  assert.equal(update.set.$set.status, "REJECTED");
  assert.equal(update.set.$set.reviewNotes, "No supporting receipt");
});

const matchScenario = (t, { totalPaid = 0, createError } = {}) => {
  const id = "64d000000000000000000010";
  const studentId = "64d000000000000000000011";
  const instalmentId = "64d000000000000000000012";
  const record = { _id: id, centre, transactionId: "receipt-match", amountPaise: 3000, paymentMethod: "UPI", paymentDate: new Date("2026-10-01") };
  const student = { _id: studentId, centre, parent: "64d000000000000000000013" };
  const instalment = { _id: instalmentId, student: studentId, amountPaise: 10000 };
  const created = [];
  let update;
  t.mock.method(mongoose, "startSession", async () => ({ withTransaction: async (callback) => callback(), endSession: async () => {} }));
  t.mock.method(UnmatchedPayment, "findOne", () => chain(record));
  t.mock.method(UnmatchedPayment, "updateOne", async (filter, set) => { update = { filter, set }; return { modifiedCount: 1 }; });
  t.mock.method(Student, "findById", () => chain(student));
  t.mock.method(Instalment, "findById", () => chain(instalment));
  t.mock.method(Instalment, "findOneAndUpdate", async () => instalment);
  t.mock.method(Payment, "aggregate", () => chain(totalPaid ? [{ total: totalPaid }] : []));
  t.mock.method(Payment, "create", async (rows) => { created.push(...rows); if (createError) throw createError; return [{ _id: "payment-1", ...rows[0] }]; });
  t.mock.method(AuditLog, "create", async () => []);
  return { id, studentId, instalmentId, created, get update() { return update; } };
};

test("matching records a successful payment and atomically marks the source matched", async (t) => {
  const scenario = matchScenario(t);
  const payment = await matchUnmatchedPayment({ id: scenario.id, studentId: scenario.studentId, instalmentId: scenario.instalmentId, user: { _id: "accounts-1", role: "ACCOUNTS", centres: [centre] } });
  assert.equal(payment.status, "SUCCESS");
  assert.equal(scenario.created[0].status, "SUCCESS");
  assert.equal(scenario.created[0].transactionId, "receipt-match");
  assert.deepEqual(scenario.update.filter, { _id: scenario.id, status: "UNMATCHED" });
  assert.equal(scenario.update.set.$set.status, "MATCHED");
});

test("matching rejects overpayment and duplicate payment references", async (t) => {
  const user = { _id: "accounts-1", role: "ACCOUNTS", centres: [centre] };
  const overpaid = matchScenario(t, { totalPaid: 8000 });
  await assert.rejects(matchUnmatchedPayment({ id: overpaid.id, studentId: overpaid.studentId, instalmentId: overpaid.instalmentId, user }), (error) => error.statusCode === 400 && /exceeds outstanding/.test(error.message));
  assert.equal(overpaid.created.length, 0);

  const duplicate = matchScenario(t, { createError: Object.assign(new Error("duplicate"), { code: 11000 }) });
  await assert.rejects(matchUnmatchedPayment({ id: duplicate.id, studentId: duplicate.studentId, instalmentId: duplicate.instalmentId, user }), (error) => error.statusCode === 409);
});
