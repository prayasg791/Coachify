import { getPaymentReceipt, getReceipt, listStudentReceipts } from "../services/receipt/receipt.service.js";
import { logError } from "../utils/logger.js";

const receiptError = (res, err, fallback) => {
  if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
  logError(fallback, err);
  return res.status(500).json({ success: false, message: fallback });
};
export const listStudentReceiptsController = async (req, res) => {
  try {
    const data = await listStudentReceipts({ studentId: req.params.studentId, user: req.user, page: req.query.page, limit: req.query.limit });
    return res.json({ success: true, data });
  } catch (err) { return receiptError(res, err, "Unable to retrieve student receipts"); }
};
export const getReceiptController = async (req, res) => {
  try { return res.json({ success: true, data: { receipt: await getReceipt({ receiptId: req.params.receiptId, user: req.user }) } }); }
  catch (err) { return receiptError(res, err, "Unable to retrieve receipt"); }
};
export const getPaymentReceiptController = async (req, res) => {
  try { return res.json({ success: true, data: { receipt: await getPaymentReceipt({ paymentId: req.params.paymentId, user: req.user }) } }); }
  catch (err) { return receiptError(res, err, "Unable to retrieve payment receipt"); }
};
