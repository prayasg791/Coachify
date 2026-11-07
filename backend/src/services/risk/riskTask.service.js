import mongoose from "mongoose";
import User from "../../models/User.js";
import RiskFlag from "../../models/RiskFlag.js";
import AuditLog from "../../models/AuditLog.js";

const PAGE_SIZE_MAX = 100;
const PAGE_MAX = 1_000_000;
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"];
const RISK_STATUSES = ["OPEN", "REVIEWED", "FALSE_POSITIVE", "RESOLVED"];
const REVIEW_OUTCOMES = ["REVIEWED", "FALSE_POSITIVE", "RESOLVED"];

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parseObjectId = (value, name) => {
  if (value === undefined || value === "") return undefined;
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw createError(`${name} must be a valid ID`);
  }
  return new mongoose.Types.ObjectId(value);
};

const parsePaginationValue = (value, name, defaultValue, maximum) => {
  if (value === undefined) return defaultValue;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw createError(`${name} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw createError(`${name} must not exceed ${maximum}`);
  }
  return parsed;
};

const parseListFilters = ({ centreId, riskLevel, status, page, limit }) => {
  const parsedCentreId = parseObjectId(centreId, "centreId");
  if (riskLevel && !RISK_LEVELS.includes(riskLevel)) {
    throw createError("riskLevel must be LOW, MEDIUM, or HIGH");
  }
  if (status && !RISK_STATUSES.includes(status)) {
    throw createError(`status must be one of ${RISK_STATUSES.join(", ")}`);
  }
  return {
    centreId: parsedCentreId,
    riskLevel,
    status,
    page: parsePaginationValue(page, "page", 1, PAGE_MAX),
    limit: parsePaginationValue(limit, "limit", 20, PAGE_SIZE_MAX),
  };
};

const authorizedCentreIds = (user) =>
  [...new Set((user.centres || []).map((centreId) => centreId.toString()))];

const ensureCentreFilterAccess = (user, centreId) => {
  const centreIds = authorizedCentreIds(user);
  if (centreId && !centreIds.includes(centreId.toString())) {
    throw createError("You cannot access students at this centre", 403);
  }
  return centreIds.map((id) => new mongoose.Types.ObjectId(id));
};

const formatFlag = (flag) => ({
  id: flag._id,
  riskLevel: flag.riskLevel,
  followUpRequired: flag.followUpRequired,
  confidence: flag.confidence,
  reasons: flag.reasons,
  signals: flag.signals,
  status: flag.status,
  assignedTo: flag.assignedTo
    ? { id: flag.assignedTo._id, name: flag.assignedTo.name }
    : null,
  reviewedBy: flag.reviewedBy,
  reviewedAt: flag.reviewedAt,
  reviewNotes: flag.reviewNotes,
  analysisSource: flag.analysisSource,
  student: {
    id: flag.studentDoc._id,
    studentId: flag.studentDoc.studentId,
    name: flag.studentDoc.name,
    centre: flag.centreDoc
      ? {
        id: flag.centreDoc._id,
        name: flag.centreDoc.name,
        code: flag.centreDoc.code,
      }
      : null,
    batch: flag.batchDoc
      ? {
        id: flag.batchDoc._id,
        name: flag.batchDoc.name,
        course: flag.batchDoc.course,
        academicYear: flag.batchDoc.academicYear,
      }
      : null,
  },
  createdAt: flag.createdAt,
  updatedAt: flag.updatedAt,
});

const listRiskFlags = async ({ user, filters: rawFilters }) => {
  const filters = parseListFilters(rawFilters);
  const centreObjectIds = ensureCentreFilterAccess(user, filters.centreId);
  const match = {};
  if (filters.riskLevel) match.riskLevel = filters.riskLevel;
  if (filters.status) match.status = filters.status;

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: "students",
        localField: "student",
        foreignField: "_id",
        as: "studentDoc",
      },
    },
    { $unwind: "$studentDoc" },
    {
      $match: {
        "studentDoc.centre": filters.centreId ?? { $in: centreObjectIds },
      },
    },
    {
      $facet: {
        metadata: [{ $count: "totalRecords" }],
        flags: [
          { $sort: { createdAt: -1, _id: -1 } },
          { $skip: (filters.page - 1) * filters.limit },
          { $limit: filters.limit },
          {
            $lookup: {
              from: "centres",
              localField: "studentDoc.centre",
              foreignField: "_id",
              as: "centreDoc",
            },
          },
          {
            $unwind: {
              path: "$centreDoc",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $lookup: {
              from: "batches",
              localField: "studentDoc.batch",
              foreignField: "_id",
              as: "batchDoc",
            },
          },
          {
            $unwind: {
              path: "$batchDoc",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $lookup: {
              from: "users",
              localField: "assignedTo",
              foreignField: "_id",
              pipeline: [{ $project: { name: 1 } }],
              as: "assignedUser",
            },
          },
          {
            $unwind: {
              path: "$assignedUser",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $addFields: {
              assignedTo: {
                $cond: [
                  { $ifNull: ["$assignedUser._id", false] },
                  { _id: "$assignedUser._id", name: "$assignedUser.name" },
                  null,
                ],
              },
            },
          },
        ],
      },
    },
  ];

  const [result = { metadata: [], flags: [] }] = await RiskFlag.aggregate(pipeline);
  const totalRecords = result.metadata[0]?.totalRecords ?? 0;
  return {
    flags: result.flags.map(formatFlag),
    pagination: {
      currentPage: filters.page,
      pageSize: filters.limit,
      totalRecords,
      totalPages: Math.ceil(totalRecords / filters.limit),
    },
  };
};

const listActiveCounsellors = async ({ user, centreId: rawCentreId }) => {
  const centreId = parseObjectId(rawCentreId, "centreId");
  const authorizedCentres = ensureCentreFilterAccess(user, centreId);
  const accessibleIds = new Set(authorizedCentres.map((id) => id.toString()));
  const counsellors = await User.find({
    role: "COUNSELLOR",
    isActive: true,
    centres: { $in: centreId ? [centreId] : authorizedCentres },
  })
    .select("_id name centres")
    .sort({ name: 1, _id: 1 })
    .lean();

  return {
    counsellors: counsellors.map((counsellor) => ({
      id: counsellor._id,
      name: counsellor.name,
      centreIds: counsellor.centres
        .map((id) => id.toString())
        .filter((id) => accessibleIds.has(id) && (!centreId || id === centreId.toString())),
    })),
  };
};

const assignRiskTask = async ({ riskFlagId, counsellorId, assignedBy }) => {
  const parsedRiskFlagId = parseObjectId(riskFlagId, "riskFlagId");
  const parsedCounsellorId = parseObjectId(counsellorId, "counsellorId");
  if (!parsedRiskFlagId || !parsedCounsellorId) {
    throw createError("riskFlagId and counsellorId are required");
  }

  const [counsellor, accountUser, riskFlag] = await Promise.all([
    User.findOne({
      _id: parsedCounsellorId,
      role: "COUNSELLOR",
      isActive: true,
    }).select("_id name centres"),
    User.findOne({
      _id: assignedBy._id,
      role: "ACCOUNTS",
      isActive: true,
    }).select("_id centres"),
    RiskFlag.findOne({
      _id: parsedRiskFlagId,
      followUpRequired: true,
      status: "OPEN",
    })
      .select("student followUpRequired status")
      .populate({ path: "student", select: "centre" }),
  ]);

  if (!counsellor) throw createError("Active counsellor not found", 404);
  if (!accountUser) throw createError("Active accounts user not found", 403);
  if (!riskFlag?.student) throw createError("Open follow-up task not found", 404);

  const centreId = riskFlag.student.centre.toString();
  const accountCentres = authorizedCentreIds(accountUser);
  if (!accountCentres.includes(centreId)) {
    throw createError("You cannot manage students at this centre", 403);
  }
  const counsellorCentres = authorizedCentreIds(counsellor);
  if (!counsellorCentres.includes(centreId)) {
    throw createError("Counsellor is not assigned to this centre", 400);
  }

  const session = await mongoose.startSession();
  let updatedFlag;
  try {
    await session.withTransaction(async () => {
      updatedFlag = await RiskFlag.findOneAndUpdate(
        {
          _id: parsedRiskFlagId,
          followUpRequired: true,
          status: "OPEN",
        },
        { $set: { assignedTo: parsedCounsellorId } },
        { new: true, session },
      );
      if (!updatedFlag) throw createError("Open follow-up task not found", 409);

      await AuditLog.create([{
        actor: assignedBy._id,
        actorType: "USER",
        action: "RISK_TASK_ASSIGNED",
        entityType: "RiskFlag",
        entityId: updatedFlag._id,
        details: {
          studentId: riskFlag.student._id,
          centreId: riskFlag.student.centre,
          counsellorId: counsellor._id,
        },
      }], { session });
    });
    return updatedFlag;
  } finally {
    await session.endSession();
  }
};

const getCounsellorTasks = async ({ counsellorId, pagination: rawPagination = {} }) => {
  const parsedCounsellorId = parseObjectId(counsellorId, "counsellorId");
  const page = parsePaginationValue(rawPagination.page, "page", 1, PAGE_MAX);
  const limit = parsePaginationValue(rawPagination.limit, "limit", 20, PAGE_SIZE_MAX);
  const counsellor = await User.findOne({
    _id: parsedCounsellorId,
    role: "COUNSELLOR",
    isActive: true,
  }).select("_id");
  if (!counsellor) throw createError("Active counsellor not found", 403);

  const filter = {
    assignedTo: parsedCounsellorId,
    followUpRequired: true,
    status: { $in: ["OPEN", "REVIEWED"] },
  };
  const [totalRecords, flags] = await Promise.all([
    RiskFlag.countDocuments(filter),
    RiskFlag.find(filter)
      .select("student riskLevel followUpRequired confidence reasons signals status reviewedAt reviewNotes analysisSource createdAt updatedAt")
      .populate({
        path: "student",
        select: "studentId name centre batch",
        populate: [
          { path: "centre", select: "name code" },
          { path: "batch", select: "name course academicYear" },
        ],
      })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  return {
    tasks: flags.map((flag) => ({
      id: flag._id,
      riskLevel: flag.riskLevel,
      followUpRequired: flag.followUpRequired,
      confidence: flag.confidence,
      reasons: flag.reasons,
      signals: flag.signals,
      status: flag.status,
      reviewedAt: flag.reviewedAt,
      reviewNotes: flag.reviewNotes,
      analysisSource: flag.analysisSource,
      student: flag.student
        ? {
          id: flag.student._id,
          studentId: flag.student.studentId,
          name: flag.student.name,
          centre: flag.student.centre
            ? {
              id: flag.student.centre._id,
              name: flag.student.centre.name,
              code: flag.student.centre.code,
            }
            : null,
          batch: flag.student.batch
            ? {
              id: flag.student.batch._id,
              name: flag.student.batch.name,
              course: flag.student.batch.course,
              academicYear: flag.student.batch.academicYear,
            }
            : null,
        }
        : null,
      createdAt: flag.createdAt,
      updatedAt: flag.updatedAt,
    })),
    pagination: {
      currentPage: page,
      pageSize: limit,
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
    },
  };
};

const reviewRiskTask = async ({
  riskFlagId,
  counsellorId,
  outcome,
  reviewNotes = "",
}) => {
  const parsedRiskFlagId = parseObjectId(riskFlagId, "riskFlagId");
  const parsedCounsellorId = parseObjectId(counsellorId, "counsellorId");
  if (!parsedRiskFlagId || !parsedCounsellorId) {
    throw createError("riskFlagId is required");
  }
  if (!REVIEW_OUTCOMES.includes(outcome)) {
    throw createError(`outcome must be one of ${REVIEW_OUTCOMES.join(", ")}`);
  }
  if (typeof reviewNotes !== "string" || reviewNotes.length > 1000) {
    throw createError("reviewNotes must be a string of at most 1000 characters");
  }
  if (outcome === "FALSE_POSITIVE" && !reviewNotes.trim()) {
    throw createError("reviewNotes are required when marking a task as a false positive");
  }

  const counsellor = await User.findOne({
    _id: parsedCounsellorId,
    role: "COUNSELLOR",
    isActive: true,
  }).select("_id");
  if (!counsellor) throw createError("Active counsellor not found", 403);

  const priorStatuses = outcome === "REVIEWED"
    ? ["OPEN"]
    : outcome === "RESOLVED"
      ? ["REVIEWED"]
      : ["OPEN", "REVIEWED"];
  const update = {
    status: outcome,
    reviewedBy: parsedCounsellorId,
    reviewedAt: new Date(),
    reviewNotes: reviewNotes.trim(),
  };
  if (outcome === "FALSE_POSITIVE" || outcome === "RESOLVED") {
    update.followUpRequired = false;
  }

  const session = await mongoose.startSession();
  let riskFlag;
  try {
    await session.withTransaction(async () => {
      riskFlag = await RiskFlag.findOneAndUpdate(
        {
          _id: parsedRiskFlagId,
          assignedTo: parsedCounsellorId,
          followUpRequired: true,
          status: { $in: priorStatuses },
        },
        { $set: update },
        { new: true, session },
      );
      if (!riskFlag) {
        throw createError("Assigned follow-up task not found or status transition is not allowed", 404);
      }

      await AuditLog.create([{
        actor: parsedCounsellorId,
        actorType: "USER",
        action: `RISK_TASK_${outcome}`,
        entityType: "RiskFlag",
        entityId: riskFlag._id,
        details: { outcome, reviewNotes: reviewNotes.trim() },
      }], { session });
    });
    return riskFlag;
  } finally {
    await session.endSession();
  }
};

export {
  assignRiskTask,
  getCounsellorTasks,
  listActiveCounsellors,
  listRiskFlags,
  reviewRiskTask,
};
