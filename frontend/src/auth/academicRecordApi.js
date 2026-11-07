import { api } from "./api.js";

const authConfig = (accessToken, signal) => ({
  ...(signal ? { signal } : {}),
  headers: { Authorization: `Bearer ${accessToken}` },
});

export const getStudentAttendance = async ({ studentId, accessToken, signal }) => {
  const { data } = await api.get(
    `/attendance/student/${encodeURIComponent(studentId)}`,
    authConfig(accessToken, signal),
  );
  return data;
};

export const createAttendance = async ({ attendance, accessToken }) => {
  const { data } = await api.post("/attendance", attendance, authConfig(accessToken));
  return data;
};

export const createBulkAttendance = async ({ attendance, accessToken }) => {
  const { data } = await api.post("/attendance/bulk", attendance, authConfig(accessToken));
  return data;
};

export const getStudentTestHistory = async ({ studentId, accessToken, signal }) => {
  const { data } = await api.get(
    `/tests/student/${encodeURIComponent(studentId)}`,
    authConfig(accessToken, signal),
  );
  return data;
};

export const createTestScore = async ({ score, accessToken }) => {
  const { data } = await api.post("/tests/scores", score, authConfig(accessToken));
  return data;
};

export const createBulkTestScores = async ({ scores, accessToken }) => {
  const { data } = await api.post("/tests/scores/bulk", scores, authConfig(accessToken));
  return data;
};
