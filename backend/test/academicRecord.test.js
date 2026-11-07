import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Attendance from "../src/models/Attendance.js";
import AuditLog from "../src/models/AuditLog.js";
import Consent from "../src/models/Consent.js";
import Instalment from "../src/models/Instalment.js";
import Payment from "../src/models/Payment.js";
import RiskFlag from "../src/models/RiskFlag.js";
import Student from "../src/models/Student.js";
import TestScore from "../src/models/TestScore.js";
import User from "../src/models/User.js";
import attendanceRoutes from "../src/routes/attendance.routes.js";
import testScoreRoutes from "../src/routes/testScore.routes.js";

const secret = "academic-record-test-secret";
const parentId = "64f000000000000000000001";
const otherParentId = "64f000000000000000000002";
const accountId = "64f000000000000000000003";
const centreId = "64f000000000000000000004";
const otherCentreId = "64f000000000000000000005";
const studentId = "64f000000000000000000006";
const studentId2 = "64f000000000000000000007";

let server;
let endpoint;
let scenario;
let previousJwtSecret;
let transactionTail = Promise.resolve();

const query = (getValue) => ({
  select() {
    return this;
  },
  sort() {
    return this;
  },
  limit() {
    return this;
  },
  session() {
    return this;
  },
  then(resolve, reject) {
    return Promise.resolve().then(getValue).then(resolve, reject);
  },
});

const makeStudent = (id, parent = parentId, centre = centreId) => ({
  _id: id,
  studentId: `STU-${id.slice(-3)}`,
  name: "Academic Test Student",
  parent,
  centre,
  courseStartDate: new Date("2026-01-01T00:00:00.000Z"),
  courseEndDate: new Date("2027-01-01T00:00:00.000Z"),
  __v: 0,
});

const createScenario = ({ role, userId, centreIds = [centreId] }) => ({
  user: {
    _id: userId,
    role,
    centres: centreIds,
    isActive: true,
  },
  students: [
    makeStudent(studentId),
    makeStudent(studentId2, parentId, centreId),
  ],
  consent: {
    parent: parentId,
    student: studentId,
    purpose: "STUDENT_DATA_PROCESSING",
    status: "GRANTED",
  },
  attendance: [],
  testScores: [],
  audits: [],
  riskAnalyses: [],
  failAttendanceBulkAfterOne: false,
});

const authenticateRequest = (userId) => ({
  Authorization: `Bearer ${jwt.sign({ sub: userId }, secret)}`,
});

const send = async (method, path, userId, body) => {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      ...authenticateRequest(userId),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { response, body: await response.json() };
};

const studentMatches = (id) =>
  scenario.students.find((student) => student._id.toString() === id.toString());

const makeRecord = (record) => ({
  _id: new mongoose.Types.ObjectId().toString(),
  createdAt: new Date(),
  ...record,
});

before(async () => {
  previousJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;

  mock.method(User, "findById", (id) => ({
    select: async () => ({ ...scenario.user, _id: id }),
  }));
  mock.method(Student, "findById", (id) => ({
    select: async () => studentMatches(id) ?? null,
  }));
  mock.method(Student, "find", (filter) => ({
    select: async () => {
      const ids = filter._id.$in.map((id) => id.toString());
      return scenario.students.filter((student) =>
        ids.includes(student._id.toString())
      );
    },
  }));
  mock.method(Student, "findOne", async (filter) => {
    const student = studentMatches(filter._id);
    if (
      student &&
      student.parent.toString() === filter.parent.toString()
    ) {
      return student;
    }
    return null;
  });
  mock.method(Consent, "findOne", async (filter) => {
    if (
      scenario.consent &&
      filter.status === "GRANTED" &&
      filter.student.toString() === scenario.consent.student &&
      filter.parent.toString() === scenario.consent.parent
    ) {
      return scenario.consent;
    }
    return null;
  });
  mock.method(Attendance, "exists", async (filter) =>
    scenario.attendance.some((record) =>
      record.student.toString() === filter.student.toString() &&
      record.date >= filter.date.$gte &&
      record.date < filter.date.$lt
    )
  );
  mock.method(Attendance, "create", async (records) => {
    const docs = records.map(makeRecord);
    scenario.attendance.push(...docs);
    return docs;
  });
  mock.method(Attendance, "insertMany", async (records) => {
    if (scenario.failAttendanceBulkAfterOne) {
      const partial = makeRecord(records[0]);
      scenario.attendance.push(partial);
      throw new Error("Simulated bulk insert failure");
    }
    const docs = records.map(makeRecord);
    scenario.attendance.push(...docs);
    return docs;
  });
  mock.method(Attendance, "find", (filter) => query(() => {
    if (filter.student?.$in) {
      const ids = filter.student.$in.map((id) => id.toString());
      return scenario.attendance.filter((record) =>
        ids.includes(record.student.toString()) &&
        record.date >= filter.date.$gte &&
        record.date < filter.date.$lt
      );
    }
    return scenario.attendance.filter((record) =>
      record.student.toString() === filter.student.toString()
    );
  }));
  mock.method(TestScore, "create", async (records) => {
    const docs = records.map(makeRecord);
    scenario.testScores.push(...docs);
    return docs;
  });
  mock.method(TestScore, "insertMany", async (records) => {
    const docs = records.map(makeRecord);
    scenario.testScores.push(...docs);
    return docs;
  });
  mock.method(TestScore, "find", (filter) => query(() =>
    scenario.testScores.filter(
      (record) => record.student.toString() === filter.student.toString()
    )
  ));
  mock.method(Instalment, "find", () => query(() => []));
  mock.method(Payment, "aggregate", () => ({
    then(resolve, reject) {
      return Promise.resolve([]).then(resolve, reject);
    },
  }));
  mock.method(RiskFlag, "findOneAndUpdate", async (filter, update) => {
    scenario.riskAnalyses.push({
      student: filter.student.toString(),
      update: update.$set,
    });
    return { _id: "risk-flag" };
  });
  mock.method(AuditLog, "create", async (records) => {
    scenario.audits.push(...records);
  });
  mock.method(mongoose, "startSession", async () => ({
    async withTransaction(callback) {
      const pending = transactionTail.then(async () => {
        const attendanceLength = scenario.attendance.length;
        const scoresLength = scenario.testScores.length;
        const auditLength = scenario.audits.length;
        try {
          return await callback();
        } catch (error) {
          scenario.attendance.length = attendanceLength;
          scenario.testScores.length = scoresLength;
          scenario.audits.length = auditLength;
          throw error;
        }
      });
      transactionTail = pending.catch(() => {});
      return pending;
    },
    async endSession() {},
  }));

  const app = express();
  app.use(express.json());
  app.use("/api/attendance", attendanceRoutes);
  app.use("/api/tests", testScoreRoutes);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  endpoint = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  mock.restoreAll();
  if (previousJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = previousJwtSecret;
  }
});

test("valid attendance entry is recorded with actor and manual source", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountId });

  const { response, body } = await send(
    "POST",
    "/attendance",
    accountId,
    { studentId, date: "2026-11-06", status: "PRESENT" }
  );

  assert.equal(response.status, 201);
  assert.equal(body.data.attendance.status, "PRESENT");
  assert.equal(body.data.attendance.source, "MANUAL");
  assert.equal(body.data.attendance.recordedBy, accountId);
  assert.equal(scenario.audits[0].action, "ATTENDANCE_RECORDED");
});

test("duplicate attendance for the same student and date is rejected", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountId });
  scenario.attendance.push(makeRecord({
    student: studentId,
    date: new Date("2026-11-06T00:00:00.000Z"),
    status: "PRESENT",
  }));

  const { response } = await send(
    "POST",
    "/attendance",
    accountId,
    { studentId, date: "2026-11-06", status: "ABSENT" }
  );

  assert.equal(response.status, 409);
  assert.equal(scenario.attendance.length, 1);
});

test("invalid attendance status is rejected", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountId });

  const { response } = await send(
    "POST",
    "/attendance",
    accountId,
    { studentId, date: "2026-11-06", status: "LATE" }
  );

  assert.equal(response.status, 400);
  assert.equal(scenario.attendance.length, 0);
});

test("accounts cannot record attendance outside their assigned centres", async () => {
  scenario = createScenario({
    role: "ACCOUNTS",
    userId: accountId,
    centreIds: [otherCentreId],
  });

  const { response } = await send(
    "POST",
    "/attendance",
    accountId,
    { studentId, date: "2026-11-06", status: "PRESENT" }
  );

  assert.equal(response.status, 403);
  assert.equal(scenario.attendance.length, 0);
});

test("parent attendance history requires ownership and consent", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });
  scenario.attendance.push(makeRecord({
    student: studentId,
    date: new Date("2026-11-06T00:00:00.000Z"),
    status: "PRESENT",
  }));

  const ownHistory = await send(
    "GET",
    `/attendance/student/${studentId}`,
    parentId
  );
  assert.equal(ownHistory.response.status, 200);
  assert.equal(ownHistory.body.data.attendancePercentage, 100);

  const otherChild = await send(
    "GET",
    `/attendance/student/${studentId}`,
    otherParentId
  );
  assert.equal(otherChild.response.status, 404);

  scenario.consent = null;
  const noConsent = await send(
    "GET",
    `/attendance/student/${studentId}`,
    parentId
  );
  assert.equal(noConsent.response.status, 403);
});

test("bulk attendance rejects invalid records before inserting", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountId });

  const { response } = await send(
    "POST",
    "/attendance/bulk",
    accountId,
    {
      date: "2026-11-06",
      records: [
        { studentId, status: "PRESENT" },
        { studentId: studentId2, status: "UNKNOWN" },
      ],
    }
  );

  assert.equal(response.status, 400);
  assert.equal(scenario.attendance.length, 0);
});

test("bulk attendance transaction rolls back partial insert failures", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountId });
  scenario.failAttendanceBulkAfterOne = true;

  const { response } = await send(
    "POST",
    "/attendance/bulk",
    accountId,
    {
      date: "2026-11-06",
      records: [
        { studentId, status: "PRESENT" },
        { studentId: studentId2, status: "ABSENT" },
      ],
    }
  );

  assert.equal(response.status, 500);
  assert.equal(scenario.attendance.length, 0);
  assert.equal(scenario.audits.length, 0);
});

test("bulk attendance rejects duplicate IDs and existing day entries", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountId });
  const duplicateInRequest = await send(
    "POST",
    "/attendance/bulk",
    accountId,
    {
      date: "2026-11-06",
      records: [
        { studentId, status: "PRESENT" },
        { studentId, status: "ABSENT" },
      ],
    }
  );
  assert.equal(duplicateInRequest.response.status, 400);

  scenario.attendance.push(makeRecord({
    student: studentId2,
    date: new Date("2026-11-06T00:00:00.000Z"),
    status: "PRESENT",
  }));
  const existing = await send(
    "POST",
    "/attendance/bulk",
    accountId,
    {
      date: "2026-11-06",
      records: [
        { studentId, status: "PRESENT" },
        { studentId: studentId2, status: "ABSENT" },
      ],
    }
  );
  assert.equal(existing.response.status, 409);
});

test("valid test score is recorded and audited", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountId });

  const { response, body } = await send(
    "POST",
    "/tests/scores",
    accountId,
    {
      studentId,
      testName: "Mock Exam 1",
      subject: "Physics",
      score: 80,
      maximumScore: 100,
      testDate: "2026-11-06",
    }
  );

  assert.equal(response.status, 201);
  assert.equal(body.data.testScore.score, 80);
  assert.equal(body.data.testScore.recordedBy, accountId);
  assert.equal(scenario.audits[0].action, "TEST_SCORE_RECORDED");
});

test("test score cannot exceed maximum score or be negative", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountId });
  const common = {
    studentId,
    testName: "Mock Exam",
    subject: "Math",
    maximumScore: 100,
    testDate: "2026-11-06",
  };

  const tooHigh = await send(
    "POST",
    "/tests/scores",
    accountId,
    { ...common, score: 101 }
  );
  const negative = await send(
    "POST",
    "/tests/scores",
    accountId,
    { ...common, score: -1 }
  );

  assert.equal(tooHigh.response.status, 400);
  assert.equal(negative.response.status, 400);
  assert.equal(scenario.testScores.length, 0);
});

test("bulk test scores validate every student, value, and duplicate", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountId });
  const common = {
    testName: "Mock Exam",
    subject: "Math",
    testDate: "2026-11-06",
  };

  const duplicate = await send(
    "POST",
    "/tests/scores/bulk",
    accountId,
    {
      ...common,
      records: [
        { studentId, score: 50, maximumScore: 100 },
        { studentId, score: 60, maximumScore: 100 },
      ],
    }
  );
  assert.equal(duplicate.response.status, 400);

  const invalidScore = await send(
    "POST",
    "/tests/scores/bulk",
    accountId,
    {
      ...common,
      records: [
        { studentId, score: 50, maximumScore: 100 },
        { studentId: studentId2, score: 120, maximumScore: 100 },
      ],
    }
  );
  assert.equal(invalidScore.response.status, 400);
  assert.equal(scenario.testScores.length, 0);
});

test("bulk test scores reject centre access violations without writes", async () => {
  scenario = createScenario({
    role: "ACCOUNTS",
    userId: accountId,
    centreIds: [otherCentreId],
  });

  const { response } = await send(
    "POST",
    "/tests/scores/bulk",
    accountId,
    {
      testName: "Mock Exam",
      subject: "Math",
      testDate: "2026-11-06",
      records: [{ studentId, score: 50, maximumScore: 100 }],
    }
  );

  assert.equal(response.status, 403);
  assert.equal(scenario.testScores.length, 0);
});

test("parent test history is limited to linked student and active consent", async () => {
  scenario = createScenario({ role: "PARENT", userId: parentId });
  scenario.testScores.push(makeRecord({
    student: studentId,
    testName: "Mock Exam",
    subject: "Chemistry",
    score: 45,
    maximumScore: 50,
    testDate: new Date("2026-11-05T00:00:00.000Z"),
  }));

  const ownHistory = await send(
    "GET",
    `/tests/student/${studentId}`,
    parentId
  );
  assert.equal(ownHistory.response.status, 200);
  assert.equal(ownHistory.body.data.tests[0].percentage, 90);

  const otherParent = await send(
    "GET",
    `/tests/student/${studentId}`,
    otherParentId
  );
  assert.equal(otherParent.response.status, 404);

  scenario.consent = null;
  const noConsent = await send(
    "GET",
    `/tests/student/${studentId}`,
    parentId
  );
  assert.equal(noConsent.response.status, 403);
});

test("bulk academic operations trigger risk analysis once per student", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountId });

  const attendance = await send(
    "POST",
    "/attendance/bulk",
    accountId,
    {
      date: "2026-11-06",
      records: [
        { studentId, status: "PRESENT" },
        { studentId: studentId2, status: "ABSENT" },
      ],
    }
  );
  assert.equal(attendance.response.status, 201);
  assert.equal(attendance.body.data.riskAnalysis.analyzed, 2);
  assert.equal(scenario.riskAnalyses.length, 2);

  scenario.riskAnalyses = [];
  const scores = await send(
    "POST",
    "/tests/scores/bulk",
    accountId,
    {
      testName: "Mock Exam",
      subject: "Physics",
      testDate: "2026-11-06",
      records: [
        { studentId, score: 80, maximumScore: 100 },
        { studentId: studentId2, score: 75, maximumScore: 100 },
      ],
    }
  );
  assert.equal(scores.response.status, 201);
  assert.equal(scores.body.data.riskAnalysis.analyzed, 2);
  assert.equal(scenario.riskAnalyses.length, 2);
});

test("risk-analysis failure does not roll back saved academic records", async () => {
  scenario = createScenario({ role: "ACCOUNTS", userId: accountId });
  mock.method(RiskFlag, "findOneAndUpdate", async () => {
    throw new Error("Simulated risk analysis failure");
  });

  const { response, body } = await send(
    "POST",
    "/attendance",
    accountId,
    { studentId, date: "2026-11-06", status: "PRESENT" }
  );

  assert.equal(response.status, 201);
  assert.equal(scenario.attendance.length, 1);
  assert.equal(body.data.riskAnalysis.failures.length, 1);
});
