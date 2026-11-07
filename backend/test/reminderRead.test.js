import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import Consent from "../src/models/Consent.js";
import Reminder from "../src/models/Reminder.js";
import Student from "../src/models/Student.js";
import User from "../src/models/User.js";
import reminderRoutes from "../src/routes/reminder.routes.js";

const secret = "reminder-read-test-secret";
const parentId = "650000000000000000000001";
const otherParentId = "650000000000000000000002";
const accountsId = "650000000000000000000003";
const centreId = "650000000000000000000004";
const otherCentreId = "650000000000000000000005";
const studentId = "650000000000000000000006";
const reminderId = "650000000000000000000007";

let server;
let endpoint;
let scenario;
let previousJwtSecret;

const reset = ({
  role = "PARENT",
  userId = parentId,
  centres = [centreId],
  linkedStudentIds = [studentId],
  consentedStudentIds = [studentId],
} = {}) => {
  scenario = {
    user: { _id: userId, role, centres, isActive: true },
    linkedStudentIds,
    consentedStudentIds,
    pipeline: null,
    rows: [{
      id: reminderId,
      type: "BEFORE_3_DAYS",
      language: "ENGLISH",
      message: "Fee payment reminder",
      scheduledAt: new Date("2026-11-10T00:00:00.000Z"),
      sentAt: null,
      status: "SCHEDULED",
      outstandingBalancePaise: 7500,
      student: { id: studentId, name: "Aarav Sharma", studentId: "STU-001" },
      instalment: { id: "650000000000000000000008", number: 2, dueDate: new Date("2026-11-13T00:00:00.000Z") },
    }],
    totalRecords: 1,
  };
};

const bearer = (id) => `Bearer ${jwt.sign({ sub: id }, secret)}`;
const request = async (path, { userId = scenario.user._id, token = bearer(userId) } = {}) => {
  const response = await fetch(`${endpoint}${path}`, { headers: token ? { Authorization: token } : {} });
  return { response, body: await response.json() };
};

before(async () => {
  previousJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  mock.method(User, "findById", (id) => ({ select: async () => ({ ...scenario.user, _id: id }) }));
  mock.method(Student, "distinct", async (_field, filter) => {
    if (filter.parent) {
      scenario.studentParentFilter = filter.parent.toString();
      return scenario.linkedStudentIds;
    }
    return [];
  });
  mock.method(Consent, "distinct", async (_field, filter) => {
    scenario.consentFilter = filter;
    return scenario.consentedStudentIds;
  });
  mock.method(Reminder, "aggregate", (pipeline) => {
    scenario.pipeline = pipeline;
    return { allowDiskUse: async () => [{
      data: scenario.rows,
      metadata: scenario.totalRecords ? [{ totalRecords: scenario.totalRecords }] : [],
    }] };
  });

  const app = express();
  app.use("/api/reminders", reminderRoutes);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  endpoint = `http://127.0.0.1:${server.address().port}/api/reminders`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  mock.restoreAll();
  if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousJwtSecret;
});

test("both reminder endpoints require authentication", async () => {
  reset();
  assert.equal((await request("/parent", { token: null })).response.status, 401);
  assert.equal((await request("/accounts", { token: null })).response.status, 401);
});

test("parent route rejects ACCOUNTS and COUNSELLOR roles", async () => {
  reset({ role: "ACCOUNTS", userId: accountsId });
  assert.equal((await request("/parent")).response.status, 403);
  reset({ role: "COUNSELLOR", userId: accountsId });
  assert.equal((await request("/parent")).response.status, 403);
});

test("accounts route rejects PARENT and COUNSELLOR roles", async () => {
  reset();
  assert.equal((await request("/accounts")).response.status, 403);
  reset({ role: "COUNSELLOR", userId: accountsId });
  assert.equal((await request("/accounts")).response.status, 403);
});

test("parent gets only reminders for linked students with active consent", async () => {
  reset();
  const { response, body } = await request("/parent");
  assert.equal(response.status, 200);
  assert.equal(body.data[0].student.studentId, "STU-001");
  assert.equal(scenario.studentParentFilter, parentId);
  assert.equal(scenario.consentFilter.parent, parentId);
  assert.equal(scenario.consentFilter.status, "GRANTED");
  assert.equal(scenario.consentFilter.purpose, "STUDENT_DATA_PROCESSING");
  assert.deepEqual(scenario.consentFilter.student.$in, [studentId]);
  assert.deepEqual(scenario.pipeline[0].$match.student.$in, [studentId]);
});

test("parent with no consented students receives an empty page without reminder query", async () => {
  reset({ consentedStudentIds: [] });
  const { response, body } = await request("/parent");
  assert.equal(response.status, 200);
  assert.deepEqual(body.data, []);
  assert.equal(body.pagination.totalRecords, 0);
  assert.equal(scenario.pipeline, null);
});

test("parent with consent but no reminders receives an empty page", async () => {
  reset();
  scenario.rows = [];
  scenario.totalRecords = 0;
  const { response, body } = await request("/parent");
  assert.equal(response.status, 200);
  assert.deepEqual(body.data, []);
  assert.deepEqual(body.pagination, { currentPage: 1, pageSize: 20, totalRecords: 0, totalPages: 0 });
});

test("parent identity cannot be supplied as a query filter", async () => {
  reset();
  const { response } = await request(`/parent?parentId=${otherParentId}`);
  assert.equal(response.status, 400);
});

test("accounts aggregate restricts reminders to assigned centres and omits parent data", async () => {
  reset({ role: "ACCOUNTS", userId: accountsId, centres: [centreId] });
  const { response, body } = await request("/accounts");
  assert.equal(response.status, 200);
  assert.equal(JSON.stringify(body).includes("phone"), false);
  assert.equal(JSON.stringify(body).includes("password"), false);
  assert.equal(JSON.stringify(scenario.pipeline).includes("studentDoc.centre"), true);
  assert.equal(JSON.stringify(scenario.pipeline).includes(centreId), true);
});

test("accounts cannot request an unassigned centre", async () => {
  reset({ role: "ACCOUNTS", userId: accountsId, centres: [centreId] });
  const { response, body } = await request(`/accounts?centreId=${otherCentreId}`);
  assert.equal(response.status, 403);
  assert.equal(body.message, "You cannot access this centre");
  assert.equal(scenario.pipeline, null);
});

test("outstanding balance uses successful payments only", async () => {
  reset();
  await request("/parent");
  const paymentLookup = scenario.pipeline.find((stage) => stage.$lookup?.from === "payments").$lookup;
  const paymentFilter = paymentLookup.pipeline[0].$match.$expr.$and;
  assert.deepEqual(paymentFilter[1], { $eq: ["$status", "SUCCESS"] });
  const balanceExpression = scenario.pipeline.find((stage) => stage.$addFields?.outstandingBalancePaise)
    .$addFields.outstandingBalancePaise;
  assert.equal(JSON.stringify(balanceExpression).includes("instalmentDoc.amountPaise"), true);
  assert.equal(JSON.stringify(balanceExpression).includes("paymentSummary.paidPaise"), true);
});

test("status, reminder type, inclusive dates, and pagination are applied", async () => {
  reset({ role: "ACCOUNTS", userId: accountsId });
  scenario.totalRecords = 20;
  const { response, body } = await request("/accounts?status=SENT&type=OVERDUE&startDate=2026-11-01&endDate=2026-11-30&page=2&limit=5");
  assert.equal(response.status, 200);
  assert.deepEqual(body.pagination, { currentPage: 2, pageSize: 5, totalRecords: 20, totalPages: 4 });
  const initialMatch = scenario.pipeline[0].$match;
  assert.equal(initialMatch.status, "SENT");
  assert.equal(initialMatch.type, "OVERDUE");
  assert.equal(initialMatch.scheduledAt.$gte.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(initialMatch.scheduledAt.$lt.toISOString(), "2026-12-01T00:00:00.000Z");
  const facet = scenario.pipeline.at(-1).$facet;
  assert.deepEqual(facet.data.slice(1), [{ $skip: 5 }, { $limit: 5 }]);
});

test("invalid status, centre, dates, pagination, and unknown filters are rejected", async () => {
  reset({ role: "ACCOUNTS", userId: accountsId });
  for (const path of [
    "/accounts?status=DELIVERED",
    "/accounts?type=SMS",
    "/accounts?centreId=invalid",
    "/accounts?startDate=2026-02-30",
    "/accounts?startDate=2026-12-01&endDate=2026-11-01",
    "/accounts?page=0",
    "/accounts?limit=101",
    "/accounts?unexpected=yes",
  ]) {
    assert.equal((await request(path)).response.status, 400, path);
  }
});
