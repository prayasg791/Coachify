import {
  getStudentPaymentHistory,
  initiateParentPayment,
  recordOfflinePayment,
  simulateParentPayment,
} from "../services/payment/paymentApi.service.js";
import {
  createUnmatchedPayment, getUnmatchedPayment, listUnmatchedPayments,
  matchUnmatchedPayment, rejectUnmatchedPayment,
} from "../services/payment/unmatchedPayment.service.js";
import { logError } from "../utils/logger.js";

const sendServiceError = (res, error, fallbackMessage) => {
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

const initiateParentPaymentController = async (req, res) => {
  try {
    const payment = await initiateParentPayment({
      studentId: req.body.studentId,
      instalmentId: req.body.instalmentId,
      amountPaise: req.body.amountPaise,
      user: req.user,
    });

    return res.status(201).json({
      success: true,
      message: "Payment initiated",
      data: {
        id: payment._id,
        studentId: payment.student,
        instalmentId: payment.instalment,
        amountPaise: payment.amountPaise,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
        createdAt: payment.createdAt,
      },
    });
  } catch (error) {
    return sendServiceError(res, error, "Unable to initiate payment");
  }
};

const simulateParentPaymentController = async (req, res) => {
  try {
    const payment = await simulateParentPayment({
      paymentId: req.body.paymentId,
      outcome: req.body.outcome,
      user: req.user,
    });

    return res.status(200).json({
      success: true,
      message: "Mock payment processed",
      data: {
        id: payment._id,
        studentId: payment.student,
        instalmentId: payment.instalment,
        amountPaise: payment.amountPaise,
        paymentMethod: payment.paymentMethod,
        transactionId: payment.transactionId,
        status: payment.status,
        paidAt: payment.paidAt,
      },
    });
  } catch (error) {
    return sendServiceError(res, error, "Unable to process mock payment");
  }
};

const getStudentPaymentHistoryController = async (req, res) => {
  try {
    const payments = await getStudentPaymentHistory({
      studentId: req.params.studentId,
      user: req.user,
    });

    return res.status(200).json({
      success: true,
      data: { payments },
    });
  } catch (error) {
    return sendServiceError(res, error, "Unable to retrieve payment history");
  }
};

const recordOfflinePaymentController = async (req, res) => {
  try {
    const payment = await recordOfflinePayment({
      studentId: req.body.studentId,
      instalmentId: req.body.instalmentId,
      amountPaise: req.body.amountPaise,
      paymentMethod: req.body.paymentMethod,
      transactionId: req.body.transactionId ?? req.body.receiptNumber,
      user: req.user,
    });

    return res.status(201).json({
      success: true,
      message: "Offline payment recorded",
      data: {
        id: payment._id,
        studentId: payment.student,
        instalmentId: payment.instalment,
        amountPaise: payment.amountPaise,
        paymentMethod: payment.paymentMethod,
        transactionId: payment.transactionId,
        status: payment.status,
        paidAt: payment.paidAt,
      },
    });
  } catch (error) {
    return sendServiceError(res, error, "Unable to record offline payment");
  }
};

const unmatchedListController = async (req, res) => {
  try { return res.json({ success: true, data: await listUnmatchedPayments({ user: req.user, filters: req.query }) }); }
  catch (error) { return sendServiceError(res, error, "Unable to retrieve unmatched payments"); }
};
const unmatchedDetailController = async (req, res) => {
  try { return res.json({ success: true, data: { payment: await getUnmatchedPayment({ id: req.params.id, user: req.user }) } }); }
  catch (error) { return sendServiceError(res, error, "Unable to retrieve unmatched payment"); }
};
const unmatchedCreateController = async (req, res) => {
  try { return res.status(201).json({ success: true, data: { payment: await createUnmatchedPayment({ user: req.user, data: req.body }) } }); }
  catch (error) { return sendServiceError(res, error, "Unable to register unmatched payment"); }
};
const unmatchedMatchController = async (req, res) => {
  try {
    const payment = await matchUnmatchedPayment({ id: req.params.id, user: req.user, studentId: req.body.studentId, instalmentId: req.body.instalmentId, reviewNotes: req.body.reviewNotes });
    return res.json({ success: true, data: { payment: { id: payment._id, studentId: payment.student, instalmentId: payment.instalment, amountPaise: payment.amountPaise, transactionId: payment.transactionId, status: payment.status, paidAt: payment.paidAt } } });
  } catch (error) { return sendServiceError(res, error, "Unable to match unmatched payment"); }
};
const unmatchedRejectController = async (req, res) => {
  try { return res.json({ success: true, data: { payment: await rejectUnmatchedPayment({ id: req.params.id, user: req.user, reason: req.body.reason }) } }); }
  catch (error) { return sendServiceError(res, error, "Unable to reject unmatched payment"); }
};

export {
  getStudentPaymentHistoryController,
  initiateParentPaymentController,
  recordOfflinePaymentController,
  simulateParentPaymentController,
  unmatchedListController,
  unmatchedDetailController,
  unmatchedCreateController,
  unmatchedMatchController,
  unmatchedRejectController,
};
