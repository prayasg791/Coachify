import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import Batch from "../src/models/Batch.js";
import Centre from "../src/models/Centre.js";
import Refund from "../src/models/Refund.js";
import Student from "../src/models/Student.js";
import User from "../src/models/User.js";
import refundRoutes from "../src/routes/refund.routes.js";

const secret = "refund-queue-test-secret";
const accountsId = "650000000000000000000001";
const parentId = "650000000000000000000002";
const centreId = "650000000000000000000003";
const otherCentreId = "650000000000000000000004";
const refundId = "650000000000000000000005";
const studentId = "650000000000000000000006";

let server;
let endpoint;
let scenario;
let previousJwtSecret;

const reset = ({ role = "ACCOUNTS", centres = [centreId] } = {}) => {
  scenario = {
    user: { _id: role === "PARENT" ? parentId : accountsId, role, centres, isActive: true },
    pipeline: null,
    refunds: [{
      id: refundId,
      status: "PENDING",
      totalPaidPaise: 100000,
      eligibleAmountPaise: 80000,
      refundAmountPaise: 40100,
      withdrawalDate: new Date("2026-07-02T00:00:00.000Z"),
      createdAt: new Date("2026-11-06T00:00:00.000Z"),
      processedAt: null,
      student: { id: studentId, studentId: "STU-001", name: "Refund Test Student" },
      centre: { id: centreId, name: "North Centre" },
      batch: { id: "650000000000000000000007", name: "JEE Morning" },
    }],
    totalRecords: 1,
  };
};

const tokenFor = (userId) => `Bearer ${jwt.sign({ sub: userId }, secret)}`;
const request = async (path = "", { token = tokenFor(scenario.user._id) } = {}) => {
  const response = await fetch(`${endpoint}${path}`, {
    headers: token ? { Authorization: token } : {},
  });
  return { response, body: await response.json() };
};

before(async () => {
  previousJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  mock.method(User, "findById", (id) => ({ select: async () => ({ ...scenario.user, _id: id }) }));
  mock.method(Refund, "aggregate", (pipeline) => {
    scenario.pipeline = pipeline;
    return { allowDiskUse: async () => [{
      refunds: scenario.refunds,
      metadata: scenario.totalRecords ? [{ totalRecords: scenario.totalRecords }] : [],
    }] };
  });

  const app = express();
  app.use("/api/refunds", refundRoutes);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  endpoint = `http://127.0.0.1:${server.address().port}/api/refunds`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  mock.restoreAll();
  if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousJwtSecret;
});

test("Accounts refund queue requires authentication and ACCOUNTS role", async () => {
  reset();
  assert.equal((await request("", { token: null })).response.status, 401);
  reset({ role: "PARENT" });
  assert.equal((await request()).response.status, 403);
  reset({ role: "COUNSELLOR" });
  assert.equal((await request()).response.status, 403);
});

test("queue returns requested refund and student detail fields without unrelated data", async () => {
  reset();
  const { response, body } = await request();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.refunds[0].student.name, "Refund Test Student");
  assert.equal(body.data.refunds[0].centre.name, "North Centre");
  assert.equal(body.data.refunds[0].batch.name, "JEE Morning");
  assert.equal(body.data.refunds[0].refundAmountPaise, 40100);
  assert.equal(JSON.stringify(body).includes("parent"), false);
  assert.equal(JSON.stringify(body).includes("phone"), false);
  assert.equal(JSON.stringify(body).includes("password"), false);
});

test("queue is centre-scoped and rejects unassigned centre filters", async () => {
  reset({ centres: [centreId] });
  await request();
  const centreMatch = scenario.pipeline.find((stage) => stage.$match?.["studentDoc.centre"]);
  assert.deepEqual(centreMatch.$match["studentDoc.centre"].$in.map(String), [centreId]);
  const joinedCollections = scenario.pipeline.filter((stage) => stage.$lookup).map((stage) => stage.$lookup.from);
  assert.deepEqual(joinedCollections, [Student.collection.name, Centre.collection.name, Batch.collection.name]);

  reset({ centres: [centreId] });
  const { response, body } = await request(`?centreId=${otherCentreId}`);
  assert.equal(response.status, 403);
  assert.equal(body.message, "You cannot access this centre");
  assert.equal(scenario.pipeline, null);
});

test("status, centre, escaped student search, and pagination filters are applied", async () => {
  reset({ centres: [centreId, otherCentreId] });
  scenario.totalRecords = 27;
  const { response, body } = await request(`?status=PENDING&centreId=${centreId}&search=Refund%20Test&page=2&limit=10`);
  assert.equal(response.status, 200);
  assert.deepEqual(body.data.pagination, { currentPage: 2, pageSize: 10, totalRecords: 27, totalPages: 3 });
  assert.equal(scenario.pipeline[0].$match.status, "PENDING");
  const scopedCentre = scenario.pipeline.find((stage) => stage.$match?.["studentDoc.centre"]);
  assert.deepEqual(scopedCentre.$match["studentDoc.centre"].$in.map(String), [centreId]);
  const search = scenario.pipeline.find((stage) => stage.$match?.$or).$match.$or;
  assert.equal(search.length, 2);
  assert.equal(search[0]["studentDoc.name"].test("Refund Test Student"), true);
  assert.equal(search[1]["studentDoc.studentId"].source, search[0]["studentDoc.name"].source);
  const facet = scenario.pipeline.at(-1).$facet;
  assert.deepEqual(scenario.pipeline[1], { $sort: { createdAt: -1, _id: -1 } });
  assert.deepEqual(facet.refunds, [{ $skip: 10 }, { $limit: 10 }]);
});

test("unfiltered out-of-range centre and empty queue return valid empty pagination", async () => {
  reset({ centres: [] });
  const { response, body } = await request("?page=3&limit=5");
  assert.equal(response.status, 200);
  assert.deepEqual(body.data.refunds, []);
  assert.deepEqual(body.data.pagination, { currentPage: 3, pageSize: 5, totalRecords: 0, totalPages: 0 });
  assert.equal(scenario.pipeline, null);

  reset();
  scenario.refunds = [];
  scenario.totalRecords = 0;
  const empty = await request();
  assert.equal(empty.response.status, 200);
  assert.deepEqual(empty.body.data.refunds, []);
});

test("invalid filters and pagination are rejected", async () => {
  reset();
  for (const path of [
    "?status=UNKNOWN",
    "?centreId=invalid",
    "?page=0",
    "?page=9999999999999999",
    "?limit=101",
    "?search%5Bvalue%5D=student",
    "?unknown=1",
  ]) {
    assert.equal((await request(path)).response.status, 400, path);
  }
});
