import { api } from "./api.js";

const authConfig = (accessToken, signal) => ({
  ...(signal ? { signal } : {}),
  headers: { Authorization: `Bearer ${accessToken}` },
});

export const getStudentPaymentHistory = async ({ studentId, accessToken, signal }) => {
  const { data } = await api.get(
    `/payments/student/${encodeURIComponent(studentId)}`,
    authConfig(accessToken, signal),
  );
  return data;
};

export const recordOfflinePayment = async ({ payment, accessToken }) => {
  const { data } = await api.post(
    "/payments/offline",
    payment,
    authConfig(accessToken),
  );
  return data;
};

export const initiateParentPayment = async ({ payment, accessToken }) => {
  const { data } = await api.post(
    "/payments/initiate",
    payment,
    authConfig(accessToken),
  );
  return data;
};

export const processMockPayment = async ({ payment, accessToken }) => {
  const { data } = await api.post(
    "/payments/mock-process",
    payment,
    authConfig(accessToken),
  );
  return data;
};

export const getUnmatchedPayments = async ({ filters, accessToken, signal }) => {
  const { data } = await api.get("/payments/unmatched", { params: filters, signal, ...authConfig(accessToken) });
  return data;
};
export const createUnmatchedPayment = async ({ payment, accessToken }) => {
  const { data } = await api.post("/payments/unmatched", payment, authConfig(accessToken));
  return data;
};
export const getUnmatchedPayment = async ({ id, accessToken, signal }) => {
  const { data } = await api.get(`/payments/unmatched/${encodeURIComponent(id)}`, { signal, ...authConfig(accessToken) });
  return data;
};
export const matchUnmatchedPayment = async ({ id, match, accessToken }) => {
  const { data } = await api.post(`/payments/unmatched/${encodeURIComponent(id)}/match`, match, authConfig(accessToken));
  return data;
};
export const rejectUnmatchedPayment = async ({ id, reason, accessToken }) => {
  const { data } = await api.post(`/payments/unmatched/${encodeURIComponent(id)}/reject`, { reason }, authConfig(accessToken));
  return data;
};
