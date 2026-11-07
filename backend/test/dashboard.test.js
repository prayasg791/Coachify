import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import Batch from "../src/models/Batch.js";
import FeePlan from "../src/models/FeePlan.js";
import User from "../src/models/User.js";
import dashboardRoutes from "../src/routes/dashboard.routes.js";

const secret = "accounts-dashboard-test-secret";
const accountsId = "650000000000000000000001";
const parentId = "650000000000000000000002";
const centreId = "650000000000000000000003";
const otherCentreId = "650000000000000000000004";
const batchId = "650000000000000000000005";

let server;
let endpoint;
let scenario;
let previousJwtSecret;

const summary = () => [{
  financialSummary: [{
    totalBilledPaise: 30000,
    totalCollectedPaise: 10000,
    totalOutstandingPaise: 20000,
    totalOverduePaise: 5000,
    collectionPercentage: 33.33,
    ageing0To30Paise: 1000,
    ageing31To60Paise: 2000,
    ageing60PlusPaise: 2000,
  }],
  centreCollection: [{
    centreId,
    centreName: "Central",
    totalBilledPaise: 30000,
    totalCollectedPaise: 10000,
    outstandingPaise: 20000,
    overduePaise: 5000,
  }],
  batchOutstanding: [{
    batchId,
    batchName: "JEE Morning",
    course: "JEE",
    totalStudents: 2,
    totalBilledPaise: 30000,
    totalCollectedPaise: 10000,
    outstandingPaise: 20000,
    overduePaise: 5000,
  }],
}];

const authenticateRequest = (userId) => ({
  Authorization: `Bearer ${jwt.sign({ sub: userId }, secret)}`,
});

const getDashboard = async (userId, queryString = "") => {
  const response = await fetch(`${endpoint}${queryString}`, {
    headers: authenticateRequest(userId),
  });
  return { response, body: await response.json() };
};

const containsExpression = (value, matcher) => {
  if (matcher(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsExpression(item, matcher));
  }
  if (value && typeof value === "object") {
    return Object.values(value).some((item) =>
      containsExpression(item, matcher)
    );
  }
  return false;
};

before(async () => {
  previousJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;

  mock.method(User, "findById", (id) => ({
    select: async () => ({ ...scenario.user, _id: id }),
  }));
  mock.method(Batch, "findById", (id) => ({
    select: async () => scenario.batch
      ? { ...scenario.batch, _id: id }
      : null,
  }));
  mock.method(FeePlan, "aggregate", (pipeline) => {
    scenario.pipeline = pipeline;
    return {
      allowDiskUse() {
        return this;
      },
      then(resolve, reject) {
        return Promise.resolve(scenario.aggregateOutput).then(resolve, reject);
      },
    };
  });

  const app = express();
  app.use("/api/dashboard", dashboardRoutes);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  endpoint = `http://127.0.0.1:${server.address().port}/api/dashboard/accounts`;
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

const reset = (userId = accountsId, role = "ACCOUNTS") => {
  scenario = {
    user: {
      _id: userId,
      role,
      centres: [centreId],
      isActive: true,
    },
    batch: { _id: batchId, centre: centreId },
    aggregateOutput: summary(),
    pipeline: null,
  };
};

test("dashboard returns billed totals from fee-plan aggregate", async () => {
  reset();

  const { response, body } = await getDashboard(accountsId);

  assert.equal(response.status, 200);
  assert.equal(body.data.financialSummary.totalBilledPaise, 30000);
  assert.equal(body.data.financialSummary.totalOutstandingPaise, 20000);
  assert.equal(body.data.financialSummary.collectionPercentage, 33.33);
});

test("dashboard aggregation counts successful payments only", async () => {
  reset();

  const { body } = await getDashboard(accountsId);
  const successMatch = containsExpression(
    scenario.pipeline,
    (value) => Array.isArray(value) &&
      value.length === 2 &&
      value[0] === "$status" &&
      value[1] === "SUCCESS"
  );

  assert.equal(body.data.financialSummary.totalCollectedPaise, 10000);
  assert.equal(successMatch, true);
});

test("dashboard reports partial-payment balances", async () => {
  reset();

  const { body } = await getDashboard(accountsId);

  assert.equal(body.data.financialSummary.totalBilledPaise, 30000);
  assert.equal(body.data.financialSummary.totalCollectedPaise, 10000);
  assert.equal(body.data.financialSummary.totalOutstandingPaise, 20000);
});

test("pending and failed payments are excluded by the aggregation", async () => {
  reset();

  await getDashboard(accountsId);

  const serializedPipeline = JSON.stringify(scenario.pipeline);
  assert.equal(serializedPipeline.includes('"FAILED"'), false);
  assert.equal(serializedPipeline.includes('"PENDING"'), false);
  assert.equal(serializedPipeline.includes('"SUCCESS"'), true);
});

test("overdue total uses only unpaid balances on overdue instalments", async () => {
  reset();

  const { body } = await getDashboard(accountsId);
  const usesOutstandingAndDaysOverdue = containsExpression(
    scenario.pipeline,
    (value) => value?.$gt?.[0] === "$$instalment.daysOverdue"
  ) && JSON.stringify(scenario.pipeline).includes("$$instalment.outstandingPaise");

  assert.equal(body.data.financialSummary.totalOverduePaise, 5000);
  assert.equal(usesOutstandingAndDaysOverdue, true);
});

test("ageing buckets have the required 30 and 60 day boundaries", async () => {
  reset();

  const { body } = await getDashboard(accountsId);

  assert.deepEqual(body.data.ageingAnalysis, {
    "0To30DaysPaise": 1000,
    "31To60DaysPaise": 2000,
    "60PlusDaysPaise": 2000,
  });
  const serialized = JSON.stringify(scenario.pipeline);
  assert.equal(serialized.includes('"$lte":["$$instalment.daysOverdue",30]'), true);
  assert.equal(serialized.includes('"$lte":["$$instalment.daysOverdue",60]'), true);
});

test("dashboard returns centre-wise collection groups", async () => {
  reset();

  const { body } = await getDashboard(accountsId);

  assert.equal(body.data.centreWiseCollection.length, 1);
  assert.equal(body.data.centreWiseCollection[0].centreName, "Central");
  assert.equal(body.data.centreWiseCollection[0].outstandingPaise, 20000);
});

test("dashboard returns batch-wise outstanding and student count", async () => {
  reset();

  const { body } = await getDashboard(accountsId);

  assert.equal(body.data.batchWiseOutstanding[0].batchName, "JEE Morning");
  assert.equal(body.data.batchWiseOutstanding[0].course, "JEE");
  assert.equal(body.data.batchWiseOutstanding[0].totalStudents, 2);
});

test("centre filter restricts aggregation to the requested assigned centre", async () => {
  reset();

  const { response, body } = await getDashboard(
    accountsId,
    `?centreId=${centreId}`
  );
  const studentMatch = scenario.pipeline.find(
    (stage) => stage.$match?.["studentDoc.centre"]
  ).$match;

  assert.equal(response.status, 200);
  assert.equal(body.data.appliedFilters.centreId, centreId);
  assert.equal(
    studentMatch["studentDoc.centre"].$in[0].toString(),
    centreId
  );
});

test("batch filter is validated and included in aggregation", async () => {
  reset();

  const { response, body } = await getDashboard(
    accountsId,
    `?batchId=${batchId}`
  );

  assert.equal(response.status, 200);
  assert.equal(body.data.appliedFilters.batchId, batchId);
  assert.equal(
    scenario.pipeline.find(
      (stage) => stage.$match?.["studentDoc.batch"]
    ).$match["studentDoc.batch"].toString(),
    batchId
  );
});

test("date filters apply inclusively to fee-plan creation dates", async () => {
  reset();

  const { response, body } = await getDashboard(
    accountsId,
    "?startDate=2026-01-02&endDate=2026-01-31"
  );
  const planMatch = scenario.pipeline[0].$match;

  assert.equal(response.status, 200);
  assert.equal(body.data.appliedFilters.dateFilterField, "FeePlan.createdAt");
  assert.equal(planMatch.createdAt.$gte.toISOString(), "2026-01-02T00:00:00.000Z");
  assert.equal(planMatch.createdAt.$lt.toISOString(), "2026-02-01T00:00:00.000Z");
});

test("unauthorized centre filter is forbidden", async () => {
  reset();

  const { response, body } = await getDashboard(
    accountsId,
    `?centreId=${otherCentreId}`
  );

  assert.equal(response.status, 403);
  assert.equal(body.success, false);
  assert.equal(scenario.pipeline, null);
});

test("non-accounts users are denied access", async () => {
  reset(parentId, "PARENT");

  const { response, body } = await getDashboard(parentId);

  assert.equal(response.status, 403);
  assert.equal(body.success, false);
  assert.equal(scenario.pipeline, null);
});

test("students without payments are represented as zero collection", async () => {
  reset();
  scenario.aggregateOutput = [{
    financialSummary: [{
      totalBilledPaise: 12000,
      totalCollectedPaise: 0,
      totalOutstandingPaise: 12000,
      totalOverduePaise: 0,
      collectionPercentage: 0,
      ageing0To30Paise: 0,
      ageing31To60Paise: 0,
      ageing60PlusPaise: 0,
    }],
    centreCollection: [],
    batchOutstanding: [],
  }];

  const { body } = await getDashboard(accountsId);

  assert.equal(body.data.financialSummary.totalCollectedPaise, 0);
  assert.equal(body.data.financialSummary.totalOutstandingPaise, 12000);
});

test("dashboard clamps negative outstanding balances to zero", async () => {
  reset();
  scenario.aggregateOutput[0].financialSummary[0].totalCollectedPaise = 40000;
  scenario.aggregateOutput[0].financialSummary[0].totalOutstandingPaise = 0;
  scenario.aggregateOutput[0].centreCollection[0].outstandingPaise = 0;
  scenario.aggregateOutput[0].batchOutstanding[0].outstandingPaise = 0;

  const { body } = await getDashboard(accountsId);

  assert.equal(body.data.financialSummary.totalOutstandingPaise, 0);
  assert.equal(body.data.centreWiseCollection[0].outstandingPaise, 0);
  assert.equal(body.data.batchWiseOutstanding[0].outstandingPaise, 0);
  assert.equal(JSON.stringify(scenario.pipeline).includes('"$max"'), true);
});

test("invalid centre, batch, and date filters are rejected", async () => {
  reset();
  const invalidCentre = await getDashboard(accountsId, "?centreId=invalid");
  const invalidBatch = await getDashboard(accountsId, "?batchId=invalid");
  const invalidDate = await getDashboard(accountsId, "?startDate=2026-02-31");

  assert.equal(invalidCentre.response.status, 400);
  assert.equal(invalidBatch.response.status, 400);
  assert.equal(invalidDate.response.status, 400);
});
