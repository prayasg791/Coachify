import assert from "node:assert/strict";
import { test } from "node:test";
import { validateRuntimeConfig } from "../server.js";

const base = { MONGO_URI: "mongodb+srv://cluster.example/coachify", JWT_SECRET: "x".repeat(40), NODE_ENV: "production", PORT: "5000", CORS_ORIGINS: "https://portal.example" };

test("production startup requires strong JWT and exact HTTPS CORS origins", () => {
  assert.deepEqual(validateRuntimeConfig(base), { nodeEnv: "production", port: 5000, corsOrigins: ["https://portal.example"] });
  assert.throws(() => validateRuntimeConfig({ ...base, JWT_SECRET: "short" }), /JWT_SECRET/);
  assert.throws(() => validateRuntimeConfig({ ...base, CORS_ORIGINS: "*" }), /CORS_ORIGINS/);
  assert.throws(() => validateRuntimeConfig({ ...base, CORS_ORIGINS: "http://portal.example" }), /HTTPS/);
});

test("startup rejects malformed Mongo URI, port, and GST configuration", () => {
  assert.throws(() => validateRuntimeConfig({ ...base, MONGO_URI: "https://not-mongo.example" }), /MONGO_URI/);
  assert.throws(() => validateRuntimeConfig({ ...base, PORT: "70000" }), /PORT/);
  assert.throws(() => validateRuntimeConfig({ ...base, INSTITUTE_GST_TAXABILITY: "TAXABLE", INSTITUTE_GST_RATE_BPS: "", INSTITUTE_GST_TREATMENT: "" }), /Taxable GST/);
  assert.throws(() => validateRuntimeConfig({ ...base, INSTITUTE_NAME: "Institute" }), /configured together/);
});
