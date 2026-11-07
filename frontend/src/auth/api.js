import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:5000/api" : "/api"),
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

export const accountsLogin = async ({ email, password }) => {
  const { data } = await api.post("/auth/accounts/login", { email, password });
  return data;
};

export const counsellorLogin = async ({ email, password }) => {
  const { data } = await api.post("/auth/counsellor/login", { email, password });
  return data;
};

export const requestParentOtp = async (phone) => {
  const { data } = await api.post("/auth/parent/request-otp", { phone });
  return data;
};

export const verifyParentOtp = async ({ phone, otp }) => {
  const { data } = await api.post("/auth/parent/verify-otp", { phone, otp });
  return data;
};

export const getAccountsDashboard = async ({ filters, accessToken, signal }) => {
  const { data } = await api.get("/dashboard/accounts", {
    params: filters,
    signal,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
};

export const getStudentFeeLedger = async ({ studentId, accessToken, signal }) => {
  const { data } = await api.get(`/fees/students/${encodeURIComponent(studentId)}/ledger`, {
    signal,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
};

export const getParentStudents = async ({ accessToken, signal }) => {
  const { data } = await api.get("/parent/students", {
    signal,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
};

export const getParentReminders = async ({ filters, accessToken, signal }) => {
  const { data } = await api.get("/reminders/parent", {
    params: filters,
    signal,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
};

export const getAccountsReminders = async ({ filters, accessToken, signal }) => {
  const { data } = await api.get("/reminders/accounts", {
    params: filters,
    signal,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
};

export const getStudents = async ({ filters, accessToken, signal }) => {
  const { data } = await api.get("/students", {
    params: filters,
    signal,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
};

const authenticatedRiskRequest = (accessToken, signal) => ({
  signal,
  headers: { Authorization: "Bearer " + accessToken },
});

export const getRiskFlags = async ({ filters, accessToken, signal }) => {
  const { data } = await api.get("/risk/flags", {
    params: filters,
    ...authenticatedRiskRequest(accessToken, signal),
  });
  return data;
};

export const getRiskCounsellors = async ({ centreId, accessToken, signal }) => {
  const { data } = await api.get("/risk/counsellors", {
    params: centreId ? { centreId } : undefined,
    ...authenticatedRiskRequest(accessToken, signal),
  });
  return data;
};

export const assignRiskFlag = async ({ riskFlagId, counsellorId, accessToken }) => {
  const { data } = await api.post(
    `/risk/flags/${encodeURIComponent(riskFlagId)}/assignment`,
    { counsellorId },
    authenticatedRiskRequest(accessToken),
  );
  return data;
};

export const getRiskTasks = async ({ filters, accessToken, signal }) => {
  const { data } = await api.get("/risk/tasks", {
    params: filters,
    ...authenticatedRiskRequest(accessToken, signal),
  });
  return data;
};

export const reviewRiskTask = async ({ riskFlagId, outcome, reviewNotes, accessToken }) => {
  const { data } = await api.patch(
    `/risk/tasks/${encodeURIComponent(riskFlagId)}/review`,
    { outcome, reviewNotes },
    authenticatedRiskRequest(accessToken),
  );
  return data;
};
