import mongoose from "mongoose";
import FeePlan from "../../models/FeePlan.js";
import Instalment from "../../models/Instalment.js";
import Student from "../../models/Student.js";

const MAX_PAGE_SIZE = 100;
const MAX_PAGE_NUMBER = 1_000_000;
const MAX_SEARCH_LENGTH = 100;

const createError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parseObjectId = (value, name) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !mongoose.Types.ObjectId.isValid(value)) {
    throw createError(`${name} must be a valid ID`, 400);
  }
  return value.toLowerCase();
};

const parsePaginationValue = (value, name, defaultValue, maximum) => {
  if (value === undefined) return defaultValue;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw createError(`${name} must be a positive integer`, 400);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw createError(`${name} must not exceed ${maximum}`, 400);
  }
  return parsed;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseFilters = (filters) => {
  const search = filters.search === undefined ? "" : filters.search;
  if (typeof search !== "string") {
    throw createError("search must be a string", 400);
  }
  if (search.trim().length > MAX_SEARCH_LENGTH) {
    throw createError(`search must not exceed ${MAX_SEARCH_LENGTH} characters`, 400);
  }

  return {
    search: search.trim(),
    centreId: parseObjectId(filters.centreId, "centreId"),
    batchId: parseObjectId(filters.batchId, "batchId"),
  };
};

const buildStudentQuery = ({ centreIds, filters }) => {
  const query = { centre: { $in: centreIds } };

  if (filters.centreId) {
    query.centre = new mongoose.Types.ObjectId(filters.centreId);
  }
  if (filters.batchId) {
    query.batch = new mongoose.Types.ObjectId(filters.batchId);
  }
  if (filters.search) {
    const searchPattern = new RegExp(escapeRegex(filters.search), "i");
    query.$or = [
      { name: searchPattern },
      { studentId: searchPattern },
    ];
  }

  return query;
};

const getSuccessfulPaymentsByStudent = async (studentIds) => {
  if (!studentIds.length) return new Map();

  const totals = await Instalment.aggregate([
    { $match: { student: { $in: studentIds } } },
    {
      $lookup: {
        from: "payments",
        let: { instalmentId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$instalment", "$$instalmentId"] },
                  { $eq: ["$status", "SUCCESS"] },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              totalPaidPaise: { $sum: "$amountPaise" },
            },
          },
        ],
        as: "successfulPayment",
      },
    },
    {
      $addFields: {
        paidPaise: {
          $ifNull: [
            { $arrayElemAt: ["$successfulPayment.totalPaidPaise", 0] },
            0,
          ],
        },
      },
    },
    {
      $group: {
        _id: "$student",
        totalPaidPaise: { $sum: "$paidPaise" },
      },
    },
  ]);

  return new Map(totals.map((entry) => [entry._id.toString(), entry.totalPaidPaise]));
};

const getStudents = async ({ user, filters: rawFilters, pagination: rawPagination }) => {
  const filters = parseFilters(rawFilters);
  const page = parsePaginationValue(rawPagination.page, "page", 1, MAX_PAGE_NUMBER);
  const limit = parsePaginationValue(rawPagination.limit, "limit", 20, MAX_PAGE_SIZE);
  const centreIds = [...new Set((user.centres || []).map((centreId) => centreId.toString()))];

  if (filters.centreId && !centreIds.includes(filters.centreId)) {
    throw createError("You cannot access this centre", 403);
  }

  const studentQuery = buildStudentQuery({ centreIds, filters });
  const skip = (page - 1) * limit;
  const [totalRecords, studentRecords] = await Promise.all([
    Student.countDocuments(studentQuery),
    Student.find(studentQuery)
      .select("studentId name centre batch")
      .populate({ path: "centre", select: "name" })
      .populate({ path: "batch", select: "name course" })
      .sort({ name: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const studentIds = studentRecords.map((student) => student._id);
  const [feePlans, successfulPaymentsByStudent] = await Promise.all([
    studentIds.length
      ? FeePlan.find({ student: { $in: studentIds } })
        .select("student finalPayablePaise")
        .lean()
      : [],
    getSuccessfulPaymentsByStudent(studentIds),
  ]);

  const feePlansByStudent = new Map(
    feePlans.map((plan) => [plan.student.toString(), plan]),
  );

  const students = studentRecords.map((student) => {
    const studentKey = student._id.toString();
    const feePlan = feePlansByStudent.get(studentKey);
    const totalPaidPaise = successfulPaymentsByStudent.get(studentKey) ?? 0;
    const outstandingBalancePaise = feePlan
      ? Math.max(0, feePlan.finalPayablePaise - totalPaidPaise)
      : 0;

    let paymentStatus = "NO_FEE_PLAN";
    if (feePlan) {
      if (outstandingBalancePaise === 0) {
        paymentStatus = "PAID";
      } else if (totalPaidPaise > 0) {
        paymentStatus = "PARTIALLY_PAID";
      } else {
        paymentStatus = "UNPAID";
      }
    }

    return {
      id: student._id,
      studentId: student.studentId,
      name: student.name,
      centre: {
        id: student.centre?._id,
        name: student.centre?.name,
      },
      batch: {
        id: student.batch?._id,
        name: student.batch?.name,
      },
      course: student.batch?.course,
      paymentStatus,
      outstandingBalancePaise,
    };
  });

  return {
    students,
    pagination: {
      currentPage: page,
      pageSize: limit,
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
    },
  };
};

export { buildStudentQuery, getStudents };
