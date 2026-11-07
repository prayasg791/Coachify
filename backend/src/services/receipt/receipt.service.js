import mongoose from "mongoose";
import Payment from "../../models/Payment.js";
import Receipt from "../../models/Receipt.js";
import ReceiptCounter from "../../models/ReceiptCounter.js";
import Student from "../../models/Student.js";
import Consent from "../../models/Consent.js";
import AuditLog from "../../models/AuditLog.js";

const error = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const config = () => {
  const taxability = process.env.INSTITUTE_GST_TAXABILITY || "NOT_CONFIGURED";
  const rateBps = process.env.INSTITUTE_GST_RATE_BPS ? Number(process.env.INSTITUTE_GST_RATE_BPS) : null;
  const treatment = process.env.INSTITUTE_GST_TREATMENT || null;
  if (!["NOT_CONFIGURED", "TAXABLE", "NON_TAXABLE"].includes(taxability)) throw error("GST configuration is invalid", 503);
  if (taxability === "TAXABLE" && (!Number.isSafeInteger(rateBps) || rateBps <= 0 || !["INCLUSIVE", "EXCLUSIVE"].includes(treatment))) throw error("GST configuration is incomplete", 503);
  return { taxability, rateBps: taxability === "TAXABLE" ? rateBps : null, treatment: taxability === "TAXABLE" ? treatment : null };
};
const institute = () => {
  const name = process.env.INSTITUTE_NAME?.trim();
  const address = process.env.INSTITUTE_ADDRESS?.trim();
  if (!name || !address) throw error("Institute receipt details are not configured", 503);
  return { name, address };
};
const nextReceiptNumber = async (date) => {
  const year = date.getUTCFullYear();
  let counter;
  try {
    counter = await ReceiptCounter.findOneAndUpdate(
      { _id: `receipt-${year}` }, { $inc: { sequence: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    if (err.code !== 11000) throw err;
    counter = await ReceiptCounter.findOneAndUpdate(
      { _id: `receipt-${year}` }, { $inc: { sequence: 1 } }, { new: true },
    );
  }
  return `COACH-${year}-${String(counter.sequence).padStart(6, "0")}`;
};
const gstAmounts = (amountPaise, gst) => {
  if (gst.taxability === "NOT_CONFIGURED") return { taxableBasePaise: null, gstAmountPaise: null, grossAmountPaise: null };
  if (gst.taxability !== "TAXABLE") return { taxableBasePaise: amountPaise, gstAmountPaise: 0, grossAmountPaise: amountPaise };
  const amount = BigInt(amountPaise);
  const rate = BigInt(gst.rateBps);
  if (gst.treatment === "INCLUSIVE") {
    const divisor = 10000n + rate;
    const base = Number((amount * 10000n + divisor / 2n) / divisor);
    return { taxableBasePaise: base, gstAmountPaise: amountPaise - base, grossAmountPaise: amountPaise };
  }
  const tax = Number((amount * rate + 5000n) / 10000n);
  const gross = amountPaise + tax;
  if (!Number.isSafeInteger(gross)) throw error("Configured GST result exceeds the supported amount range", 400);
  return { taxableBasePaise: amountPaise, gstAmountPaise: tax, grossAmountPaise: gross };
};
const getPopulatedPayment = async (paymentId) => Payment.findById(paymentId)
  .populate({ path: "student", select: "studentId name centre batch", populate: [{ path: "centre", select: "name" }, { path: "batch", select: "name course academicYear" }] })
  .populate({ path: "instalment", select: "instalmentNumber dueDate amountPaise student" });

export const createReceiptForPayment = async (payment, { issuedBy = null } = {}) => {
  const existing = await Receipt.findOne({ payment: payment._id });
  if (existing) return existing;
  if (payment.status !== "SUCCESS") throw error("Receipts are available only for successful payments", 409);
  const settings = institute();
  const gst = config();
  const student = payment.student;
  const instalment = payment.instalment;
  if (!student?._id || !student.centre?._id || !instalment?._id || String(instalment.student) !== String(student._id)) {
    throw error("Payment receipt details are incomplete", 409);
  }
  const issueDate = new Date();
  const receiptNumber = await nextReceiptNumber(issueDate);
  try {
    const [receipt] = await Receipt.create([{
      payment: payment._id, receiptNumber, issueDate, institute: settings,
      student: { id: student._id, studentId: student.studentId, name: student.name },
      centre: { id: student.centre._id, name: student.centre.name },
      batch: { id: student.batch?._id ?? null, name: student.batch?.name ?? "", course: student.batch?.course ?? "", academicYear: student.batch?.academicYear ?? "" },
      instalment: { id: instalment._id, number: instalment.instalmentNumber, dueDate: instalment.dueDate, amountPaise: instalment.amountPaise },
      paymentDate: payment.paidAt ?? payment.createdAt, paymentMethod: payment.paymentMethod,
      transactionId: payment.transactionId ?? "", amountPaidPaise: payment.amountPaise,
      gstConfiguration: gst, gstBreakdown: gstAmounts(payment.amountPaise, gst),
    }]);
    await AuditLog.create({ actor: issuedBy, actorType: issuedBy ? "USER" : "SYSTEM", action: "RECEIPT_ISSUED", entityType: "Receipt", entityId: receipt._id, details: { paymentId: payment._id, receiptNumber } });
    return receipt;
  } catch (err) {
    if (err.code === 11000) return Receipt.findOne({ payment: payment._id });
    throw err;
  }
};

const assertAccess = async ({ receipt, user }) => {
  if (user.role === "ACCOUNTS") {
    const centres = (user.centres ?? []).map((id) => String(id?._id ?? id));
    if (!centres.includes(String(receipt.centre.id))) throw error("Receipt not found", 404);
    return;
  }
  if (user.role !== "PARENT") throw error("You are not authorized to access this receipt", 403);
  const student = await Student.findOne({ _id: receipt.student.id, parent: user._id }).select("_id");
  if (!student) throw error("Receipt not found", 404);
  const consent = await Consent.findOne({ parent: user._id, student: receipt.student.id, purpose: "STUDENT_DATA_PROCESSING", status: "GRANTED" }).select("_id");
  if (!consent) throw error("Parental consent is required to access this receipt", 403);
};

export const getPaymentReceipt = async ({ paymentId, user }) => {
  if (!mongoose.Types.ObjectId.isValid(paymentId)) throw error("Invalid payment ID", 400);
  const payment = await getPopulatedPayment(paymentId);
  if (!payment || payment.status !== "SUCCESS") throw error("Receipt is available only for successful payments", 404);
  if (!payment.student?._id || !payment.student.centre?._id) throw error("Payment receipt details are incomplete", 409);
  if (user.role === "PARENT") {
    const student = await Student.findOne({ _id: payment.student._id, parent: user._id }).select("_id");
    if (!student) throw error("Receipt not found", 404);
    const consent = await Consent.findOne({ parent: user._id, student: payment.student._id, purpose: "STUDENT_DATA_PROCESSING", status: "GRANTED" }).select("_id");
    if (!consent) throw error("Parental consent is required to access this receipt", 403);
  } else if (user.role === "ACCOUNTS") {
    const centres = (user.centres ?? []).map((value) => String(value?._id ?? value));
    if (!centres.includes(String(payment.student.centre._id))) throw error("Receipt not found", 404);
  } else {
    throw error("You are not authorized to access receipts", 403);
  }
  const receipt = await createReceiptForPayment(payment, { issuedBy: user._id });
  await AuditLog.create({ actor: user._id, actorType: "USER", action: "RECEIPT_VIEWED", entityType: "Receipt", entityId: receipt._id, details: { receiptNumber: receipt.receiptNumber } });
  return receipt;
};

export const listStudentReceipts = async ({ studentId, user, page = 1, limit = 20 }) => {
  if (!mongoose.Types.ObjectId.isValid(studentId)) throw error("Invalid student ID", 400);
  const pageNumber = Number(page); const limitNumber = Number(limit);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || !Number.isInteger(limitNumber) || limitNumber < 1 || limitNumber > 100) throw error("Invalid pagination", 400);
  if (user.role === "PARENT") {
    const student = await Student.findOne({ _id: studentId, parent: user._id }).select("_id");
    if (!student) throw error("Student not found", 404);
    const consent = await Consent.findOne({ parent: user._id, student: studentId, purpose: "STUDENT_DATA_PROCESSING", status: "GRANTED" }).select("_id");
    if (!consent) throw error("Parental consent is required to access student data", 403);
  } else if (user.role === "ACCOUNTS") {
    const student = await Student.findById(studentId).select("centre");
    const centres = (user.centres ?? []).map((value) => String(value?._id ?? value));
    if (!student) throw error("Student not found", 404);
    if (!centres.includes(String(student.centre))) throw error("You cannot access this student", 403);
  } else {
    throw error("You are not authorized to access receipts", 403);
  }
  const query = { student: studentId, status: "SUCCESS" };
  const [payments, total] = await Promise.all([
    Payment.find(query).select("student instalment amountPaise paymentMethod transactionId status paidAt createdAt")
      .populate({ path: "student", select: "studentId name centre batch", populate: [{ path: "centre", select: "name" }, { path: "batch", select: "name course academicYear" }] })
      .populate({ path: "instalment", select: "instalmentNumber dueDate amountPaise student" })
      .sort({ paidAt: -1, _id: -1 }).skip((pageNumber - 1) * limitNumber).limit(limitNumber),
    Payment.countDocuments(query),
  ]);
  const receipts = await Promise.all(payments.map((payment) => createReceiptForPayment(payment, { issuedBy: user._id })));
  for (const receipt of receipts) await assertAccess({ receipt, user });
  return { receipts, pagination: { page: pageNumber, limit: limitNumber, total, pages: Math.ceil(total / limitNumber) } };
};

export const getReceipt = async ({ receiptId, user }) => {
  if (!mongoose.Types.ObjectId.isValid(receiptId)) throw error("Invalid receipt ID", 400);
  const receipt = await Receipt.findById(receiptId);
  if (!receipt) throw error("Receipt not found", 404);
  await assertAccess({ receipt, user });
  await AuditLog.create({ actor: user._id, actorType: "USER", action: "RECEIPT_VIEWED", entityType: "Receipt", entityId: receipt._id, details: { receiptNumber: receipt.receiptNumber } });
  return receipt;
};

export const getReceiptConfiguration = () => ({ institute: { name: process.env.INSTITUTE_NAME?.trim() || null, address: process.env.INSTITUTE_ADDRESS?.trim() || null }, gst: config() });
