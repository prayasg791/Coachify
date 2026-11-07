import mongoose from "mongoose";
import Batch from "../../models/Batch.js";
import Centre from "../../models/Centre.js";
import Student from "../../models/Student.js";
import Payment from "../../models/Payment.js";
import Refund from "../../models/Refund.js";
import AuditLog from "../../models/AuditLog.js";
import { calculateRefund } from "./refund.service.js";
import { decideRefund } from "./refundApproval.service.js";
import { processRefund } from "./refundProcessing.service.js";

const ACTIVE_REFUND_STATUSES = [
  "PENDING",
  "APPROVED",
  "PROCESSING",
  "PROCESSED",
];
const REFUND_STATUSES = ["PENDING", "APPROVED", "PROCESSING", "PROCESSED", "REJECTED"];
const MAX_REFUND_QUEUE_LIMIT = 100;

const createError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseQueueInteger = (value, fallback, name, maximum = Number.MAX_SAFE_INTEGER) => {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > maximum) {
    throw createError(`${name} must be an integer from 1 to ${maximum}`, 400);
  }
  return Number(value);
};

const listAccountsRefundQueue = async ({ user, filters = {} }) => {
  const allowedFilters = new Set(["status", "centreId", "search", "page", "limit"]);
  for (const [key, value] of Object.entries(filters)) {
    if (!allowedFilters.has(key) || Array.isArray(value) || typeof value !== "string") {
      throw createError(`Invalid filter: ${key}`, 400);
    }
  }

  const page = parseQueueInteger(filters.page, 1, "page");
  const limit = parseQueueInteger(filters.limit, 20, "limit", MAX_REFUND_QUEUE_LIMIT);
  if (!Number.isSafeInteger((page - 1) * limit)) {
    throw createError("page is too large", 400);
  }
  if (filters.status !== undefined && !REFUND_STATUSES.includes(filters.status)) {
    throw createError("Invalid refund status", 400);
  }
  if (filters.search !== undefined && filters.search.length > 100) {
    throw createError("search cannot exceed 100 characters", 400);
  }

  const assignedCentreIds = [...new Set((user.centres ?? []).map((id) => id.toString()))];
  let centreIds = assignedCentreIds;
  if (filters.centreId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(filters.centreId)) {
      throw createError("Invalid centre ID", 400);
    }
    if (!assignedCentreIds.includes(filters.centreId)) {
      throw createError("You cannot access this centre", 403);
    }
    centreIds = [filters.centreId];
  }

  const centreObjectIds = centreIds.map((id) => new mongoose.Types.ObjectId(id));
  if (!centreObjectIds.length) {
    return {
      refunds: [],
      pagination: { currentPage: page, pageSize: limit, totalRecords: 0, totalPages: 0 },
    };
  }

  const refundMatch = {};
  if (filters.status) refundMatch.status = filters.status;
  const pipeline = [
    { $match: refundMatch },
    { $sort: { createdAt: -1, _id: -1 } },
    { $lookup: { from: Student.collection.name, localField: "student", foreignField: "_id", as: "studentDoc" } },
    { $unwind: "$studentDoc" },
    { $match: { "studentDoc.centre": { $in: centreObjectIds } } },
  ];
  const search = filters.search?.trim();
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    pipeline.push({ $match: { $or: [
      { "studentDoc.name": pattern },
      { "studentDoc.studentId": pattern },
    ] } });
  }
  pipeline.push(
    { $lookup: { from: Centre.collection.name, localField: "studentDoc.centre", foreignField: "_id", as: "centreDoc" } },
    { $unwind: "$centreDoc" },
    { $lookup: { from: Batch.collection.name, localField: "studentDoc.batch", foreignField: "_id", as: "batchDoc" } },
    { $unwind: { path: "$batchDoc", preserveNullAndEmptyArrays: true } },
    { $project: {
      _id: 0,
      id: "$_id",
      status: 1,
      totalPaidPaise: 1,
      eligibleAmountPaise: 1,
      refundAmountPaise: 1,
      unusedCourseDays: 1,
      totalCourseDays: 1,
      withdrawalDate: 1,
      createdAt: 1,
      processedAt: 1,
      decisionAt: 1,
      rejectionReason: 1,
      student: {
        id: "$studentDoc._id",
        studentId: "$studentDoc.studentId",
        name: "$studentDoc.name",
      },
      centre: {
        id: "$centreDoc._id",
        name: "$centreDoc.name",
      },
      batch: {
        $cond: [
          { $ifNull: ["$batchDoc._id", false] },
          { id: "$batchDoc._id", name: "$batchDoc.name" },
          null,
        ],
      },
    } },
    { $facet: {
      refunds: [
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ],
      metadata: [{ $count: "totalRecords" }],
    } },
  );

  const [result = { refunds: [], metadata: [] }] = await Refund.aggregate(pipeline).allowDiskUse(true);
  const totalRecords = result.metadata[0]?.totalRecords ?? 0;
  return {
    refunds: result.refunds,
    pagination: {
      currentPage: page,
      pageSize: limit,
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
    },
  };
};

const parseWithdrawalDate = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    throw createError("A valid withdrawal date is required", 400);
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const normalized = new Date(Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day)
    ));

    if (normalized.toISOString().slice(0, 10) !== value) {
      throw createError("Invalid withdrawal date", 400);
    }

    return normalized;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw createError("Invalid withdrawal date", 400);
  }

  return new Date(Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate()
  ));
};

const findAuthorizedStudent = async ({ studentId, user }) => {
  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw createError("Invalid student ID", 400);
  }

  const student = await Student.findById(studentId).select(
    "_id studentId name parent centre courseStartDate courseEndDate"
  );

  if (!student) {
    throw createError("Student not found", 404);
  }

  if (user.role === "PARENT") {
    if (student.parent.toString() !== user._id.toString()) {
      throw createError("Student not found", 404);
    }
  } else if (user.role === "ACCOUNTS") {
    const hasCentreAccess = user.centres?.some(
      (centreId) => centreId.toString() === student.centre.toString()
    );

    if (!hasCentreAccess) {
      throw createError("You cannot access students at this centre", 403);
    }
  } else {
    throw createError("You are not authorized for this action", 403);
  }

  return student;
};

const sumSuccessfulPayments = async (studentId, session) => {
  let aggregation = Payment.aggregate([
    {
      $match: {
        student: new mongoose.Types.ObjectId(studentId),
        status: "SUCCESS",
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amountPaise" },
      },
    },
  ]);

  if (session) {
    aggregation = aggregation.session(session);
  }

  const result = await aggregation;
  return result[0]?.total || 0;
};

const sumReservedRefunds = async (studentId, session) => {
  let aggregation = Refund.aggregate([
    {
      $match: {
        student: new mongoose.Types.ObjectId(studentId),
        status: { $in: ACTIVE_REFUND_STATUSES },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$refundAmountPaise" },
      },
    },
  ]);

  if (session) {
    aggregation = aggregation.session(session);
  }

  const result = await aggregation;
  return result[0]?.total || 0;
};

const getRefundEstimate = async ({ studentId, withdrawalDate, user }) => {
  const student = await findAuthorizedStudent({ studentId, user });
  const normalizedWithdrawalDate = parseWithdrawalDate(withdrawalDate);

  const [totalPaidPaise, reservedRefundPaise] = await Promise.all([
    sumSuccessfulPayments(student._id),
    sumReservedRefunds(student._id),
  ]);

  if (
    !Number.isSafeInteger(totalPaidPaise) ||
    !Number.isSafeInteger(reservedRefundPaise) ||
    reservedRefundPaise > totalPaidPaise
  ) {
    throw createError("Unable to calculate eligible paid amount", 500);
  }

  const eligibleAmountPaise = totalPaidPaise - reservedRefundPaise;

  let estimate;
  try {
    estimate = calculateRefund({
      eligiblePaidFeesPaise: eligibleAmountPaise,
      courseStartDate: student.courseStartDate,
      courseEndDate: student.courseEndDate,
      withdrawalDate: normalizedWithdrawalDate,
    });
  } catch (error) {
    throw createError(error.message, 400);
  }

  return {
    totalPaidPaise,
    eligibleAmountPaise,
    unusedCourseDays: estimate.unusedCourseDays,
    totalCourseDays: estimate.totalCourseDays,
    estimatedRefundPaise: estimate.refundAmountPaise,
    withdrawalDate: normalizedWithdrawalDate,
    formulaAssumption:
      "Demo assumption only: eligible successful payments multiplied by unused course days divided by total course days. This is not verified legal policy.",
  };
};

const createRefundRequest = async ({ studentId, withdrawalDate, user }) => {
  const student = await findAuthorizedStudent({ studentId, user });
  const normalizedWithdrawalDate = parseWithdrawalDate(withdrawalDate);
  const session = await mongoose.startSession();

  try {
    let createdRefund;

    await session.withTransaction(async () => {
      const lockedStudent = await Student.findOneAndUpdate(
        { _id: student._id },
        { $inc: { __v: 1 } },
        { new: true, session }
      );

      if (!lockedStudent) {
        throw createError("Student not found", 404);
      }

      const duplicate = await Refund.findOne({
        student: student._id,
        withdrawalDate: normalizedWithdrawalDate,
        status: { $in: ACTIVE_REFUND_STATUSES },
      }).session(session);

      if (duplicate) {
        throw createError(
          "An active refund request already exists for this withdrawal date",
          409
        );
      }

      const [totalPaidPaise, reservedRefundPaise] = await Promise.all([
        sumSuccessfulPayments(student._id, session),
        sumReservedRefunds(student._id, session),
      ]);

      if (
        !Number.isSafeInteger(totalPaidPaise) ||
        !Number.isSafeInteger(reservedRefundPaise) ||
        reservedRefundPaise > totalPaidPaise
      ) {
        throw createError("Unable to calculate eligible paid amount", 500);
      }

      const eligibleAmountPaise = totalPaidPaise - reservedRefundPaise;

      let estimate;
      try {
        estimate = calculateRefund({
          eligiblePaidFeesPaise: eligibleAmountPaise,
          courseStartDate: student.courseStartDate,
          courseEndDate: student.courseEndDate,
          withdrawalDate: normalizedWithdrawalDate,
        });
      } catch (error) {
        throw createError(error.message, 400);
      }

      const [refund] = await Refund.create(
        [{
          student: student._id,
          totalPaidPaise,
          eligibleAmountPaise,
          unusedCourseDays: estimate.unusedCourseDays,
          totalCourseDays: estimate.totalCourseDays,
          refundAmountPaise: estimate.refundAmountPaise,
          withdrawalDate: normalizedWithdrawalDate,
          status: "PENDING",
        }],
        { session }
      );

      await AuditLog.create(
        [{
          actor: user._id,
          actorType: "USER",
          action: "REFUND_REQUEST_CREATED",
          entityType: "Refund",
          entityId: refund._id,
          details: {
            studentId: student._id,
            refundAmountPaise: refund.refundAmountPaise,
            withdrawalDate: normalizedWithdrawalDate,
          },
        }],
        { session }
      );

      createdRefund = refund;
    });

    return createdRefund;
  } catch (error) {
    if (error.code === 11000) {
      throw createError(
        "An active refund request already exists for this withdrawal date",
        409
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

const listStudentRefunds = async ({ studentId, user }) => {
  const student = await findAuthorizedStudent({ studentId, user });
  const refunds = await Refund.find({ student: student._id })
    .select(
      "totalPaidPaise eligibleAmountPaise unusedCourseDays totalCourseDays refundAmountPaise withdrawalDate status decisionAt rejectionReason processedAt refundTransactionId createdAt"
    )
    .sort({ createdAt: -1 });

  return refunds.map((refund) => ({
    id: refund._id,
    totalPaidPaise: refund.totalPaidPaise,
    eligibleAmountPaise: refund.eligibleAmountPaise,
    unusedCourseDays: refund.unusedCourseDays,
    totalCourseDays: refund.totalCourseDays,
    refundAmountPaise: refund.refundAmountPaise,
    withdrawalDate: refund.withdrawalDate,
    status: refund.status,
    decisionAt: refund.decisionAt,
    rejectionReason: refund.rejectionReason,
    processedAt: refund.processedAt,
    refundTransactionId: refund.refundTransactionId,
    createdAt: refund.createdAt,
  }));
};

const findAuthorizedRefund = async ({ refundId, user }) => {
  if (!mongoose.Types.ObjectId.isValid(refundId)) {
    throw createError("Invalid refund ID", 400);
  }

  const refund = await Refund.findById(refundId);
  if (!refund) {
    throw createError("Refund request not found", 404);
  }

  await findAuthorizedStudent({
    studentId: refund.student,
    user,
  });

  return refund;
};

const decideRefundRequest = async ({
  refundId,
  decision,
  rejectionReason,
  user,
}) => {
  const refund = await findAuthorizedRefund({ refundId, user });

  if (!["APPROVE", "REJECT"].includes(decision)) {
    throw createError("Decision must be APPROVE or REJECT", 400);
  }

  const normalizedReason =
    typeof rejectionReason === "string" ? rejectionReason.trim() : "";
  if (decision === "REJECT" && !normalizedReason) {
    throw createError("A rejection reason is required", 400);
  }
  if (normalizedReason.length > 1000) {
    throw createError("Rejection reason cannot exceed 1000 characters", 400);
  }

  try {
    return await decideRefund({
      refundId: refund._id,
      decidedBy: user._id,
      decision,
      rejectionReason: normalizedReason,
    });
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }
    throw error;
  }
};

const processRefundRequest = async ({ refundId, user }) => {
  const refund = await findAuthorizedRefund({ refundId, user });

  try {
    return await processRefund({
      refundId: refund._id,
      processedBy: user._id,
    });
  } catch (error) {
    if (error.code === 11000) {
      throw createError("Refund transaction reference already exists", 409);
    }
    if (error.statusCode) {
      throw error;
    }
    if (error.message === "Refund processing failed") {
      throw createError(error.message, 502);
    }
    throw error;
  }
};

export {
  createRefundRequest,
  decideRefundRequest,
  getRefundEstimate,
  listAccountsRefundQueue,
  listStudentRefunds,
  processRefundRequest,
};
