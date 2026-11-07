import mongoose from "mongoose";
import Student from "../../models/Student.js";
import UnmatchedPayment from "../../models/UnmatchedPayment.js";
import Payment from "../../models/Payment.js";
import AuditLog from "../../models/AuditLog.js";
import { recordOfflinePaymentInTransaction } from "./paymentApi.service.js";

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const METHODS = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"];
const centreIds = (user) => (user.centres ?? []).map((value) => String(value?._id ?? value));
const validateId = (id, label) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw fail(`Invalid ${label}`, 400);
};
const assertCentre = (user, centreId) => {
  if (!centreIds(user).includes(String(centreId))) throw fail("You cannot access payments at this centre", 403);
};
const safePopulate = (query) => query
  .populate("centre", "name")
  .populate("matchedStudent", "studentId name")
  .populate("matchedInstalment", "instalmentNumber dueDate")
  .populate("matchedPayment", "status amountPaise");

export const listUnmatchedPayments = async ({ user, filters = {} }) => {
  const allowed = centreIds(user);
  let page = Number(filters.page ?? 1);
  let limit = Number(filters.limit ?? 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw fail("Invalid pagination", 400);
  const query = { centre: { $in: allowed } };
  const status = filters.status ?? "UNMATCHED";
  if (status !== "ALL") {
    if (!["UNMATCHED", "MATCHED", "REJECTED"].includes(status)) throw fail("Invalid status", 400);
    query.status = status;
  }
  if (filters.centreId) {
    validateId(filters.centreId, "centre ID");
    assertCentre(user, filters.centreId);
    query.centre = filters.centreId;
  }
  if (filters.paymentMethod) {
    if (!METHODS.includes(filters.paymentMethod)) throw fail("Invalid payment method", 400);
    query.paymentMethod = filters.paymentMethod;
  }
  const [items, total] = await Promise.all([
    safePopulate(UnmatchedPayment.find(query).select("transactionId amountPaise paymentMethod paymentDate payerDetails status reviewNotes reviewedBy reviewedAt centre matchedStudent matchedInstalment matchedPayment createdAt updatedAt"))
      .populate("reviewedBy", "name")
      .sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    UnmatchedPayment.countDocuments(query),
  ]);
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

export const getUnmatchedPayment = async ({ id, user }) => {
  validateId(id, "payment ID");
  const item = await safePopulate(UnmatchedPayment.findById(id).select("transactionId amountPaise paymentMethod paymentDate payerDetails status reviewNotes reviewedBy reviewedAt centre matchedStudent matchedInstalment matchedPayment createdAt updatedAt")).populate("reviewedBy", "name");
  if (!item) throw fail("Unmatched payment not found", 404);
  assertCentre(user, item.centre?._id ?? item.centre);
  return item;
};

export const createUnmatchedPayment = async ({ user, data }) => {
  validateId(data.centreId, "centre ID");
  assertCentre(user, data.centreId);
  const transactionId = typeof data.transactionId === "string" ? data.transactionId.trim() : "";
  if (!transactionId || transactionId.length > 100) throw fail("Transaction reference is required (up to 100 characters)", 400);
  if (!Number.isSafeInteger(data.amountPaise) || data.amountPaise <= 0) throw fail("Invalid payment amount", 400);
  if (!METHODS.includes(data.paymentMethod)) throw fail("Invalid offline payment method", 400);
  const paymentDate = data.paymentDate ? new Date(data.paymentDate) : new Date();
  if (Number.isNaN(paymentDate.getTime())) throw fail("Invalid payment date", 400);
  const centreExists = centreIds(user).includes(String(data.centreId));
  if (!centreExists) throw fail("You cannot access payments at this centre", 403);
  if (await Payment.exists({ transactionId }) || await UnmatchedPayment.exists({ transactionId })) throw fail("Transaction reference has already been used", 409);
  try {
    const [record] = await UnmatchedPayment.create([{
      transactionId, amountPaise: data.amountPaise, paymentMethod: data.paymentMethod,
      paymentDate, centre: data.centreId, payerDetails: String(data.payerDetails ?? "").trim(),
    }]);
    await AuditLog.create({ actor: user._id, actorType: "USER", action: "UNMATCHED_PAYMENT_CREATED", entityType: "UnmatchedPayment", entityId: record._id, details: { centreId: data.centreId, transactionId, amountPaise: data.amountPaise } });
    return record;
  } catch (error) {
    if (error.code === 11000) throw fail("Transaction reference has already been used", 409);
    throw error;
  }
};

export const matchUnmatchedPayment = async ({ id, user, studentId, instalmentId, reviewNotes = "" }) => {
  validateId(id, "payment ID"); validateId(studentId, "student ID"); validateId(instalmentId, "instalment ID");
  if (typeof reviewNotes !== "string" || reviewNotes.length > 1000) throw fail("Review notes must be 1000 characters or fewer", 400);
  const session = await mongoose.startSession();
  try {
    let payment;
    await session.withTransaction(async () => {
      const record = await UnmatchedPayment.findOne({ _id: id, status: "UNMATCHED" }).session(session);
      if (!record) throw fail("Unmatched payment not found or already reviewed", 409);
      assertCentre(user, record.centre);
      const student = await Student.findById(studentId).select("centre").session(session);
      if (!student) throw fail("Student not found", 404);
      assertCentre(user, student.centre);
      if (String(student.centre) !== String(record.centre)) throw fail("Student must belong to the payment centre", 400);
      payment = await recordOfflinePaymentInTransaction({
        studentId, instalmentId, amountPaise: record.amountPaise, paymentMethod: record.paymentMethod,
        transactionId: record.transactionId, paidAt: record.paymentDate, user, session,
      });
      const update = await UnmatchedPayment.updateOne(
        { _id: record._id, status: "UNMATCHED" },
        { $set: { status: "MATCHED", reviewedBy: user._id, reviewedAt: new Date(), reviewNotes: reviewNotes.trim(), matchedStudent: studentId, matchedInstalment: instalmentId, matchedPayment: payment._id } },
        { session },
      );
      if (update.modifiedCount !== 1) throw fail("Payment has already been reviewed", 409);
      await AuditLog.create([{ actor: user._id, actorType: "USER", action: "UNMATCHED_PAYMENT_MATCHED", entityType: "UnmatchedPayment", entityId: record._id, details: { studentId, instalmentId, paymentId: payment._id, transactionId: record.transactionId } }], { session });
    });
    return payment;
  } catch (error) {
    if (error.code === 11000) throw fail("Transaction reference has already been used", 409);
    throw error;
  } finally { await session.endSession(); }
};

export const rejectUnmatchedPayment = async ({ id, user, reason }) => {
  validateId(id, "payment ID");
  const note = typeof reason === "string" ? reason.trim() : "";
  if (!note || note.length > 1000) throw fail("A rejection reason is required (up to 1000 characters)", 400);
  const session = await mongoose.startSession();
  try {
    let record;
    await session.withTransaction(async () => {
      record = await UnmatchedPayment.findOne({ _id: id }).session(session);
      if (!record) throw fail("Unmatched payment not found", 404);
      assertCentre(user, record.centre);
      const reviewedAt = new Date();
      const result = await UnmatchedPayment.updateOne({ _id: id, status: "UNMATCHED" }, { $set: { status: "REJECTED", reviewNotes: note, reviewedBy: user._id, reviewedAt } }, { session });
      if (result.modifiedCount !== 1) throw fail("Payment has already been reviewed", 409);
      record.status = "REJECTED";
      record.reviewNotes = note;
      record.reviewedBy = user._id;
      record.reviewedAt = reviewedAt;
      await AuditLog.create([{ actor: user._id, actorType: "USER", action: "UNMATCHED_PAYMENT_REJECTED", entityType: "UnmatchedPayment", entityId: id, details: { reason: note, transactionId: record.transactionId } }], { session });
    });
    return record;
  } finally { await session.endSession(); }
};
