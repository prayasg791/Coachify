import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import Consent from "../src/models/Consent.js";
import Student from "../src/models/Student.js";
import User from "../src/models/User.js";
import parentRoutes from "../src/routes/parent.routes.js";

const secret = "parent-students-test-secret";
const parentId = "650000000000000000000002";
const otherParentId = "650000000000000000000009";
const studentOneId = "650000000000000000000006";
const studentTwoId = "650000000000000000000007";
const centreId = "650000000000000000000003";
const batchId = "650000000000000000000005";

let server;
let endpoint;
let scenario;
let previousJwtSecret;

const makeStudent = (id, studentId, name, status = "ACTIVE") => ({
  _id: id,
  studentId,
  name,
  centre: { _id: centreId, name: "Central" },
  batch: { _id: batchId, name: "JEE Morning", course: "JEE", academicYear: "2026-27" },
  status,
  parent: parentId,
  phone: "9999999999",
  password: "secret",
});

const reset = ({ role = "PARENT", students, consentIds } = {}) => {
  scenario = {
    user: { _id: parentId, role, isActive: true },
    students: students ?? [makeStudent(studentOneId, "STU-001", "Aarav Sharma")],
    consentIds: consentIds ?? [studentOneId],
    consentFilter: null,
    studentFilter: null,
    selections: [],
    populations: [],
  };
};

const tokenFor = (sub) => jwt.sign({ sub }, secret);
const request = async ({ token, userId = parentId } = {}) => {
  const headers = token === null
    ? {}
    : { Authorization: `Bearer ${token ?? tokenFor(userId)}` };
  const response = await fetch(endpoint, { headers });
  return { response, body: await response.json() };
};

before(async () => {
  previousJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  mock.method(User, "findById", (id) => ({
    select: async () => ({ ...scenario.user, _id: id }),
  }));
  mock.method(Consent, "find", (filter) => {
    scenario.consentFilter = filter;
    return { select: () => ({ lean: async () => scenario.consentIds.map((student) => ({ student })) }) };
  });
  mock.method(Student, "find", (filter) => {
    scenario.studentFilter = filter;
    const query = {
      select(fields) { scenario.selections.push(fields); return this; },
      populate(spec) { scenario.populations.push(spec); return this; },
      lean() { return Promise.resolve(scenario.students); },
    };
    return query;
  });
  const app = express();
  app.use("/api/parent", parentRoutes);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  endpoint = `http://127.0.0.1:${server.address().port}/api/parent/students`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  mock.restoreAll();
  if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousJwtSecret;
});

test("parent lookup requires a valid authenticated JWT", async () => {
  reset();
  assert.equal((await request({ token: null })).response.status, 401);
  assert.equal((await request({ token: "invalid" })).response.status, 401);
});

test("only PARENT role can use the lookup", async () => {
  reset({ role: "ACCOUNTS" });
  assert.equal((await request()).response.status, 403);
  reset({ role: "COUNSELLOR" });
  assert.equal((await request()).response.status, 403);
});

test("returns one linked child with only frontend fields", async () => {
  reset();
  const { response, body } = await request();
  assert.equal(response.status, 200);
  assert.deepEqual(body.data, [{
    id: studentOneId,
    studentId: "STU-001",
    name: "Aarav Sharma",
    centre: { id: centreId, name: "Central" },
    batch: { id: batchId, name: "JEE Morning" },
    course: "JEE",
    academicYear: "2026-27",
    status: "ACTIVE",
  }]);
  assert.equal(JSON.stringify(body).includes("password"), false);
  assert.equal(JSON.stringify(body).includes("phone"), false);
  assert.equal("parent" in body.data[0], false);
});

test("returns multiple linked children and their statuses", async () => {
  reset({
    students: [
      makeStudent(studentOneId, "STU-001", "Aarav Sharma"),
      makeStudent(studentTwoId, "STU-002", "Mira Patel", "COMPLETED"),
    ],
    consentIds: [studentOneId, studentTwoId],
  });
  const { body } = await request();
  assert.equal(body.data.length, 2);
  assert.equal(body.data[1].status, "COMPLETED");
});

test("withdrawn students are returned with their current status", async () => {
  reset({
    students: [makeStudent(studentOneId, "STU-001", "Aarav Sharma", "WITHDRAWN")],
  });
  const { body } = await request();
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].status, "WITHDRAWN");
});

test("parent with no active consented children gets an empty list", async () => {
  reset({ consentIds: [] });
  const { response, body } = await request();
  assert.equal(response.status, 200);
  assert.deepEqual(body.data, []);
  assert.equal(scenario.studentFilter, null);
});

test("student query is constrained by JWT parent and active consent IDs", async () => {
  reset({
    students: [makeStudent(studentOneId, "STU-001", "Aarav Sharma")],
    consentIds: [studentOneId],
  });
  await request({ userId: otherParentId });
  assert.equal(scenario.consentFilter.parent, otherParentId);
  assert.deepEqual(scenario.studentFilter, {
    _id: { $in: [studentOneId] },
    parent: otherParentId,
  });
});

test("consent query and population are restricted to required fields", async () => {
  reset();
  await request();
  assert.deepEqual(scenario.consentFilter, {
    parent: parentId,
    purpose: "STUDENT_DATA_PROCESSING",
    status: "GRANTED",
  });
  assert.deepEqual(scenario.selections, ["_id studentId name centre batch status"]);
  assert.deepEqual(scenario.populations, [
    { path: "centre", select: "_id name" },
    { path: "batch", select: "_id name course academicYear" },
  ]);
});
