import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import AuditLog from "../src/models/AuditLog.js";
import RiskFlag from "../src/models/RiskFlag.js";
import User from "../src/models/User.js";
import authRoutes from "../src/routes/auth.routes.js";
import riskRoutes from "../src/routes/risk.routes.js";

const secret = "risk-management-test-secret";
const accountId = "650000000000000000000001";
const counsellorId = "650000000000000000000002";
const otherCounsellorId = "650000000000000000000003";
const parentId = "650000000000000000000004";
const centreId = "650000000000000000000005";
const otherCentreId = "650000000000000000000006";
const studentId = "650000000000000000000007";
const flagId = "650000000000000000000008";

let server;
let endpoint;
let scenario;
let passwordHash;
let previousJwtSecret;

const buildUser = (id, role, centres = [centreId], extra = {}) => ({
  _id: id,
  name: `${role} user`,
  email: `${role.toLowerCase()}@coachify.test`,
  password: passwordHash,
  role,
  centres,
  isActive: true,
  ...extra,
});

const buildFlag = (overrides = {}) => ({
  _id: flagId,
  student: {
    _id: studentId,
    centre: centreId,
  },
  riskLevel: "HIGH",
  followUpRequired: true,
  confidence: null,
  reasons: ["Low attendance", "An overdue fee instalment"],
  signals: {
    attendancePercentage: 60,
    missedInstalments: 1,
    testScoreTrend: "STABLE",
  },
  status: "OPEN",
  assignedTo: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewNotes: "",
  analysisSource: "RULES_FALLBACK",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

const tokenFor = (id) => jwt.sign({ sub: id }, secret);

const send = async (method, path, { userId, token, body, query = "" } = {}) => {
  const response = await fetch(`${endpoint}${path}${query}`, {
    method,
    headers: {
      ...(token || userId ? { Authorization: `Bearer ${token ?? tokenFor(userId)}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { response, body: await response.json() };
};

const containsValue = (value, matcher) => {
  if (matcher(value)) return true;
  if (Array.isArray(value)) return value.some((item) => containsValue(item, matcher));
  if (value && typeof value === "object") {
    return Object.values(value).some((item) => containsValue(item, matcher));
  }
  return false;
};

const reset = () => {
  const account = buildUser(accountId, "ACCOUNTS");
  const counsellor = buildUser(counsellorId, "COUNSELLOR");
  const otherCounsellor = buildUser(otherCounsellorId, "COUNSELLOR", [otherCentreId], {
    email: "other@coachify.test",
  });
  const parent = buildUser(parentId, "PARENT");
  scenario = {
    users: [account, counsellor, otherCounsellor, parent],
    flag: buildFlag(),
    aggregateOutput: [],
    aggregatePipeline: null,
    findFilter: null,
    countFilter: null,
    auditLogs: [],
  };
};

before(async () => {
  previousJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  passwordHash = await bcrypt.hash("safe-test-password", 4);
  reset();

  mock.method(User, "findById", (id) => ({
    select: async () => {
      const user = scenario.users.find((item) => item._id.toString() === id.toString());
      if (!user) return null;
      const { password: _password, ...safeUser } = user;
      return safeUser;
    },
  }));
  mock.method(User, "findOne", (query) => ({
    select: async () => scenario.users.find((user) =>
      (!query._id || user._id.toString() === query._id.toString()) &&
      user.role === query.role &&
      user.isActive === query.isActive &&
      (!query.email || user.email === query.email),
    ) ?? null,
  }));
  mock.method(User, "find", (query) => {
    scenario.counsellorFilter = query;
    const matchingUsers = scenario.users.filter((user) =>
      user.role === query.role &&
      user.isActive === query.isActive &&
      query.centres.$in.some((centreId) =>
        user.centres.some((userCentreId) => userCentreId.toString() === centreId.toString()),
      ),
    );
    const request = {
      select() {
        return this;
      },
      sort() {
        return this;
      },
      lean() {
        return Promise.resolve(matchingUsers);
      },
    };
    return request;
  });
  mock.method(RiskFlag, "aggregate", async (pipeline) => {
    scenario.aggregatePipeline = pipeline;
    return scenario.aggregateOutput;
  });
  mock.method(RiskFlag, "findOne", (filter) => {
    const query = {
      select() {
        return this;
      },
      populate() {
        return this;
      },
      then(resolve, reject) {
        const flag = scenario.flag;
        const matches = flag?._id.toString() === filter._id?.toString() &&
          flag.status === filter.status &&
          flag.followUpRequired === filter.followUpRequired;
        return Promise.resolve(matches ? flag : null).then(resolve, reject);
      },
    };
    return query;
  });
  mock.method(RiskFlag, "findOneAndUpdate", async (filter, update) => {
    const flag = scenario.flag;
    const statuses = filter.status?.$in ?? [filter.status];
    if (!flag ||
        flag._id.toString() !== filter._id?.toString() ||
        (filter.assignedTo && flag.assignedTo?.toString() !== filter.assignedTo.toString()) ||
        (filter.followUpRequired !== undefined && flag.followUpRequired !== filter.followUpRequired) ||
        (filter.status && !statuses.includes(flag.status))) {
      return null;
    }
    Object.assign(flag, update.$set);
    return flag;
  });
  mock.method(RiskFlag, "countDocuments", async (filter) => {
    scenario.countFilter = filter;
    return scenario.taskRecords?.length ?? 0;
  });
  mock.method(RiskFlag, "find", (filter) => {
    scenario.findFilter = filter;
    const query = {
      select() {
        return this;
      },
      populate() {
        return this;
      },
      sort() {
        return this;
      },
      skip() {
        return this;
      },
      limit() {
        return this;
      },
      lean() {
        return Promise.resolve(scenario.taskRecords ?? []);
      },
    };
    return query;
  });
  mock.method(AuditLog, "create", async (entry) => {
    scenario.auditLogs.push(...(Array.isArray(entry) ? entry : [entry]));
    return entry;
  });
  mock.method(mongoose, "startSession", async () => ({
    withTransaction: async (operation) => operation(),
    endSession: async () => {},
  }));

  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  app.use("/api/risk", riskRoutes);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  endpoint = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  mock.restoreAll();
  if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousJwtSecret;
});

test("counsellor login returns a signed token and excludes password hashes", async () => {
  reset();
  const { response, body } = await send("POST", "/auth/counsellor/login", {
    body: { email: "COUNSELLOR@coachify.test", password: "safe-test-password" },
  });

  assert.equal(response.status, 200);
  assert.equal(body.user.role, "COUNSELLOR");
  assert.equal(body.user.email, "counsellor@coachify.test");
  assert.equal("password" in body.user, false);
  assert.equal(jwt.verify(body.accessToken, secret).sub, counsellorId);
});

test("counsellor login rejects an incorrect password", async () => {
  reset();
  const { response, body } = await send("POST", "/auth/counsellor/login", {
    body: { email: "counsellor@coachify.test", password: "incorrect" },
  });
  assert.equal(response.status, 401);
  assert.equal(body.message, "Invalid email or password");
});

test("counsellor login rejects inactive and wrong-role users", async () => {
  reset();
  scenario.users.find((user) => user._id === counsellorId).isActive = false;
  let result = await send("POST", "/auth/counsellor/login", {
    body: { email: "counsellor@coachify.test", password: "safe-test-password" },
  });
  assert.equal(result.response.status, 401);

  reset();
  result = await send("POST", "/auth/counsellor/login", {
    body: { email: "accounts@coachify.test", password: "safe-test-password" },
  });
  assert.equal(result.response.status, 401);
});

test("accounts login continues to use the accounts role and response contract", async () => {
  reset();
  const { response, body } = await send("POST", "/auth/accounts/login", {
    body: { email: "ACCOUNTS@coachify.test", password: "safe-test-password" },
  });
  assert.equal(response.status, 200);
  assert.equal(body.user.role, "ACCOUNTS");
  assert.deepEqual(body.user.centres.map(String), [centreId]);
});

test("risk flags require authentication and Accounts role", async () => {
  reset();
  assert.equal((await send("GET", "/risk/flags")).response.status, 401);
  assert.equal((await send("GET", "/risk/flags", { userId: parentId })).response.status, 403);
});

test("risk flag listing filters by centre, level and status with pagination", async () => {
  reset();
  scenario.aggregateOutput = [{
    metadata: [{ totalRecords: 1 }],
    flags: [{
      ...scenario.flag,
      assignedTo: { _id: counsellorId, name: "Assigned counsellor" },
      studentDoc: {
        _id: studentId,
        studentId: "STU-001",
        name: "Student One",
      },
      centreDoc: { _id: centreId, name: "North", code: "N" },
      batchDoc: { _id: "650000000000000000000009", name: "Batch 1", course: "JEE", academicYear: "2026-27" },
      assignedUser: { _id: counsellorId, name: "Assigned counsellor" },
    }],
  }];

  const { response, body } = await send("GET", "/risk/flags", {
    userId: accountId,
    query: `?centreId=${centreId}&riskLevel=HIGH&status=OPEN&page=2&limit=5`,
  });
  assert.equal(response.status, 200);
  assert.equal(body.data.flags[0].student.name, "Student One");
  assert.equal(body.data.flags[0].signals.missedInstalments, 1);
  assert.equal("phone" in body.data.flags[0].student, false);
  assert.deepEqual(body.data.pagination, {
    currentPage: 2,
    pageSize: 5,
    totalRecords: 1,
    totalPages: 1,
  });
  assert.equal(
    containsValue(scenario.aggregatePipeline, (item) =>
      item?.["studentDoc.centre"]?.toString() === centreId,
    ),
    true,
  );
});

test("Accounts risk listing rejects unauthorized centre filters and invalid query values", async () => {
  reset();
  let result = await send("GET", "/risk/flags", {
    userId: accountId,
    query: `?centreId=${otherCentreId}`,
  });
  assert.equal(result.response.status, 403);

  result = await send("GET", "/risk/flags", {
    userId: accountId,
    query: "?riskLevel=CRITICAL&page=0",
  });
  assert.equal(result.response.status, 400);
});

test("Accounts can list only active counsellors assigned to accessible centres", async () => {
  reset();
  let result = await send("GET", "/risk/counsellors", { userId: accountId });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.data.counsellors.map((item) => item.id), [counsellorId]);
  assert.equal("email" in result.body.data.counsellors[0], false);

  result = await send("GET", "/risk/counsellors", {
    userId: accountId,
    query: `?centreId=${otherCentreId}`,
  });
  assert.equal(result.response.status, 403);
});

test("Accounts can assign an open task only within authorized counsellor centres and audit it", async () => {
  reset();
  const { response, body } = await send("POST", `/risk/flags/${flagId}/assignment`, {
    userId: accountId,
    body: { counsellorId },
  });
  assert.equal(response.status, 200);
  assert.equal(body.data.assignedTo.toString(), counsellorId);
  assert.equal(scenario.auditLogs.length, 1);
  assert.equal(scenario.auditLogs[0].action, "RISK_TASK_ASSIGNED");

  reset();
  const crossCentre = await send("POST", `/risk/flags/${flagId}/assignment`, {
    userId: accountId,
    body: { counsellorId: otherCounsellorId },
  });
  assert.equal(crossCentre.response.status, 400);
  assert.equal(scenario.auditLogs.length, 0);
});

test("Accounts cannot assign tasks for a student outside their centres", async () => {
  reset();
  scenario.flag.student.centre = otherCentreId;
  const { response } = await send("POST", `/risk/flags/${flagId}/assignment`, {
    userId: accountId,
    body: { counsellorId },
  });
  assert.equal(response.status, 403);
});

test("Counsellor tasks are authenticated, role restricted and scoped to the logged-in counsellor", async () => {
  reset();
  assert.equal((await send("GET", "/risk/tasks")).response.status, 401);
  assert.equal((await send("GET", "/risk/tasks", { userId: accountId })).response.status, 403);
  scenario.taskRecords = [{
    ...scenario.flag,
    assignedTo: counsellorId,
    student: {
      _id: studentId,
      studentId: "STU-001",
      name: "Student One",
      centre: { _id: centreId, name: "North", code: "N" },
      batch: { _id: "650000000000000000000009", name: "Batch 1", course: "JEE", academicYear: "2026-27" },
    },
  }];
  const { response, body } = await send("GET", "/risk/tasks", {
    userId: counsellorId,
    query: "?page=1&limit=10",
  });
  assert.equal(response.status, 200);
  assert.equal(body.data.tasks[0].signals.attendancePercentage, 60);
  assert.equal(body.data.tasks[0].student.batch.name, "Batch 1");
  assert.equal(scenario.findFilter.assignedTo.toString(), counsellorId);
  assert.deepEqual(scenario.findFilter.status.$in, ["OPEN", "REVIEWED"]);
});

test("counsellors can review an assigned task and the action is audited", async () => {
  reset();
  scenario.flag.assignedTo = counsellorId;
  const { response, body } = await send("PATCH", `/risk/tasks/${flagId}/review`, {
    userId: counsellorId,
    body: { outcome: "REVIEWED", reviewNotes: "Discussed attendance plan." },
  });
  assert.equal(response.status, 200);
  assert.equal(body.data.status, "REVIEWED");
  assert.equal(scenario.flag.followUpRequired, true);
  assert.equal(scenario.flag.reviewedBy.toString(), counsellorId);
  assert.equal(scenario.auditLogs[0].action, "RISK_TASK_REVIEWED");
});

test("false-positive decisions require notes and stop further follow-up", async () => {
  reset();
  scenario.flag.assignedTo = counsellorId;
  let result = await send("PATCH", `/risk/tasks/${flagId}/review`, {
    userId: counsellorId,
    body: { outcome: "FALSE_POSITIVE" },
  });
  assert.equal(result.response.status, 400);
  assert.equal(scenario.auditLogs.length, 0);

  result = await send("PATCH", `/risk/tasks/${flagId}/review`, {
    userId: counsellorId,
    body: { outcome: "FALSE_POSITIVE", reviewNotes: "Verified data was duplicated." },
  });
  assert.equal(result.response.status, 200);
  assert.equal(scenario.flag.status, "FALSE_POSITIVE");
  assert.equal(scenario.flag.followUpRequired, false);
  assert.equal(scenario.auditLogs[0].details.reviewNotes, "Verified data was duplicated.");
});

test("counsellors can resolve a reviewed task after follow-up", async () => {
  reset();
  scenario.flag.assignedTo = counsellorId;
  scenario.flag.status = "REVIEWED";
  scenario.flag.reviewNotes = "Contact attempt logged.";
  const { response, body } = await send("PATCH", `/risk/tasks/${flagId}/review`, {
    userId: counsellorId,
    body: { outcome: "RESOLVED", reviewNotes: "Follow-up completed." },
  });
  assert.equal(response.status, 200);
  assert.equal(body.data.status, "RESOLVED");
  assert.equal(scenario.flag.followUpRequired, false);
  assert.equal(scenario.auditLogs.length, 1);
});

test("counsellors cannot review another counsellor's task or make invalid transitions", async () => {
  reset();
  scenario.flag.assignedTo = otherCounsellorId;
  let result = await send("PATCH", `/risk/tasks/${flagId}/review`, {
    userId: counsellorId,
    body: { outcome: "REVIEWED" },
  });
  assert.equal(result.response.status, 404);
  assert.equal(scenario.auditLogs.length, 0);

  reset();
  scenario.flag.assignedTo = counsellorId;
  scenario.flag.status = "RESOLVED";
  scenario.flag.followUpRequired = false;
  result = await send("PATCH", `/risk/tasks/${flagId}/review`, {
    userId: counsellorId,
    body: { outcome: "REVIEWED" },
  });
  assert.equal(result.response.status, 404);
});

test("counsellors must review a task before resolving it", async () => {
  reset();
  scenario.flag.assignedTo = counsellorId;
  const { response } = await send("PATCH", `/risk/tasks/${flagId}/review`, {
    userId: counsellorId,
    body: { outcome: "RESOLVED", reviewNotes: "Follow-up completed." },
  });
  assert.equal(response.status, 404);
  assert.equal(scenario.flag.status, "OPEN");
  assert.equal(scenario.auditLogs.length, 0);
});
