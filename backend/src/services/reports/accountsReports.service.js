import mongoose from "mongoose";
import Payment from "../../models/Payment.js";
import Instalment from "../../models/Instalment.js";
import Refund from "../../models/Refund.js";
import Batch from "../../models/Batch.js";
import Centre from "../../models/Centre.js";
import AuditLog from "../../models/AuditLog.js";
import { getAccountsDashboard } from "../dashboard/accountsDashboard.service.js";
import { createReceiptForPayment, getReceiptConfiguration } from "../receipt/receipt.service.js";

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const dateValue = (raw, name) => {
  if (raw === undefined || raw === "") return undefined;
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw fail(`${name} must use YYYY-MM-DD format`, 400);
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== raw) throw fail(`${name} is invalid`, 400);
  return date;
};
const resolveScope = async ({ user, filters = {} }) => {
  const centreIds = [...new Set((user.centres ?? []).map((value) => String(value?._id ?? value)))];
  let centreId; let batchId;
  if (filters.centreId) {
    if (!mongoose.Types.ObjectId.isValid(filters.centreId)) throw fail("Invalid centre ID", 400);
    if (!centreIds.includes(filters.centreId)) throw fail("You cannot access this centre", 403);
    centreId = filters.centreId;
  }
  if (filters.batchId) {
    if (!mongoose.Types.ObjectId.isValid(filters.batchId)) throw fail("Invalid batch ID", 400);
    const batch = await Batch.findById(filters.batchId).select("centre");
    if (!batch) throw fail("Batch not found", 404);
    if (!centreIds.includes(String(batch.centre))) throw fail("You cannot access this batch", 403);
    if (centreId && String(batch.centre) !== centreId) throw fail("Batch does not belong to the selected centre", 400);
    centreId = String(batch.centre); batchId = filters.batchId;
  }
  const startDate = dateValue(filters.startDate, "startDate");
  const endDate = dateValue(filters.endDate, "endDate");
  if (startDate && endDate && startDate > endDate) throw fail("startDate must not be after endDate", 400);
  if (filters.paymentMethod && !["GATEWAY", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"].includes(filters.paymentMethod)) throw fail("Invalid payment method", 400);
  const dateRange = {};
  if (startDate) dateRange.$gte = startDate;
  if (endDate) { const exclusive = new Date(endDate); exclusive.setUTCDate(exclusive.getUTCDate() + 1); dateRange.$lt = exclusive; }
  return { centreIds, centreId, batchId, startDate, endDate, dateRange };
};
const studentMatchStages = (scope, path = "studentDoc") => {
  const match = { [`${path}.centre`]: { $in: (scope.centreId ? [scope.centreId] : scope.centreIds).map((id) => new mongoose.Types.ObjectId(id)) } };
  if (scope.batchId) match[`${path}.batch`] = new mongoose.Types.ObjectId(scope.batchId);
  return [{ $match: match }];
};
const joinStudent = [
  { $lookup: { from: "students", localField: "student", foreignField: "_id", as: "studentDoc" } },
  { $unwind: "$studentDoc" },
];
const joinNames = [
  { $lookup: { from: "centres", localField: "studentDoc.centre", foreignField: "_id", as: "centreDoc" } },
  { $unwind: { path: "$centreDoc", preserveNullAndEmptyArrays: true } },
  { $lookup: { from: "batches", localField: "studentDoc.batch", foreignField: "_id", as: "batchDoc" } },
  { $unwind: { path: "$batchDoc", preserveNullAndEmptyArrays: true } },
];
const pagination = (filters) => {
  const page = Number(filters.page ?? 1); const limit = Number(filters.limit ?? 25);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw fail("Invalid pagination", 400);
  return { page, limit, skip: (page - 1) * limit };
};

export const getFeeCollectionReport = async ({ user, filters }) => getAccountsDashboard({ user, filters });

export const getAccountsReportOptions = async ({ user }) => {
  const centreIds = [...new Set((user.centres ?? []).map((value) => String(value?._id ?? value)))];
  const [centres, batches] = await Promise.all([
    Centre.find({ _id: { $in: centreIds } }).select("name code").sort({ name: 1 }),
    Batch.find({ centre: { $in: centreIds } }).select("name centre course academicYear").sort({ name: 1 }),
  ]);
  return { centres, batches };
};

export const getPaymentCollectionReport = async ({ user, filters = {} }) => {
  const scope = await resolveScope({ user, filters });
  const { page, limit, skip } = pagination(filters);
  const paymentMatch = { status: "SUCCESS" };
  if (Object.keys(scope.dateRange).length) paymentMatch.paidAt = scope.dateRange;
  if (filters.paymentMethod) paymentMatch.paymentMethod = filters.paymentMethod;
  const pipeline = [
    { $match: paymentMatch }, ...joinStudent, ...studentMatchStages(scope), ...joinNames,
    { $facet: {
      totals: [{ $group: { _id: null, totalCollectedPaise: { $sum: "$amountPaise" }, paymentCount: { $sum: 1 } } }],
      byDate: [{ $group: { _id: { $dateToString: { date: "$paidAt", format: "%Y-%m-%d", timezone: "UTC" } }, amountPaise: { $sum: "$amountPaise" }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
      byMethod: [{ $group: { _id: "$paymentMethod", amountPaise: { $sum: "$amountPaise" }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
      byCentre: [{ $group: { _id: "$studentDoc.centre", name: { $first: "$centreDoc.name" }, amountPaise: { $sum: "$amountPaise" }, count: { $sum: 1 } } }, { $sort: { name: 1 } }],
      byBatch: [{ $group: { _id: "$studentDoc.batch", name: { $first: "$batchDoc.name" }, amountPaise: { $sum: "$amountPaise" }, count: { $sum: 1 } } }, { $sort: { name: 1 } }],
      payments: [{ $sort: { paidAt: -1, _id: -1 } }, { $skip: skip }, { $limit: limit }, { $project: { amountPaise: 1, paidAt: 1, paymentMethod: 1, transactionId: 1, studentId: "$studentDoc.studentId", studentName: "$studentDoc.name", centre: "$centreDoc.name", batch: "$batchDoc.name" } }],
      metadata: [{ $count: "total" }],
    } },
  ];
  const [result = {}] = await Payment.aggregate(pipeline).allowDiskUse(true);
  const total = result.metadata?.[0]?.total ?? 0;
  return { totals: result.totals?.[0] ?? { totalCollectedPaise: 0, paymentCount: 0 }, byDate: result.byDate ?? [], byMethod: result.byMethod ?? [], byCentre: result.byCentre ?? [], byBatch: result.byBatch ?? [], payments: result.payments ?? [], pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

export const getOutstandingDuesReport = async ({ user, filters = {} }) => {
  const scope = await resolveScope({ user, filters });
  const { page, limit, skip } = pagination(filters);
  const instalmentMatch = {};
  if (Object.keys(scope.dateRange).length) instalmentMatch.dueDate = scope.dateRange;
  const today = new Date();
  const pipeline = [
    { $match: instalmentMatch }, ...joinStudent, ...studentMatchStages(scope),
    { $lookup: { from: "payments", let: { instalmentId: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$instalment", "$$instalmentId"] }, { $eq: ["$status", "SUCCESS"] }] } } }, { $group: { _id: null, totalPaidPaise: { $sum: "$amountPaise" } } }], as: "paymentTotals" } },
    { $addFields: { amountPaidPaise: { $ifNull: [{ $arrayElemAt: ["$paymentTotals.totalPaidPaise", 0] }, 0] } } },
    { $addFields: { outstandingPaise: { $max: [0, { $subtract: ["$amountPaise", "$amountPaidPaise"] }] }, daysOverdue: { $max: [0, { $dateDiff: { startDate: "$dueDate", endDate: today, unit: "day", timezone: "UTC" } }] } } },
    { $match: { outstandingPaise: { $gt: 0 } } }, ...joinNames,
    { $facet: {
      dues: [{ $sort: { dueDate: 1, _id: 1 } }, { $skip: skip }, { $limit: limit }, { $project: { studentId: "$studentDoc.studentId", studentName: "$studentDoc.name", centreId: "$studentDoc.centre", centreName: "$centreDoc.name", batchId: "$studentDoc.batch", batchName: "$batchDoc.name", instalmentNumber: 1, instalmentAmountPaise: "$amountPaise", amountPaidPaise: 1, outstandingPaise: 1, dueDate: 1, daysOverdue: 1 } }],
      metadata: [{ $count: "total" }],
      totals: [{ $group: { _id: null, outstandingPaise: { $sum: "$outstandingPaise" }, overduePaise: { $sum: { $cond: [{ $gt: ["$daysOverdue", 0] }, "$outstandingPaise", 0] } } } }],
    } },
  ];
  const [result = {}] = await Instalment.aggregate(pipeline).allowDiskUse(true);
  const total = result.metadata?.[0]?.total ?? 0;
  return { dues: result.dues ?? [], totals: result.totals?.[0] ?? { outstandingPaise: 0, overduePaise: 0 }, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

export const getRefundReport = async ({ user, filters = {} }) => {
  const scope = await resolveScope({ user, filters });
  const { page, limit, skip } = pagination(filters);
  const match = {};
  if (Object.keys(scope.dateRange).length) match.createdAt = scope.dateRange;
  const pipeline = [
    { $match: match }, ...joinStudent, ...studentMatchStages(scope), ...joinNames,
    { $facet: {
      refunds: [{ $sort: { createdAt: -1, _id: -1 } }, { $skip: skip }, { $limit: limit }, { $project: { status: 1, refundAmountPaise: 1, totalPaidPaise: 1, eligibleAmountPaise: 1, withdrawalDate: 1, createdAt: 1, processedAt: 1, studentId: "$studentDoc.studentId", studentName: "$studentDoc.name", centreName: "$centreDoc.name", batchName: "$batchDoc.name" } }],
      metadata: [{ $count: "total" }],
      totals: [{ $group: {
        _id: null,
        approvedAmountPaise: { $sum: { $cond: [{ $in: ["$status", ["APPROVED", "PROCESSING", "PROCESSED"]] }, "$refundAmountPaise", 0] } },
        processedAmountPaise: { $sum: { $cond: [{ $eq: ["$status", "PROCESSED"] }, "$refundAmountPaise", 0] } },
        rejectedAmountPaise: { $sum: { $cond: [{ $eq: ["$status", "REJECTED"] }, "$refundAmountPaise", 0] } },
        pendingCount: { $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] } },
        rejectedCount: { $sum: { $cond: [{ $eq: ["$status", "REJECTED"] }, 1, 0] } },
      } }],
    } },
  ];
  const [result = {}] = await Refund.aggregate(pipeline).allowDiskUse(true);
  const total = result.metadata?.[0]?.total ?? 0;
  return { refunds: result.refunds ?? [], totals: result.totals?.[0] ?? { approvedAmountPaise: 0, processedAmountPaise: 0, rejectedAmountPaise: 0, pendingCount: 0, rejectedCount: 0 }, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

const escapeCsv = (value) => {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};
const moneyString = (paise) => (Number(paise ?? 0) / 100).toFixed(2);
const CSV_HEADERS = ["source_record_id", "record_type", "transaction_date", "receipt_number", "student_reference", "student_name", "centre", "batch", "payment_method", "status", "amount_paise", "amount_inr", "gst_taxability", "gst_rate_bps", "gst_treatment", "gst_amount_paise", "gst_amount_inr"];

export const exportTallyCsv = async ({ user, filters = {} }) => {
  const scope = await resolveScope({ user, filters });
  const paymentMatch = { status: "SUCCESS" };
  if (Object.keys(scope.dateRange).length) paymentMatch.paidAt = scope.dateRange;
  if (filters.paymentMethod) paymentMatch.paymentMethod = filters.paymentMethod;
  const paymentsPipeline = [
    { $match: paymentMatch }, ...joinStudent, ...studentMatchStages(scope), ...joinNames,
    { $lookup: { from: "instalments", localField: "instalment", foreignField: "_id", as: "instalmentDoc" } },
    { $unwind: "$instalmentDoc" },
    { $project: { _id: 1, student: "$studentDoc", centreDoc: 1, batchDoc: 1, instalment: "$instalmentDoc", amountPaise: 1, paymentMethod: 1, transactionId: 1, paidAt: 1, createdAt: 1 } },
    { $sort: { paidAt: 1, _id: 1 } },
  ];
  const refundMatch = { status: "PROCESSED" };
  if (Object.keys(scope.dateRange).length) refundMatch.processedAt = scope.dateRange;
  const refundsPipeline = [
    { $match: refundMatch }, ...joinStudent, ...studentMatchStages(scope), ...joinNames,
    { $project: { _id: 1, student: "$studentDoc", centreDoc: 1, batchDoc: 1, refundAmountPaise: 1, processedAt: 1, refundTransactionId: 1, status: 1 } },
    { $sort: { processedAt: 1, _id: 1 } },
  ];
  const [payments, refunds] = await Promise.all([
    Payment.aggregate(paymentsPipeline).allowDiskUse(true), Refund.aggregate(refundsPipeline).allowDiskUse(true),
  ]);
  const config = getReceiptConfiguration();
  const rows = [CSV_HEADERS.map(escapeCsv).join(",")];
  for (const payment of payments) {
    const student = {
      ...payment.student,
      centre: { _id: payment.student?.centre, name: payment.centreDoc?.name },
      batch: { _id: payment.student?.batch, name: payment.batchDoc?.name, course: payment.batchDoc?.course, academicYear: payment.batchDoc?.academicYear },
    };
    const receipt = await createReceiptForPayment({ ...payment, student, instalment: payment.instalment }, { issuedBy: user._id });
    const gst = receipt.gstBreakdown ?? {};
    rows.push([
      `PAYMENT:${payment._id}`, "PAYMENT", payment.paidAt ?? payment.createdAt, receipt.receiptNumber,
      payment.student?.studentId, payment.student?.name, payment.centreDoc?.name, payment.batchDoc?.name,
      payment.paymentMethod, "SUCCESS", payment.amountPaise, moneyString(payment.amountPaise),
      receipt.gstConfiguration?.taxability ?? config.gst.taxability, receipt.gstConfiguration?.rateBps ?? "",
      receipt.gstConfiguration?.treatment ?? "", gst.gstAmountPaise ?? "", gst.gstAmountPaise == null ? "" : moneyString(gst.gstAmountPaise),
    ].map(escapeCsv).join(","));
  }
  for (const refund of refunds) {
    rows.push([
      `REFUND:${refund._id}`, "REFUND", refund.processedAt, refund.refundTransactionId, refund.student?.studentId,
      refund.student?.name, refund.centreDoc?.name, refund.batchDoc?.name, "REFUND", "PROCESSED",
      refund.refundAmountPaise, moneyString(refund.refundAmountPaise), config.gst.taxability, "", "", "", "",
    ].map(escapeCsv).join(","));
  }
  const exportId = new mongoose.Types.ObjectId();
  await AuditLog.create({ actor: user._id, actorType: "USER", action: "TALLY_CSV_EXPORTED", entityType: "FinancialExport", entityId: exportId, details: { exportId, filters: { centreId: scope.centreId ?? null, batchId: scope.batchId ?? null, startDate: filters.startDate ?? null, endDate: filters.endDate ?? null, paymentMethod: filters.paymentMethod ?? null }, paymentCount: payments.length, refundCount: refunds.length } });
  return { csv: `\uFEFF${rows.join("\r\n")}\r\n`, exportId: String(exportId), paymentCount: payments.length, refundCount: refunds.length };
};

