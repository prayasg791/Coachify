import mongoose from "mongoose";
import Consent from "../../models/Consent.js";
import Instalment from "../../models/Instalment.js";
import Payment from "../../models/Payment.js";
import Reminder from "../../models/Reminder.js";
import Student from "../../models/Student.js";

const reminderStatuses = ["SCHEDULED", "PROCESSING", "SENT", "CANCELLED", "FAILED"];
const reminderTypes = ["BEFORE_7_DAYS", "BEFORE_3_DAYS", "DUE_TODAY", "OVERDUE", "FOLLOW_UP"];
const MAX_LIMIT = 100;

const createError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const parseEnum = (value, allowed, name) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw createError(`Invalid ${name}`, 400);
  }
  return value;
};

const parseDate = (value, name, exclusiveEnd = false) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw createError(`${name} must be a valid YYYY-MM-DD date`, 400);
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== value) {
    throw createError(`${name} must be a valid YYYY-MM-DD date`, 400);
  }
  if (exclusiveEnd) date.setUTCDate(date.getUTCDate() + 1);
  return date;
};

const parsePagination = ({ page = "1", limit = "20" }) => {
  if (typeof page !== "string" || !/^\d+$/.test(page) || Number(page) < 1) {
    throw createError("page must be a positive integer", 400);
  }
  if (typeof limit !== "string" || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > MAX_LIMIT) {
    throw createError(`limit must be an integer from 1 to ${MAX_LIMIT}`, 400);
  }
  const parsedPage = Number(page);
  if (!Number.isSafeInteger(parsedPage)) throw createError("page is too large", 400);
  return { page: parsedPage, limit: Number(limit) };
};

const buildPipeline = ({ reminderMatch, centreIds, skip, limit }) => {
  const pipeline = [
    { $match: reminderMatch },
    { $lookup: { from: Student.collection.name, localField: "student", foreignField: "_id", as: "studentDoc" } },
    { $unwind: "$studentDoc" },
  ];
  if (centreIds) {
    pipeline.push({ $match: { "studentDoc.centre": { $in: centreIds } } });
  }
  pipeline.push(
    { $lookup: { from: Instalment.collection.name, localField: "instalment", foreignField: "_id", as: "instalmentDoc" } },
    { $unwind: "$instalmentDoc" },
    {
      $lookup: {
        from: Payment.collection.name,
        let: { instalmentId: "$instalmentDoc._id" },
        pipeline: [
          { $match: { $expr: { $and: [
            { $eq: ["$instalment", "$$instalmentId"] },
            { $eq: ["$status", "SUCCESS"] },
          ] } } },
          { $group: { _id: null, paidPaise: { $sum: "$amountPaise" } } },
        ],
        as: "paymentSummary",
      },
    },
    {
      $addFields: {
        outstandingBalancePaise: {
          $max: [0, { $subtract: [
            "$instalmentDoc.amountPaise",
            { $ifNull: [{ $arrayElemAt: ["$paymentSummary.paidPaise", 0] }, 0] },
          ] }],
        },
      },
    },
    {
      $project: {
        _id: 0,
        id: "$_id",
        type: 1,
        language: 1,
        message: 1,
        scheduledAt: 1,
        sentAt: 1,
        status: 1,
        outstandingBalancePaise: 1,
        student: {
          id: "$studentDoc._id",
          name: "$studentDoc.name",
          studentId: "$studentDoc.studentId",
        },
        instalment: {
          id: "$instalmentDoc._id",
          number: "$instalmentDoc.instalmentNumber",
          dueDate: "$instalmentDoc.dueDate",
        },
      },
    },
    {
      $facet: {
        data: [{ $sort: { scheduledAt: -1, id: -1 } }, { $skip: skip }, { $limit: limit }],
        metadata: [{ $count: "totalRecords" }],
      },
    },
  );
  return pipeline;
};

const getReminderPage = async ({ user, filters = {}, scope }) => {
  const allowedFilters = scope === "accounts"
    ? new Set(["centreId", "status", "type", "startDate", "endDate", "page", "limit"])
    : new Set(["status", "type", "startDate", "endDate", "page", "limit"]);
  for (const key of Object.keys(filters)) {
    if (!allowedFilters.has(key) || Array.isArray(filters[key]) || typeof filters[key] !== "string") {
      throw createError(`Invalid filter: ${key}`, 400);
    }
  }

  const { page, limit } = parsePagination(filters);
  const status = parseEnum(filters.status, reminderStatuses, "status");
  const type = parseEnum(filters.type, reminderTypes, "type");
  const startDate = parseDate(filters.startDate, "startDate");
  const endDate = parseDate(filters.endDate, "endDate", true);
  if (startDate && endDate && startDate >= endDate) {
    throw createError("startDate must not be after endDate", 400);
  }

  const reminderMatch = {};
  if (status) reminderMatch.status = status;
  if (type) reminderMatch.type = type;
  if (startDate || endDate) {
    reminderMatch.scheduledAt = {};
    if (startDate) reminderMatch.scheduledAt.$gte = startDate;
    if (endDate) reminderMatch.scheduledAt.$lt = endDate;
  }

  let centreIds;
  if (scope === "parent") {
    const linkedStudentIds = await Student.distinct("_id", { parent: user._id });
    if (!linkedStudentIds.length) return { data: [], pagination: { currentPage: page, pageSize: limit, totalRecords: 0, totalPages: 0 } };
    const consentedStudentIds = await Consent.distinct("student", {
      parent: user._id,
      student: { $in: linkedStudentIds },
      purpose: "STUDENT_DATA_PROCESSING",
      status: "GRANTED",
    });
    if (!consentedStudentIds.length) return { data: [], pagination: { currentPage: page, pageSize: limit, totalRecords: 0, totalPages: 0 } };
    reminderMatch.student = { $in: consentedStudentIds };
  } else {
    const assignedCentres = [...new Set((user.centres ?? []).map((id) => id.toString()))];
    if (filters.centreId !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(filters.centreId)) throw createError("Invalid centre ID", 400);
      if (!assignedCentres.includes(filters.centreId)) throw createError("You cannot access this centre", 403);
      centreIds = [new mongoose.Types.ObjectId(filters.centreId)];
    } else {
      centreIds = assignedCentres.map((id) => new mongoose.Types.ObjectId(id));
    }
    if (!centreIds.length) return { data: [], pagination: { currentPage: page, pageSize: limit, totalRecords: 0, totalPages: 0 } };
  }

  const [result = { data: [], metadata: [] }] = await Reminder.aggregate(
    buildPipeline({ reminderMatch, centreIds, skip: (page - 1) * limit, limit }),
  ).allowDiskUse(true);
  const totalRecords = result.metadata[0]?.totalRecords ?? 0;
  return {
    data: result.data,
    pagination: {
      currentPage: page,
      pageSize: limit,
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
    },
  };
};

const getParentReminders = ({ user, filters }) => getReminderPage({ user, filters, scope: "parent" });
const getAccountsReminders = ({ user, filters }) => getReminderPage({ user, filters, scope: "accounts" });

export { getParentReminders, getAccountsReminders };
