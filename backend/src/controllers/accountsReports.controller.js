import {
  exportTallyCsv, getFeeCollectionReport, getOutstandingDuesReport,
  getAccountsReportOptions, getPaymentCollectionReport, getRefundReport,
} from "../services/reports/accountsReports.service.js";
import { getReceiptConfiguration } from "../services/receipt/receipt.service.js";
import { logError } from "../utils/logger.js";

const filters = (query) => ({ centreId: query.centreId, batchId: query.batchId, startDate: query.startDate, endDate: query.endDate, paymentMethod: query.paymentMethod, page: query.page, limit: query.limit });
const respondError = (res, error, fallback) => {
  if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
  logError(fallback, error);
  return res.status(500).json({ success: false, message: fallback });
};
export const feeCollectionReportController = async (req, res) => {
  try { return res.json({ success: true, data: await getFeeCollectionReport({ user: req.user, filters: filters(req.query) }) }); }
  catch (error) { return respondError(res, error, "Unable to retrieve fee collection report"); }
};
export const paymentCollectionReportController = async (req, res) => {
  try { return res.json({ success: true, data: await getPaymentCollectionReport({ user: req.user, filters: filters(req.query) }) }); }
  catch (error) { return respondError(res, error, "Unable to retrieve payment collection report"); }
};
export const outstandingDuesReportController = async (req, res) => {
  try { return res.json({ success: true, data: await getOutstandingDuesReport({ user: req.user, filters: filters(req.query) }) }); }
  catch (error) { return respondError(res, error, "Unable to retrieve outstanding dues report"); }
};
export const refundReportController = async (req, res) => {
  try { return res.json({ success: true, data: await getRefundReport({ user: req.user, filters: filters(req.query) }) }); }
  catch (error) { return respondError(res, error, "Unable to retrieve refund report"); }
};
export const receiptConfigurationController = (_req, res) => {
  try { return res.json({ success: true, data: getReceiptConfiguration() }); }
  catch (error) { return respondError(res, error, "Receipt configuration is unavailable"); }
};
export const reportOptionsController = async (req, res) => {
  try { return res.json({ success: true, data: await getAccountsReportOptions({ user: req.user }) }); }
  catch (error) { return respondError(res, error, "Unable to retrieve report filters"); }
};
export const tallyCsvController = async (req, res) => {
  try {
    const result = await exportTallyCsv({ user: req.user, filters: filters(req.query) });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="coachify-tally-export-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader("X-Coachify-Export-Id", result.exportId);
    return res.status(200).send(result.csv);
  } catch (error) { return respondError(res, error, "Unable to export Tally CSV"); }
};
