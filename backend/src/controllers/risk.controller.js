import {
  assignRiskTask,
  getCounsellorTasks,
  listActiveCounsellors,
  listRiskFlags,
  reviewRiskTask,
} from "../services/risk/riskTask.service.js";
import { logError } from "../utils/logger.js";

const respondWithError = (res, error, fallbackMessage) => {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "The risk task was updated by another request",
    });
  }
  logError(fallbackMessage, error);
  return res.status(500).json({
    success: false,
    message: fallbackMessage,
  });
};

const listRiskFlagsController = async (req, res) => {
  try {
    const result = await listRiskFlags({
      user: req.user,
      filters: req.query,
    });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return respondWithError(res, error, "Unable to retrieve risk flags");
  }
};

const listActiveCounsellorsController = async (req, res) => {
  try {
    const result = await listActiveCounsellors({
      user: req.user,
      centreId: req.query.centreId,
    });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return respondWithError(res, error, "Unable to retrieve counsellors");
  }
};

const assignRiskTaskController = async (req, res) => {
  try {
    const riskFlag = await assignRiskTask({
      riskFlagId: req.params.riskFlagId,
      counsellorId: req.body?.counsellorId,
      assignedBy: req.user,
    });
    return res.status(200).json({
      success: true,
      data: {
        id: riskFlag._id,
        status: riskFlag.status,
        assignedTo: riskFlag.assignedTo,
      },
    });
  } catch (error) {
    return respondWithError(res, error, "Unable to assign risk task");
  }
};

const listCounsellorTasksController = async (req, res) => {
  try {
    const result = await getCounsellorTasks({
      counsellorId: req.user._id,
      pagination: req.query,
    });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return respondWithError(res, error, "Unable to retrieve counsellor tasks");
  }
};

const reviewRiskTaskController = async (req, res) => {
  try {
    const riskFlag = await reviewRiskTask({
      riskFlagId: req.params.riskFlagId,
      counsellorId: req.user._id,
      outcome: req.body?.outcome,
      reviewNotes: req.body?.reviewNotes ?? "",
    });
    return res.status(200).json({
      success: true,
      data: {
        id: riskFlag._id,
        status: riskFlag.status,
        followUpRequired: riskFlag.followUpRequired,
        reviewedBy: riskFlag.reviewedBy,
        reviewedAt: riskFlag.reviewedAt,
        reviewNotes: riskFlag.reviewNotes,
      },
    });
  } catch (error) {
    return respondWithError(res, error, "Unable to review risk task");
  }
};

export {
  assignRiskTaskController,
  listActiveCounsellorsController,
  listCounsellorTasksController,
  listRiskFlagsController,
  reviewRiskTaskController,
};
