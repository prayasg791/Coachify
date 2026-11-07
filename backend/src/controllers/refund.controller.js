import {
  createRefundRequest,
  decideRefundRequest,
  getRefundEstimate,
  listAccountsRefundQueue,
  listStudentRefunds,
  processRefundRequest,
} from "../services/refund/refundApi.service.js";
import { logError } from "../utils/logger.js";

const respondWithError = (res, error, fallbackMessage) => {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  logError(fallbackMessage, error);
  return res.status(500).json({
    success: false,
    message: fallbackMessage,
  });
};

const calculateRefundController = async (req, res) => {
  try {
    const estimate = await getRefundEstimate({
      studentId: req.body.studentId,
      withdrawalDate: req.body.withdrawalDate,
      user: req.user,
    });

    return res.status(200).json({
      success: true,
      data: estimate,
    });
  } catch (error) {
    return respondWithError(res, error, "Unable to calculate refund estimate");
  }
};

const createRefundController = async (req, res) => {
  try {
    const refund = await createRefundRequest({
      studentId: req.body.studentId,
      withdrawalDate: req.body.withdrawalDate,
      user: req.user,
    });

    return res.status(201).json({
      success: true,
      message: "Refund request created",
      data: {
        id: refund._id,
        studentId: refund.student,
        totalPaidPaise: refund.totalPaidPaise,
        eligibleAmountPaise: refund.eligibleAmountPaise,
        unusedCourseDays: refund.unusedCourseDays,
        totalCourseDays: refund.totalCourseDays,
        refundAmountPaise: refund.refundAmountPaise,
        withdrawalDate: refund.withdrawalDate,
        status: refund.status,
        createdAt: refund.createdAt,
      },
    });
  } catch (error) {
    return respondWithError(res, error, "Unable to create refund request");
  }
};

const listStudentRefundsController = async (req, res) => {
  try {
    const refunds = await listStudentRefunds({
      studentId: req.params.studentId,
      user: req.user,
    });

    return res.status(200).json({
      success: true,
      data: { refunds },
    });
  } catch (error) {
    return respondWithError(res, error, "Unable to retrieve refund requests");
  }
};

const listAccountsRefundQueueController = async (req, res) => {
  try {
    const result = await listAccountsRefundQueue({ user: req.user, filters: req.query });
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return respondWithError(res, error, "Unable to retrieve refund queue");
  }
};

const decideRefundController = async (req, res) => {
  try {
    const refund = await decideRefundRequest({
      refundId: req.params.refundId,
      decision: req.body.decision,
      rejectionReason: req.body.rejectionReason,
      user: req.user,
    });

    return res.status(200).json({
      success: true,
      message: `Refund ${refund.status.toLowerCase()}`,
      data: {
        id: refund._id,
        status: refund.status,
        decisionAt: refund.decisionAt,
        rejectionReason: refund.rejectionReason,
      },
    });
  } catch (error) {
    return respondWithError(res, error, "Unable to decide refund request");
  }
};

const processRefundController = async (req, res) => {
  try {
    const refund = await processRefundRequest({
      refundId: req.params.refundId,
      user: req.user,
    });

    return res.status(200).json({
      success: true,
      message: "Refund processed",
      data: {
        id: refund._id,
        status: refund.status,
        refundAmountPaise: refund.refundAmountPaise,
        refundTransactionId: refund.refundTransactionId,
        processedAt: refund.processedAt,
      },
    });
  } catch (error) {
    return respondWithError(res, error, "Unable to process refund");
  }
};

export {
  calculateRefundController,
  createRefundController,
  decideRefundController,
  listStudentRefundsController,
  listAccountsRefundQueueController,
  processRefundController,
};
