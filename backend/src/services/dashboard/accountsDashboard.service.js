import mongoose from "mongoose";
import Batch from "../../models/Batch.js";
import FeePlan from "../../models/FeePlan.js";

const createError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parseDateFilter = (value, name) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw createError(`${name} must be a valid YYYY-MM-DD date`, 400);
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== value) {
    throw createError(`${name} must be a valid YYYY-MM-DD date`, 400);
  }

  return date;
};

const buildDashboardPipeline = ({
  centreIds,
  centreId,
  batchId,
  startDate,
  endDate,
  todayStart,
}) => {
  const planMatch = {};
  if (startDate || endDate) {
    planMatch.createdAt = {};
    if (startDate) {
      planMatch.createdAt.$gte = startDate;
    }
    if (endDate) {
      const exclusiveEndDate = new Date(endDate);
      exclusiveEndDate.setUTCDate(exclusiveEndDate.getUTCDate() + 1);
      planMatch.createdAt.$lt = exclusiveEndDate;
    }
  }

  const studentMatch = {
    "studentDoc.centre": {
      $in: (centreId ? [centreId] : centreIds).map(
        (id) => new mongoose.Types.ObjectId(id)
      ),
    },
  };
  if (batchId) {
    studentMatch["studentDoc.batch"] = new mongoose.Types.ObjectId(batchId);
  }

  return [
    { $match: planMatch },
    {
      $lookup: {
        from: "students",
        localField: "student",
        foreignField: "_id",
        as: "studentDoc",
      },
    },
    { $unwind: "$studentDoc" },
    { $match: studentMatch },
    {
      $lookup: {
        from: "instalments",
        let: { feePlanId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$feePlan", "$$feePlanId"] } } },
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
              dueDateDay: {
                $dateTrunc: {
                  date: "$dueDate",
                  unit: "day",
                  timezone: "UTC",
                },
              },
            },
          },
          {
            $addFields: {
              outstandingPaise: {
                $max: [0, { $subtract: ["$amountPaise", "$paidPaise"] }],
              },
              daysOverdue: {
                $max: [
                  0,
                  {
                    $dateDiff: {
                      startDate: "$dueDateDay",
                      endDate: todayStart,
                      unit: "day",
                      timezone: "UTC",
                    },
                  },
                ],
              },
            },
          },
          {
            $project: {
              paidPaise: 1,
              outstandingPaise: 1,
              daysOverdue: 1,
            },
          },
        ],
        as: "instalmentTotals",
      },
    },
    {
      $addFields: {
        totalCollectedPaise: {
          $sum: "$instalmentTotals.paidPaise",
        },
        overduePaise: {
          $sum: {
            $map: {
              input: "$instalmentTotals",
              as: "instalment",
              in: {
                $cond: [
                  { $gt: ["$$instalment.daysOverdue", 0] },
                  "$$instalment.outstandingPaise",
                  0,
                ],
              },
            },
          },
        },
        ageing0To30Paise: {
          $sum: {
            $map: {
              input: "$instalmentTotals",
              as: "instalment",
              in: {
                $cond: [
                  {
                    $and: [
                      { $gte: ["$$instalment.daysOverdue", 1] },
                      { $lte: ["$$instalment.daysOverdue", 30] },
                    ],
                  },
                  "$$instalment.outstandingPaise",
                  0,
                ],
              },
            },
          },
        },
        ageing31To60Paise: {
          $sum: {
            $map: {
              input: "$instalmentTotals",
              as: "instalment",
              in: {
                $cond: [
                  {
                    $and: [
                      { $gte: ["$$instalment.daysOverdue", 31] },
                      { $lte: ["$$instalment.daysOverdue", 60] },
                    ],
                  },
                  "$$instalment.outstandingPaise",
                  0,
                ],
              },
            },
          },
        },
        ageing60PlusPaise: {
          $sum: {
            $map: {
              input: "$instalmentTotals",
              as: "instalment",
              in: {
                $cond: [
                  { $gt: ["$$instalment.daysOverdue", 60] },
                  "$$instalment.outstandingPaise",
                  0,
                ],
              },
            },
          },
        },
      },
    },
    {
      $lookup: {
        from: "centres",
        localField: "studentDoc.centre",
        foreignField: "_id",
        as: "centreDoc",
      },
    },
    { $unwind: "$centreDoc" },
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
      $facet: {
        financialSummary: [
          {
            $group: {
              _id: null,
              totalBilledPaise: { $sum: "$finalPayablePaise" },
              totalCollectedPaise: { $sum: "$totalCollectedPaise" },
              totalOverduePaise: { $sum: "$overduePaise" },
              ageing0To30Paise: { $sum: "$ageing0To30Paise" },
              ageing31To60Paise: { $sum: "$ageing31To60Paise" },
              ageing60PlusPaise: { $sum: "$ageing60PlusPaise" },
            },
          },
          {
            $addFields: {
              totalOutstandingPaise: {
                $max: [
                  0,
                  { $subtract: ["$totalBilledPaise", "$totalCollectedPaise"] },
                ],
              },
            },
          },
          {
            $addFields: {
              collectionPercentage: {
                $cond: [
                  { $gt: ["$totalBilledPaise", 0] },
                  {
                    $round: [
                      {
                        $multiply: [
                          {
                            $divide: [
                              "$totalCollectedPaise",
                              "$totalBilledPaise",
                            ],
                          },
                          100,
                        ],
                      },
                      2,
                    ],
                  },
                  0,
                ],
              },
            },
          },
          { $project: { _id: 0 } },
        ],
        centreCollection: [
          {
            $group: {
              _id: "$studentDoc.centre",
              centreName: { $first: "$centreDoc.name" },
              totalBilledPaise: { $sum: "$finalPayablePaise" },
              totalCollectedPaise: { $sum: "$totalCollectedPaise" },
              overduePaise: { $sum: "$overduePaise" },
            },
          },
          {
            $addFields: {
              outstandingPaise: {
                $max: [
                  0,
                  { $subtract: ["$totalBilledPaise", "$totalCollectedPaise"] },
                ],
              },
            },
          },
          {
            $project: {
              _id: 0,
              centreId: "$_id",
              centreName: 1,
              totalBilledPaise: 1,
              totalCollectedPaise: 1,
              outstandingPaise: 1,
              overduePaise: 1,
            },
          },
          { $sort: { centreName: 1 } },
        ],
        batchOutstanding: [
          {
            $group: {
              _id: "$studentDoc.batch",
              batchName: { $first: "$batchDoc.name" },
              course: { $first: "$batchDoc.course" },
              totalStudents: { $sum: 1 },
              totalBilledPaise: { $sum: "$finalPayablePaise" },
              totalCollectedPaise: { $sum: "$totalCollectedPaise" },
              overduePaise: { $sum: "$overduePaise" },
            },
          },
          {
            $addFields: {
              outstandingPaise: {
                $max: [
                  0,
                  { $subtract: ["$totalBilledPaise", "$totalCollectedPaise"] },
                ],
              },
            },
          },
          {
            $project: {
              _id: 0,
              batchId: "$_id",
              batchName: 1,
              course: 1,
              totalStudents: 1,
              totalBilledPaise: 1,
              totalCollectedPaise: 1,
              outstandingPaise: 1,
              overduePaise: 1,
            },
          },
          { $sort: { batchName: 1 } },
        ],
      },
    },
  ];
};

const getAccountsDashboard = async ({ user, filters }) => {
  const userCentreIds = (user.centres || []).map((id) => id.toString());
  const uniqueCentreIds = [...new Set(userCentreIds)];

  if (filters.centreId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(filters.centreId)) {
      throw createError("Invalid centre ID", 400);
    }
    if (!uniqueCentreIds.includes(filters.centreId)) {
      throw createError("You cannot access this centre", 403);
    }
  }

  if (filters.batchId !== undefined &&
      !mongoose.Types.ObjectId.isValid(filters.batchId)) {
    throw createError("Invalid batch ID", 400);
  }

  const startDate = parseDateFilter(filters.startDate, "startDate");
  const endDate = parseDateFilter(filters.endDate, "endDate");
  if (startDate && endDate && startDate > endDate) {
    throw createError("startDate must not be after endDate", 400);
  }

  if (filters.batchId) {
    const batch = await Batch.findById(filters.batchId).select("centre");
    if (!batch) {
      throw createError("Batch not found", 404);
    }
    if (!uniqueCentreIds.includes(batch.centre.toString())) {
      throw createError("You cannot access this batch", 403);
    }
    if (
      filters.centreId &&
      batch.centre.toString() !== filters.centreId
    ) {
      throw createError("Batch does not belong to the selected centre", 400);
    }
  }

  const today = new Date();
  const todayStart = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  ));

  const pipeline = buildDashboardPipeline({
    centreIds: uniqueCentreIds,
    centreId: filters.centreId,
    batchId: filters.batchId,
    startDate,
    endDate,
    todayStart,
  });
  const [result = {}] = await FeePlan.aggregate(pipeline).allowDiskUse(true);
  const [financialSummary = {}] = result.financialSummary || [];

  return {
    financialSummary: {
      totalBilledPaise: financialSummary.totalBilledPaise || 0,
      totalCollectedPaise: financialSummary.totalCollectedPaise || 0,
      totalOutstandingPaise: financialSummary.totalOutstandingPaise || 0,
      totalOverduePaise: financialSummary.totalOverduePaise || 0,
      collectionPercentage: financialSummary.collectionPercentage || 0,
    },
    centreWiseCollection: result.centreCollection || [],
    batchWiseOutstanding: result.batchOutstanding || [],
    ageingAnalysis: {
      "0To30DaysPaise": financialSummary.ageing0To30Paise || 0,
      "31To60DaysPaise": financialSummary.ageing31To60Paise || 0,
      "60PlusDaysPaise": financialSummary.ageing60PlusPaise || 0,
    },
    appliedFilters: {
      centreId: filters.centreId || null,
      batchId: filters.batchId || null,
      startDate: filters.startDate || null,
      endDate: filters.endDate || null,
      dateFilterField: "FeePlan.createdAt",
      dateFilterSemantics:
        "Inclusive UTC calendar-day filter on fee plan creation date. Payment totals include all successful payments for the selected plans; overdue and ageing include their unpaid instalment balances as of the current UTC date.",
    },
    generatedAt: new Date(),
    currency: "INR",
    monetaryUnit: "PAISE",
  };
};

export { buildDashboardPipeline, getAccountsDashboard };
