import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import FeePlan from "../src/models/FeePlan.js";
import Instalment from "../src/models/Instalment.js";
import Student from "../src/models/Student.js";
import User from "../src/models/User.js";
import studentRoutes from "../src/routes/student.routes.js";

const secret = "student-directory-test-secret";
const accountId = "650000000000000000000001";
const parentId = "650000000000000000000002";
const centreId = "650000000000000000000003";
const otherCentreId = "650000000000000000000004";
const batchId = "650000000000000000000005";
const firstStudentId = "650000000000000000000006";
const secondStudentId = "650000000000000000000007";
const noPlanStudentId = "650000000000000000000008";

let server;
let endpoint;
let scenario;
let previousJwtSecret;

const query = (value) => ({
  select() {
    return this;
  },
  populate() {
    return this;
  },
  sort() {
    return this;
  },
  skip(value) {
    scenario.skip = value;
    return this;
  },
  limit(value) {
    scenario.limit = value;
    return this;
  },
  lean() {
    return Promise.resolve(value);
  },
});

const createStudent = ({ id, studentId, name, centre = centreId, batch = batchId }) => ({
  _id: id,
  studentId,
  name,
  centre: { _id: centre, name: "Central" },
  batch: { _id: batch, name: "JEE Morning", course: "JEE" },
});

const reset = (role = "ACCOUNTS", userCentres = [centreId]) => {
  scenario = {
    user: {
      _id: accountId,
      role,
      centres: userCentres,
      isActive: true,
    },
    students: [
      createStudent({ id: firstStudentId, studentId: "STU-001", name: "Aarav Sharma" }),
      createStudent({ id: secondStudentId, studentId: "STU-002", name: "Mira Patel" }),
      createStudent({ id: noPlanStudentId, studentId: "STU-003", name: "No Plan Student" }),
    ],
    feePlans: [
      { student: firstStudentId, finalPayablePaise: 1000 },
      { student: secondStudentId, finalPayablePaise: 1000 },
    ],
    paid: [
      { _id: firstStudentId, totalPaidPaise: 400 },
      { _id: secondStudentId, totalPaidPaise: 1000 },
    ],
    studentFilter: null,
    feePlanFilter: null,
    paymentPipeline: null,
    skip: null,
    limit: null,
    totalRecords: 3,
  };
};

const tokenFor = (userId) => jwt.sign({ sub: userId }, secret);

const request = async ({ userId = accountId, token, query: params = "" } = {}) => {
  const headers = token === null
    ? {}
    : { Authorization: `Bearer ${token ?? tokenFor(userId)}` };
  const response = await fetch(`${endpoint}${params}`, { headers });
  return { response, body: await response.json() };
};

before(async () => {
  previousJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;

  mock.method(User, "findById", () => ({
    select: async () => scenario.user,
  }));
  mock.method(Student, "countDocuments", async (filter) => {
    scenario.studentFilter = filter;
    return scenario.totalRecords;
  });
  mock.method(Student, "find", (filter) => {
    scenario.studentFilter = filter;
    return query(scenario.students);
  });
  mock.method(FeePlan, "find", (filter) => {
    scenario.feePlanFilter = filter;
    return query(scenario.feePlans);
  });
  mock.method(Instalment, "aggregate", async (pipeline) => {
    scenario.paymentPipeline = pipeline;
    return scenario.paid;
  });

  const app = express();
  app.use("/api/students", studentRoutes);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  endpoint = `http://127.0.0.1:${server.address().port}/api/students`;
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

test("student directory requires authentication", async () => {
  reset();
  const { response, body } = await request({ token: null });
  assert.equal(response.status, 401);
  assert.equal(body.success, false);
});

test("student directory is restricted to accounts users", async () => {
  reset("PARENT");
  const { response, body } = await request({ userId: parentId });
  assert.equal(response.status, 403);
  assert.equal(body.success, false);
});

test("directory results expose only the requested student and fee fields", async () => {
  reset();
  const { response, body } = await request();

  assert.equal(response.status, 200);
  assert.deepEqual(body.data[0], {
    id: firstStudentId,
    studentId: "STU-001",
    name: "Aarav Sharma",
    centre: { id: centreId, name: "Central" },
    batch: { id: batchId, name: "JEE Morning" },
    course: "JEE",
    paymentStatus: "PARTIALLY_PAID",
    outstandingBalancePaise: 600,
  });
  assert.equal("parent" in body.data[0], false);
  assert.equal("phone" in body.data[0], false);
  assert.equal("password" in body.data[0], false);
});

test("student queries are always scoped to the accounts user's assigned centres", async () => {
  reset("ACCOUNTS", [centreId, otherCentreId]);
  await request();

  assert.deepEqual(
    scenario.studentFilter.centre.$in.map((id) => id.toString()).sort(),
    [centreId, otherCentreId].sort(),
  );
});

test("payment status represents partial, fully paid, and missing fee plans", async () => {
  reset();
  const { body } = await request();

  assert.equal(body.data[0].paymentStatus, "PARTIALLY_PAID");
  assert.equal(body.data[0].outstandingBalancePaise, 600);
  assert.equal(body.data[1].paymentStatus, "PAID");
  assert.equal(body.data[1].outstandingBalancePaise, 0);
  assert.equal(body.data[2].paymentStatus, "NO_FEE_PLAN");
  assert.equal(body.data[2].outstandingBalancePaise, 0);
});

test("payment aggregation includes successful payments only", async () => {
  reset();
  await request();

  const serializedPipeline = JSON.stringify(scenario.paymentPipeline);
  assert.equal(serializedPipeline.includes('"$status","SUCCESS"'), true);
  assert.equal(serializedPipeline.includes('"FAILED"'), false);
  assert.equal(serializedPipeline.includes('"PENDING"'), false);
});

test("name search is case-insensitive and searches the name field", async () => {
  reset();
  await request({ query: "?search=aarav" });

  const pattern = scenario.studentFilter.$or[0].name;
  assert.equal(pattern instanceof RegExp, true);
  assert.equal(pattern.ignoreCase, true);
  assert.equal(pattern.test("Aarav Sharma"), true);
});

test("student ID search is case-insensitive", async () => {
  reset();
  await request({ query: "?search=stu-002" });

  const pattern = scenario.studentFilter.$or[1].studentId;
  assert.equal(pattern.ignoreCase, true);
  assert.equal(pattern.test("STU-002"), true);
});

test("centre and batch filters are applied together", async () => {
  reset();
  const { response } = await request({
    query: `?centreId=${centreId}&batchId=${batchId}`,
  });

  assert.equal(response.status, 200);
  assert.equal(scenario.studentFilter.centre.toString(), centreId);
  assert.equal(scenario.studentFilter.batch.toString(), batchId);
});

test("accounts users cannot filter to an unassigned centre", async () => {
  reset();
  const { response, body } = await request({
    query: `?centreId=${otherCentreId}`,
  });

  assert.equal(response.status, 403);
  assert.equal(body.message, "You cannot access this centre");
});

test("pagination is bounded in Mongo and includes metadata", async () => {
  reset();
  const { response, body } = await request({
    query: "?page=2&limit=1",
  });

  assert.equal(response.status, 200);
  assert.equal(scenario.skip, 1);
  assert.equal(scenario.limit, 1);
  assert.deepEqual(body.pagination, {
    currentPage: 2,
    pageSize: 1,
    totalRecords: 3,
    totalPages: 3,
  });
});

test("invalid filters and pagination are rejected", async () => {
  reset();
  for (const params of [
    "?centreId=invalid",
    "?batchId=invalid",
    "?page=0",
    "?page=1.5",
    "?limit=101",
    "?search%5Bvalue%5D=aarav",
    "?unknown=value",
  ]) {
    const { response, body } = await request({ query: params });
    assert.equal(response.status, 400, params);
    assert.equal(body.success, false, params);
  }
});
