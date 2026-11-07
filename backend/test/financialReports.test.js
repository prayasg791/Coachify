import assert from "node:assert/strict";
import { test } from "node:test";
import Receipt from "../src/models/Receipt.js";
import ReceiptCounter from "../src/models/ReceiptCounter.js";
import Payment from "../src/models/Payment.js";
import Refund from "../src/models/Refund.js";
import Student from "../src/models/Student.js";
import Consent from "../src/models/Consent.js";
import AuditLog from "../src/models/AuditLog.js";
import { createReceiptForPayment, getPaymentReceipt } from "../src/services/receipt/receipt.service.js";
import { exportTallyCsv, getPaymentCollectionReport, getRefundReport } from "../src/services/reports/accountsReports.service.js";

const centre = "64d000000000000000000004";
const studentId = "64d000000000000000000006";
const id = "64d000000000000000000008";
const chain = (value) => ({
  select() { return this; }, populate() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});
const setConfig = (t, values = {}) => {
  const names = ["INSTITUTE_NAME", "INSTITUTE_ADDRESS", "INSTITUTE_GST_TAXABILITY", "INSTITUTE_GST_RATE_BPS", "INSTITUTE_GST_TREATMENT"];
  const previous = Object.fromEntries(names.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { INSTITUTE_NAME: "Coachify Institute", INSTITUTE_ADDRESS: "1 Training Road", INSTITUTE_GST_TAXABILITY: "NOT_CONFIGURED", INSTITUTE_GST_RATE_BPS: "", INSTITUTE_GST_TREATMENT: "", ...values });
  t.after(() => names.forEach((key) => previous[key] === undefined ? delete process.env[key] : process.env[key] = previous[key]));
};

test("receipt generation accepts only SUCCESS payments and snapshots configured inclusive GST", async (t) => {
  setConfig(t, { INSTITUTE_GST_TAXABILITY: "TAXABLE", INSTITUTE_GST_RATE_BPS: "1800", INSTITUTE_GST_TREATMENT: "INCLUSIVE" });
  let created;
  t.mock.method(Receipt, "findOne", async () => null);
  t.mock.method(ReceiptCounter, "findOneAndUpdate", async () => ({ sequence: 42 }));
  t.mock.method(Receipt, "create", async ([document]) => { created = document; return [{ _id: id, ...document }]; });
  t.mock.method(AuditLog, "create", async () => []);
  await assert.rejects(createReceiptForPayment({ _id: id, status: "PENDING" }), (error) => error.statusCode === 409);
  const receipt = await createReceiptForPayment({
    _id: id, status: "SUCCESS", amountPaise: 11800, paymentMethod: "UPI", transactionId: "TX-1", paidAt: new Date("2026-01-01"), createdAt: new Date("2026-01-01"),
    student: { _id: studentId, studentId: "STU-1", name: "Example Student", centre: { _id: centre, name: "Central" }, batch: { _id: id, name: "JEE-A", course: "JEE", academicYear: "2026" } },
    instalment: { _id: id, student: studentId, instalmentNumber: 1, dueDate: new Date("2026-01-01"), amountPaise: 11800 },
  });
  assert.equal(receipt.receiptNumber, `COACH-${new Date().getUTCFullYear()}-000042`);
  assert.equal(created.gstBreakdown.taxableBasePaise, 10000);
  assert.equal(created.gstBreakdown.gstAmountPaise, 1800);
  assert.equal(created.amountPaidPaise, 11800);
});

test("duplicate receipt lookup returns existing receipt without allocating another", async (t) => {
  const existing = { _id: id, receiptNumber: "COACH-2026-000001" };
  let allocations = 0;
  t.mock.method(Receipt, "findOne", async () => existing);
  t.mock.method(ReceiptCounter, "findOneAndUpdate", async () => { allocations += 1; return { sequence: 2 }; });
  const result = await createReceiptForPayment({ _id: id, status: "SUCCESS" });
  assert.equal(result, existing);
  assert.equal(allocations, 0);
});

test("parent receipt retrieval verifies ownership and active consent", async (t) => {
  const populated = { _id: id, status: "SUCCESS", amountPaise: 5000, paymentMethod: "CASH", student: { _id: studentId, centre: { _id: centre } }, instalment: { _id: id } };
  let linked = false;
  t.mock.method(Payment, "findById", () => chain(populated));
  t.mock.method(Student, "findOne", () => chain(linked ? { _id: studentId } : null));
  t.mock.method(Consent, "findOne", () => chain(null));
  await assert.rejects(getPaymentReceipt({ paymentId: id, user: { _id: "parent-1", role: "PARENT" } }), (error) => error.statusCode === 404);
  linked = true;
  await assert.rejects(getPaymentReceipt({ paymentId: id, user: { _id: "parent-1", role: "PARENT" } }), (error) => error.statusCode === 403);
});

test("Accounts receipt retrieval is restricted to assigned centres", async (t) => {
  const populated = { _id: id, status: "SUCCESS", amountPaise: 5000, paymentMethod: "CASH", student: { _id: studentId, centre: { _id: centre } }, instalment: { _id: id } };
  t.mock.method(Payment, "findById", () => chain(populated));
  await assert.rejects(getPaymentReceipt({ paymentId: id, user: { _id: "accounts-1", role: "ACCOUNTS", centres: ["64d000000000000000000099"] } }), (error) => error.statusCode === 404);
});

test("payment report pipeline scopes to centres and SUCCESS payments only", async (t) => {
  let pipeline;
  t.mock.method(Payment, "aggregate", (value) => { pipeline = value; return { allowDiskUse: async () => [{ totals: [{ totalCollectedPaise: 0, paymentCount: 0 }], metadata: [] }] }; });
  await getPaymentCollectionReport({ user: { centres: [centre] }, filters: { startDate: "2026-01-01", endDate: "2026-01-31", paymentMethod: "UPI" } });
  assert.deepEqual(pipeline[0].$match, { status: "SUCCESS", paidAt: { $gte: new Date("2026-01-01T00:00:00.000Z"), $lt: new Date("2026-02-01T00:00:00.000Z") }, paymentMethod: "UPI" });
  assert.equal(pipeline[3].$match["studentDoc.centre"].$in[0].toString(), centre);
});

test("financial reports reject centre filters outside the Accounts assignment", async (t) => {
  t.mock.method(Payment, "aggregate", () => { throw new Error("aggregate must not run"); });
  await assert.rejects(getPaymentCollectionReport({ user: { centres: [centre] }, filters: { centreId: "64d000000000000000000099" } }), (error) => error.statusCode === 403);
});

test("refund report aggregates approved, processed, and rejected states separately", async (t) => {
  let pipeline;
  t.mock.method(Refund, "aggregate", (value) => { pipeline = value; return { allowDiskUse: async () => [{ metadata: [], refunds: [], totals: [] }] }; });
  const report = await getRefundReport({ user: { centres: [centre] }, filters: {} });
  assert.deepEqual(report.totals, { approvedAmountPaise: 0, processedAmountPaise: 0, rejectedAmountPaise: 0, pendingCount: 0, rejectedCount: 0 });
  const facet = pipeline.at(-1).$facet;
  assert.ok(JSON.stringify(facet.totals).includes("PROCESSED"));
  assert.ok(JSON.stringify(facet.totals).includes("REJECTED"));
});

test("Tally CSV exposes stable import keys and separate refund rows", async (t) => {
  setConfig(t);
  const payment = { _id: id, student: { _id: studentId, studentId: "STU-1", name: "Example Student", centre, batch: id }, centreDoc: { name: "Central" }, batchDoc: { name: "JEE-A", course: "JEE", academicYear: "2026" }, instalment: { _id: id, student: studentId, instalmentNumber: 1, dueDate: new Date("2026-01-01"), amountPaise: 2500 }, amountPaise: 2500, paymentMethod: "UPI", paidAt: new Date("2026-01-01"), transactionId: "PAY-1" };
  const refund = { _id: id, student: { studentId: "STU-1", name: "Example Student", centre: centre, batch: id }, centreDoc: { name: "Central" }, batchDoc: { name: "JEE-A" }, refundAmountPaise: 1500, processedAt: new Date("2026-01-02"), refundTransactionId: "REF-1", status: "PROCESSED" };
  let paymentPipeline;
  t.mock.method(Payment, "aggregate", (pipeline) => { paymentPipeline = pipeline; return { allowDiskUse: async () => [payment] }; });
  t.mock.method(Receipt, "findOne", async () => ({ _id: "receipt-1", receiptNumber: "COACH-2026-000001", gstConfiguration: { taxability: "NOT_CONFIGURED" }, gstBreakdown: { gstAmountPaise: null } }));
  t.mock.method(Refund, "aggregate", () => ({ allowDiskUse: async () => [refund] }));
  t.mock.method(AuditLog, "create", async () => []);
  const result = await exportTallyCsv({ user: { _id: id, centres: [centre] }, filters: { startDate: "2026-01-01", endDate: "2026-01-31" } });
  assert.match(result.csv, /^\uFEFF"source_record_id","record_type","transaction_date","receipt_number"/);
  assert.match(result.csv, /"REFUND"/);
  assert.match(result.csv, /"1500","15\.00"/);
  assert.match(result.csv, /"PAYMENT"/);
  assert.match(result.csv, /"2500","25\.00"/);
  assert.deepEqual(paymentPipeline[0].$match.paidAt, { $gte: new Date("2026-01-01T00:00:00.000Z"), $lt: new Date("2026-02-01T00:00:00.000Z") });
  assert.equal(result.refundCount, 1);
});
