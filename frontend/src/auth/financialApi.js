import { api } from "./api.js";

const config = (accessToken, signal) => ({ ...(signal ? { signal } : {}), headers: { Authorization: `Bearer ${accessToken}` } });
export const getStudentReceipts = async ({ studentId, accessToken, page = 1, limit = 20, signal }) => {
  const { data } = await api.get(`/receipts/student/${encodeURIComponent(studentId)}`, { ...config(accessToken, signal), params: { page, limit } }); return data;
};
export const getReceipt = async ({ receiptId, accessToken, signal }) => {
  const { data } = await api.get(`/receipts/${encodeURIComponent(receiptId)}`, config(accessToken, signal)); return data;
};
export const getPaymentReceipt = async ({ paymentId, accessToken, signal }) => {
  const { data } = await api.get(`/receipts/payment/${encodeURIComponent(paymentId)}`, config(accessToken, signal)); return data;
};
export const getAccountsReport = async ({ report, filters, accessToken, signal }) => {
  const { data } = await api.get(`/reports/accounts/${report}`, { ...config(accessToken, signal), params: filters }); return data;
};
export const getAccountsReportOptions = async ({ accessToken, signal }) => {
  const { data } = await api.get("/reports/accounts/options", config(accessToken, signal)); return data;
};
export const getReceiptConfiguration = async ({ accessToken, signal }) => {
  const { data } = await api.get("/reports/accounts/receipt-configuration", config(accessToken, signal)); return data;
};
export const downloadTallyCsv = async ({ filters, accessToken, signal }) => {
  const response = await api.get("/reports/accounts/tally.csv", { ...config(accessToken, signal), params: filters, responseType: "blob" });
  return { blob: response.data, exportId: response.headers["x-coachify-export-id"] };
};
