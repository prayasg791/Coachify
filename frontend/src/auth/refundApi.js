import { api } from "./api.js";

const authConfig = (accessToken, signal) => ({
  ...(signal ? { signal } : {}),
  headers: { Authorization: `Bearer ${accessToken}` },
});

export const calculateRefundEstimate = async ({ request, accessToken }) => {
  const { data } = await api.post("/refunds/calculate", request, authConfig(accessToken));
  return data;
};

export const createRefundRequest = async ({ request, accessToken }) => {
  const { data } = await api.post("/refunds", request, authConfig(accessToken));
  return data;
};

export const getStudentRefunds = async ({ studentId, accessToken, signal }) => {
  const { data } = await api.get(
    `/refunds/student/${encodeURIComponent(studentId)}`,
    authConfig(accessToken, signal),
  );
  return data;
};

export const getAccountsRefundQueue = async ({ filters, accessToken, signal }) => {
  const { data } = await api.get("/refunds", {
    params: filters,
    ...authConfig(accessToken, signal),
  });
  return data;
};

export const decideRefundRequest = async ({ refundId, decision, rejectionReason, accessToken }) => {
  const { data } = await api.patch(
    `/refunds/${encodeURIComponent(refundId)}/decision`,
    { decision, ...(rejectionReason ? { rejectionReason } : {}) },
    authConfig(accessToken),
  );
  return data;
};

export const processRefundRequest = async ({ refundId, accessToken }) => {
  const { data } = await api.post(
    `/refunds/${encodeURIComponent(refundId)}/process`,
    {},
    authConfig(accessToken),
  );
  return data;
};
