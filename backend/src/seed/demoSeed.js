import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Centre from "../models/Centre.js";
import Batch from "../models/Batch.js";
import Student from "../models/Student.js";
import FeePlan from "../models/FeePlan.js";
import Instalment from "../models/Instalment.js";
import Payment from "../models/Payment.js";
import Attendance from "../models/Attendance.js";
import TestScore from "../models/TestScore.js";
import Consent from "../models/Consent.js";
import RiskFlag from "../models/RiskFlag.js";
import { calculateFeePlan } from "../services/fee/feePlan.service.js";
import { generateInstalments } from "../services/fee/instalment.service.js";
import { recordOfflinePayment } from "../services/payment/paymentApi.service.js";
import { analyzeStudentRisk } from "../services/risk/riskAnalysis.service.js";
import { assignRiskTask, getCounsellorTasks } from "../services/risk/riskTask.service.js";
import { getStudentFeeLedger } from "../services/fee/feeLedger.service.js";
import { getAccountsDashboard } from "../services/dashboard/accountsDashboard.service.js";
import { getStudents } from "../services/student/student.service.js";

dotenv.config();

const DEMO_CENTRES = [
  { name: "Jaipur Central", code: "JPR-CEN", address: "Demo Road, Jaipur" },
  { name: "Jaipur North", code: "JPR-NTH", address: "Demo Avenue, Jaipur" },
  { name: "Jaipur South", code: "JPR-STH", address: "Demo Street, Jaipur" },
  { name: "Jaipur West", code: "JPR-WST", address: "Demo Lane, Jaipur" },
];

const COURSES = ["JEE", "NEET"];
const SHIFTS = ["MORNING", "EVENING"];
// Fixed demo timeline keeps every upsert key and payment scenario stable across reruns.
const DEMO_REFERENCE_DATE = new Date("2026-11-07T12:00:00.000Z");
const DEMO_BATCH_DEFINITIONS = DEMO_CENTRES.flatMap((centre, centreIndex) =>
  COURSES.flatMap((course, courseIndex) => SHIFTS.map((shift, shiftIndex) => ({
    centre,
    centreIndex,
    course,
    courseIndex,
    shift,
    shiftIndex,
    academicYear: course === "JEE" ? (shift === "MORNING" ? "2027" : "2026") : (shift === "MORNING" ? "2026" : "2027"),
  }))),
);
const LEGACY_PARENTS = {
  1: { name: "Demo Parent Aarav", email: "parent.aarav@example.test", phone: "9000000412" },
  2: { name: "Demo Parent Ishita", email: "parent.ishita@example.test", phone: "9000000587" },
  3: { name: "Demo Parent Mohit", email: "parent.mohit@example.test", phone: "9000000219" },
};
const LEGACY_STUDENT_IDS = {
  1: { studentId: "STU-0412", name: "Aarav Meena", course: "JEE", shift: "MORNING", legacyPayment: { transactionId: "DEMO-PAY-STU-0412-001", amountPaise: 3000000 } },
  2: { studentId: "STU-0587", name: "Ishita Sharma", course: "JEE", shift: "EVENING", legacyPayment: { transactionId: "DEMO-PAY-STU-0587-001", amountPaise: 1500000 } },
  3: { studentId: "STU-0219", name: "Mohit Gurjar", course: "NEET", shift: "MORNING" },
};
const FIRST_NAMES = ["Aarav", "Aditi", "Ananya", "Arjun", "Diya", "Ishaan", "Kavya", "Krishna", "Meera", "Neha", "Rohan", "Saanvi"];
const LAST_NAMES = ["Meena", "Sharma", "Gurjar", "Patel", "Singh", "Verma", "Joshi", "Kumari", "Yadav", "Agarwal"];
const DEMO_POLICY_VERSION = "DEMO-SYNTHETIC-NOT-LEGAL-CONSENT";
const databaseNameFromUri = (mongoUri) => {
  const uri = mongoUri?.trim().replace(/^['"]|['"]$/g, "");
  return uri?.match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]+@)?[^/]+\/([^/?#]+)(?:[?#].*)?$/i)?.[1];
};
const isDemoDatabaseName = (databaseName) => typeof databaseName === "string" &&
  /(^|[-_])(dev|development|demo|test)([-_]|$)/i.test(databaseName);

const makeParent = (index) => LEGACY_PARENTS[index] || {
  name: `Demo Parent ${FIRST_NAMES[(index - 4) % FIRST_NAMES.length]}`,
  email: `parent.demo.${String(index).padStart(4, "0")}@example.test`,
  phone: String(9100000000 + index),
};

const makeStudentDefinition = (index) => {
  const legacy = LEGACY_STUDENT_IDS[index];
  const centreIndex = (index - 1) % DEMO_CENTRES.length;
  const course = legacy?.course ?? COURSES[(index - 4) % COURSES.length];
  const shift = legacy?.shift ?? SHIFTS[Math.floor((index - 4) / 2) % SHIFTS.length];
  const profile = (index - 1) % 5;
  const generatedIndex = index - 3;
  const firstName = FIRST_NAMES[(generatedIndex * 7) % FIRST_NAMES.length];
  const lastName = LAST_NAMES[(generatedIndex * 3 + Math.floor(generatedIndex / FIRST_NAMES.length)) % LAST_NAMES.length];

  return {
    index,
    studentId: legacy?.studentId ?? `DEMO-STU-${String(index).padStart(4, "0")}`,
    name: legacy?.name ?? `${firstName} ${lastName}`,
    course,
    shift,
    centreCode: DEMO_CENTRES[centreIndex].code,
    academicYear: course === "JEE" ? (shift === "MORNING" ? "2027" : "2026") : (shift === "MORNING" ? "2026" : "2027"),
    profile,
    parent: makeParent(index),
    legacyPayment: legacy?.legacyPayment ?? null,
    totalCourseFeePaise: index <= 3 ? 6000000 : 4800000 + ((index * 137000) % 2400000),
    discountType: index % 3 === 0 ? "PERCENTAGE" : "FIXED",
    discountValue: index <= 3 ? 0 : index % 3 === 0 ? 5 : 0,
  };
};

const STUDENT_DEFINITIONS = Array.from({ length: 120 }, (_, index) => makeStudentDefinition(index + 1));
const DEMO_ACCOUNTS_EXECUTIVES = DEMO_CENTRES.map((centre, index) => ({
  name: `Coachify Demo Accounts Executive ${centre.code}`,
  email: index === 0 ? "accounts.demo@coachify.test" : `accounts.${centre.code.toLowerCase()}.demo@coachify.test`,
  role: "ACCOUNTS",
  centreCode: centre.code,
}));
const DEMO_ACCOUNTS = DEMO_ACCOUNTS_EXECUTIVES[0];
const DEMO_COUNSELLOR = {
  name: "Coachify Demo Counsellor",
  email: "counsellor.demo@coachify.test",
  phone: "9000000001",
  role: "COUNSELLOR",
};

const validateDemoSeedEnvironment = (environment) => {
  if (environment.NODE_ENV !== "development") throw new Error("Demo seeding requires NODE_ENV=development");
  if (environment.DEMO_SEED_ENABLED !== "true") throw new Error("Set DEMO_SEED_ENABLED=true to confirm demo seeding");
  if (environment.DEMO_OTP_ENABLED !== "true") throw new Error("Set DEMO_OTP_ENABLED=true to enable synthetic parent demo login");
  if (!environment.MONGO_URI) throw new Error("MONGO_URI is required");
  const databaseName = databaseNameFromUri(environment.MONGO_URI);
  if (!isDemoDatabaseName(databaseName)) {
    throw new Error("MONGO_URI must select a database whose name includes dev, development, demo, or test");
  }
  for (const variable of ["DEMO_ACCOUNTS_PASSWORD", "DEMO_COUNSELLOR_PASSWORD", "DEMO_PARENT_PASSWORD"]) {
    if (!environment[variable]) throw new Error(`${variable} is required`);
  }
  const configuredPhones = new Set((environment.DEMO_PARENT_PHONES || "").split(",").map((phone) => phone.replace(/\D/g, "")).filter(Boolean));
  const missingPhone = STUDENT_DEFINITIONS.find((student) => !configuredPhones.has(student.parent.phone));
  if (missingPhone) throw new Error("DEMO_PARENT_PHONES must include every synthetic parent account before seeding");
};

const upsertUser = async ({ identity, fields, password }) => {
  let user = await User.findOne(identity).select("+password");
  let createdUser = false;
  if (!user) {
    try {
      user = await User.create({ ...identity, ...fields, password });
      createdUser = true;
    } catch (error) {
      if (error.code !== 11000) throw error;
      user = await User.findOne(identity).select("+password");
    }
  }
  if (!user) throw new Error("Unable to create a synthetic demo user");
  Object.assign(user, fields);
  if (password && !createdUser && (!user.password || !(await bcrypt.compare(password, user.password)))) user.password = password;
  await user.save();
  return user;
};

const upsertBy = async (Model, filter, fields) => Model.findOneAndUpdate(
  filter,
  { $set: fields },
  { returnDocument: "after", upsert: true, runValidators: true, setDefaultsOnInsert: true },
);

const logSeedProgress = (phase, startedAt, details = {}) => {
  console.log(JSON.stringify({
    phase,
    elapsedMs: Date.now() - startedAt,
    ...details,
  }));
};

const deterministicBatchId = (centreIndex, courseIndex, shiftIndex) => new mongoose.Types.ObjectId(
  (100 + centreIndex * 10 + courseIndex * 2 + shiftIndex).toString(16).padStart(24, "0"),
);

const splitIntoInstalments = (amountPaise, index) => {
  if (index <= 3) return [3000000, 1000000, 1000000, 1000000];
  const base = Math.floor(amountPaise / 4);
  const remainder = amountPaise - base * 4;
  return [base + remainder, base, base, base];
};

const monthDate = (offset, day = 10) => {
  return new Date(Date.UTC(DEMO_REFERENCE_DATE.getUTCFullYear(), DEMO_REFERENCE_DATE.getUTCMonth() + offset, day, 12));
};

const getDueDates = (profile) => {
  const firstOffset = profile === 3 ? 1 : profile === 4 ? -1 : -3;
  return Array.from({ length: 4 }, (_, index) => monthDate(firstOffset + index));
};

const plannedPayments = (student, instalmentAmounts) => {
  if (student.profile === 0) return instalmentAmounts.map((amountPaise) => amountPaise);
  if (student.profile === 1) return [Math.floor(instalmentAmounts[0] / 2), instalmentAmounts[1], 0, 0];
  if (student.profile === 2) return [instalmentAmounts[0], 0, 0, 0];
  return [0, 0, 0, 0];
};

const findConfiguredCentre = (centreMap, centreCode) => {
  const centre = centreMap.get(centreCode);
  if (!centre) throw new Error("A configured demo centre could not be resolved");
  return centre;
};

const ensureDemoConsent = async ({ parent, student }) => {
  if (process.env.NODE_ENV !== "development" || !parent.email?.toLowerCase().endsWith("@example.test")) {
    throw new Error("Synthetic demo consent may only be created for development test accounts");
  }
  await Consent.findOneAndUpdate(
    { parent: parent._id, student: student._id, purpose: "STUDENT_DATA_PROCESSING" },
    {
      $setOnInsert: {
        status: "GRANTED",
        verificationMethod: "DEMO_SEED",
        verificationReference: "SYNTHETIC_DEMO_ONLY_NOT_LEGAL_CONSENT",
        isDemoConsent: true,
        policyVersion: DEMO_POLICY_VERSION,
        consentedAt: new Date("2026-01-01T00:00:00.000Z"),
        withdrawnAt: null,
      },
    },
    { returnDocument: "after", upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
};

const ensureOfflineDemoPayment = async ({ student, instalment, account, amountPaise, transactionId, paidAt }) => {
  if (!amountPaise) return null;
  const existing = await Payment.findOne({ transactionId }).select("student instalment amountPaise paymentMethod status");
  if (existing) {
    const matches = existing.student.toString() === student._id.toString() &&
      existing.instalment.toString() === instalment._id.toString() &&
      existing.amountPaise === amountPaise && existing.paymentMethod === "BANK_TRANSFER" &&
      existing.status === "SUCCESS";
    if (!matches) throw new Error("A deterministic demo payment reference conflicts with existing data");
    return existing;
  }
  return recordOfflinePayment({
    studentId: student._id,
    instalmentId: instalment._id,
    amountPaise,
    paymentMethod: "BANK_TRANSFER",
    transactionId,
    user: account,
    paidAt,
  });
};

const ensureAcademicRecords = async ({ student, account, profile, course }) => {
  const todayUtc = DEMO_REFERENCE_DATE.getTime();
  const attendanceStatuses = profile === 2 ? ["ABSENT", "PRESENT", "ABSENT", "ABSENT", "PRESENT", "ABSENT", "PRESENT", "ABSENT"]
    : ["PRESENT", "PRESENT", "ABSENT", "PRESENT", "PRESENT", "PRESENT", "ABSENT", "PRESENT"];
  for (let day = 0; day < attendanceStatuses.length; day += 1) {
    const date = new Date(todayUtc - day * 86400000);
    await upsertBy(Attendance, { student: student._id, date }, {
      student: student._id,
      date,
      status: attendanceStatuses[day],
      recordedBy: account._id,
      source: "MANUAL",
    });
  }

  const scores = profile === 2 ? [88, 77, 66, 54] : [65 + (student._id.toString().charCodeAt(0) % 15), 68, 71, 74];
  for (let index = 0; index < scores.length; index += 1) {
    const testDate = new Date(todayUtc - (28 - index * 7) * 86400000);
    const testName = `Demo Assessment ${index + 1}`;
    await upsertBy(TestScore, { student: student._id, testName, testDate }, {
      student: student._id,
      testName,
      subject: course === "JEE" ? "Mathematics" : "Biology",
      score: scores[index],
      maximumScore: 100,
      testDate,
      recordedBy: account._id,
    });
  }
};

const verifySeededData = async ({ centresByCode, batchesByKey, accountsByCentre, counsellor, seededRecords }) => {
  const studentIds = seededRecords.map(({ student }) => student._id);
  const [storedStudents, feePlans, instalments, consents, batches] = await Promise.all([
    Student.find({ _id: { $in: studentIds } }).select("_id centre batch parent studentId"),
    FeePlan.find({ student: { $in: studentIds } }).select("student finalPayablePaise"),
    Instalment.find({ student: { $in: studentIds } }).select("student feePlan amountPaise"),
    Consent.find({ student: { $in: studentIds }, purpose: "STUDENT_DATA_PROCESSING", status: "GRANTED" }).select("parent student verificationMethod isDemoConsent"),
    Batch.find({ _id: { $in: [...batchesByKey.values()].map((batch) => batch._id) } }).select("_id"),
  ]);
  if (storedStudents.length !== 120 || feePlans.length !== 120 || instalments.length !== 480 || consents.length !== 120 || batches.length !== 16) {
    throw new Error("Synthetic demo record count verification failed");
  }

  const byCentre = Object.fromEntries(DEMO_CENTRES.map(({ code }) => [code, 0]));
  for (const student of storedStudents) {
    const record = seededRecords.find(({ student: seeded }) => seeded._id.toString() === student._id.toString());
    const expectedCentre = record && centresByCode.get(record.definition.centreCode);
    if (!record || student.parent.toString() !== record.parent._id.toString() || student.centre.toString() !== expectedCentre?._id.toString() || student.batch.toString() !== record.batch._id.toString()) {
      throw new Error("Demo student-parent-centre relationship verification failed");
    }
    byCentre[record.definition.centreCode] += 1;
  }
  if (Object.values(byCentre).some((count) => count !== 30)) throw new Error("Demo students are not evenly distributed across centres");
  const consentByPair = new Set(consents.map((consent) => `${consent.parent}:${consent.student}`));
  if (seededRecords.some(({ parent, student }) => !consentByPair.has(`${parent._id}:${student._id}`))) {
    throw new Error("A synthetic parent is missing active consent for the linked demo student");
  }
  if (consents.some((consent) => consent.isDemoConsent && consent.verificationMethod !== "DEMO_SEED")) {
    throw new Error("Demo consent marker verification failed");
  }

  const successPayments = await Payment.find({ student: { $in: studentIds }, status: "SUCCESS" }).select("student instalment amountPaise transactionId");
  const existingSeedPaymentRefs = new Set(successPayments.map(({ transactionId }) => transactionId));
  const expectedSeedPaymentRefs = new Set();
  for (const { definition, feePlan } of seededRecords) {
    const instalmentAmounts = splitIntoInstalments(feePlan.finalPayablePaise, definition.index);
    plannedPayments(definition, instalmentAmounts).forEach((amountPaise, index) => {
      if (!amountPaise) return;
      expectedSeedPaymentRefs.add(index === 0 && definition.legacyPayment
        ? definition.legacyPayment.transactionId
        : `DEMO-OFFLINE-${definition.studentId}-I${index + 1}`);
    });
  }
  if ([...expectedSeedPaymentRefs].some((transactionId) => !existingSeedPaymentRefs.has(transactionId))) {
    throw new Error("Synthetic payment reference verification failed");
  }
  const paidByInstalment = new Map();
  for (const payment of successPayments) {
    const key = payment.instalment.toString();
    paidByInstalment.set(key, (paidByInstalment.get(key) || 0) + payment.amountPaise);
  }
  const instalmentCounts = new Map();
  for (const instalment of instalments) {
    instalmentCounts.set(instalment.student.toString(), (instalmentCounts.get(instalment.student.toString()) || 0) + 1);
    if ((paidByInstalment.get(instalment._id.toString()) || 0) > instalment.amountPaise) throw new Error("A demo instalment is overpaid");
  }
  if ([...instalmentCounts.values()].some((count) => count !== 4)) throw new Error("Every synthetic student must have four instalments");
  const plansByStudent = new Map(feePlans.map((plan) => [plan.student.toString(), plan]));
  const instalmentTotals = new Map();
  for (const instalment of instalments) {
    const key = instalment.student.toString();
    instalmentTotals.set(key, (instalmentTotals.get(key) || 0) + instalment.amountPaise);
  }
  if ([...plansByStudent].some(([studentId, plan]) => instalmentTotals.get(studentId) !== plan.finalPayablePaise)) {
    throw new Error("Synthetic instalments do not sum to the fee plan total");
  }

  for (const [centreIndex, centre] of DEMO_CENTRES.entries()) {
    const account = accountsByCentre.get(centre.code);
    if (account.centres.length !== 1 || account.centres[0].toString() !== centresByCode.get(centre.code)._id.toString()) {
      throw new Error("Demo Accounts Executive centre assignment verification failed");
    }
    const directory = await getStudents({ user: account, filters: {}, pagination: { page: "1", limit: "100" } });
    if (directory.students.length !== 30 || directory.students.some((student) => student.centre.id.toString() !== centresByCode.get(centre.code)._id.toString())) {
      throw new Error("Demo Accounts Executive directory scope verification failed");
    }
    const otherCentre = DEMO_CENTRES[(centreIndex + 1) % DEMO_CENTRES.length];
    await getStudents({ user: account, filters: { centreId: centresByCode.get(otherCentre.code)._id.toString() }, pagination: { page: "1", limit: "20" } })
      .then(() => { throw new Error("Demo Accounts Executive accessed an unassigned centre"); })
      .catch((error) => { if (error.statusCode !== 403) throw error; });

    const dashboard = await getAccountsDashboard({ user: account, filters: {} });
    const expectedBilledPaise = seededRecords
      .filter(({ definition }) => definition.centreCode === centre.code)
      .reduce((sum, { feePlan }) => sum + feePlan.finalPayablePaise, 0);
    if (dashboard.financialSummary.totalBilledPaise !== expectedBilledPaise) throw new Error("Demo centre dashboard totals verification failed");
  }

  const tasks = await RiskFlag.countDocuments({ assignedTo: counsellor._id, followUpRequired: true, status: { $in: ["OPEN", "REVIEWED"] } });
  const counsellorTaskPage = await getCounsellorTasks({ counsellorId: counsellor._id, pagination: { page: "1", limit: "100" } });
  if (counsellorTaskPage.pagination.totalRecords !== tasks || counsellorTaskPage.tasks.some(({ student }) =>
    !studentIds.some((studentId) => studentId.toString() === student?.id?.toString()))) {
    throw new Error("Synthetic counsellor task access verification failed");
  }
  for (const { definition, student, feePlan, account } of seededRecords) {
    const ledger = await getStudentFeeLedger({ studentId: student._id, user: account });
    if (ledger.feePlan.finalPayablePaise !== feePlan.finalPayablePaise) throw new Error("Demo ledger verification failed");
  }
  return {
    centres: DEMO_CENTRES.length,
    accountsExecutives: accountsByCentre.size,
    batches: batches.length,
    students: storedStudents.length,
    parents: new Set(seededRecords.map(({ parent }) => parent._id.toString())).size,
    feePlans: feePlans.length,
    instalments: instalments.length,
    activeParentConsents: consents.length,
    demoMarkedConsents: consents.filter(({ isDemoConsent }) => isDemoConsent).length,
    successfulOfflinePayments: expectedSeedPaymentRefs.size,
    assignedCounsellorTasks: tasks,
    studentsByCentre: byCentre,
  };
};

const seedDemoData = async () => {
  validateDemoSeedEnvironment(process.env);
  const startedAt = Date.now();
  const requestedDatabaseName = databaseNameFromUri(process.env.MONGO_URI);
  await mongoose.connect(process.env.MONGO_URI);
  const connectedDatabaseName = mongoose.connection.name;
  if (!isDemoDatabaseName(connectedDatabaseName) || connectedDatabaseName !== requestedDatabaseName) {
    await mongoose.disconnect();
    throw new Error("Connected MongoDB database does not match the explicitly validated demo database");
  }
  try {
    const centresByCode = new Map();
    for (const centre of DEMO_CENTRES) {
      const saved = await upsertBy(Centre, { code: centre.code }, { ...centre, isActive: true });
      centresByCode.set(saved.code, saved);
    }

    const batchesByKey = new Map();
    for (const definition of DEMO_BATCH_DEFINITIONS) {
      const { centre, centreIndex, course, courseIndex, shift, shiftIndex, academicYear } = definition;
      const batch = await upsertBy(Batch, {
        _id: deterministicBatchId(centreIndex, courseIndex, shiftIndex),
      }, {
        name: `${course} ${academicYear} ${shift === "MORNING" ? "Morning" : "Evening"}`,
        centre: centresByCode.get(centre.code)._id,
        course,
        shift,
        academicYear,
        isActive: true,
      });
      batchesByKey.set(`${centre.code}:${course}:${shift}`, batch);
    }
    logSeedProgress("Centres and batches", startedAt, {
      centres: centresByCode.size,
      batches: batchesByKey.size,
    });

    const accountsByCentre = new Map();
    for (const definition of DEMO_ACCOUNTS_EXECUTIVES) {
      const centre = findConfiguredCentre(centresByCode, definition.centreCode);
      const account = await upsertUser({
        identity: { email: definition.email },
        fields: { name: definition.name, role: "ACCOUNTS", centres: [centre._id], isActive: true },
        password: process.env.DEMO_ACCOUNTS_PASSWORD,
      });
      accountsByCentre.set(centre.code, account);
    }

    const counsellor = await upsertUser({
      identity: { email: DEMO_COUNSELLOR.email },
      fields: {
        name: DEMO_COUNSELLOR.name,
        phone: DEMO_COUNSELLOR.phone,
        role: "COUNSELLOR",
        centres: [...centresByCode.values()].map((centre) => centre._id),
        isActive: true,
      },
      password: process.env.DEMO_COUNSELLOR_PASSWORD,
    });

    const seededRecords = [];
    const parentIds = new Set();
    let feePlanCount = 0;
    let instalmentCount = 0;
    let paymentCount = 0;
    let attendanceCount = 0;
    let testScoreCount = 0;
    for (const definition of STUDENT_DEFINITIONS) {
      const account = accountsByCentre.get(definition.centreCode);
      const parent = await upsertUser({
        identity: { email: definition.parent.email },
        fields: { name: definition.parent.name, phone: definition.parent.phone, role: "PARENT", centres: [], isActive: true },
        password: process.env.DEMO_PARENT_PASSWORD,
      });
      parentIds.add(parent._id.toString());
      const centre = findConfiguredCentre(centresByCode, definition.centreCode);
      const batch = batchesByKey.get(`${definition.centreCode}:${definition.course}:${definition.shift}`);
      const student = await upsertBy(Student, { studentId: definition.studentId }, {
        name: definition.name,
        centre: centre._id,
        batch: batch._id,
        parent: parent._id,
        courseStartDate: new Date("2026-04-01T00:00:00.000Z"),
        courseEndDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      });

      const plan = calculateFeePlan({
        totalCourseFeePaise: definition.totalCourseFeePaise,
        discountType: definition.discountType,
        discountValue: definition.discountValue,
      });
      const feePlan = await upsertBy(FeePlan, { student: student._id }, {
        student: student._id,
        ...plan,
        status: "ACTIVE",
      });
      feePlanCount += 1;
      const instalmentAmounts = splitIntoInstalments(plan.finalPayablePaise, definition.index);
      const instalmentData = generateInstalments({
        feePlanId: feePlan._id,
        studentId: student._id,
        finalPayablePaise: plan.finalPayablePaise,
        instalments: instalmentAmounts.map((amountPaise, index) => ({ amountPaise, dueDate: getDueDates(definition.profile)[index] })),
      });
      const savedInstalments = [];
      for (const instalment of instalmentData) {
        savedInstalments.push(await upsertBy(Instalment, {
          feePlan: feePlan._id,
          instalmentNumber: instalment.instalmentNumber,
        }, instalment));
        instalmentCount += 1;
      }

      const payments = plannedPayments(definition, instalmentAmounts);
      for (let index = 0; index < payments.length; index += 1) {
        const amountPaise = payments[index];
        if (!amountPaise) continue;
        const instalment = savedInstalments[index];
        const legacyTransactionId = index === 0 ? definition.legacyPayment?.transactionId : null;
        const transactionId = legacyTransactionId ?? `DEMO-OFFLINE-${definition.studentId}-I${index + 1}`;
        const dueDate = instalment.dueDate;
        const paidAt = new Date(Math.min(dueDate.getTime() - 86400000, DEMO_REFERENCE_DATE.getTime() - 86400000));
        await ensureOfflineDemoPayment({ student, instalment, account, amountPaise, transactionId, paidAt });
        paymentCount += 1;
      }

      await ensureDemoConsent({ parent, student });
      await ensureAcademicRecords({ student, account, profile: definition.profile, course: definition.course });
      attendanceCount += 8;
      testScoreCount += 4;
      seededRecords.push({ definition, parent, student, feePlan, account, batch });
      if (seededRecords.length % 10 === 0 || seededRecords.length === STUDENT_DEFINITIONS.length) {
        logSeedProgress("Student data", startedAt, {
          studentsProcessed: seededRecords.length,
          studentsTotal: STUDENT_DEFINITIONS.length,
        });
      }
    }
    logSeedProgress("Parent and Accounts users", startedAt, {
      parents: parentIds.size,
      accountsExecutives: accountsByCentre.size,
      counsellors: 1,
    });
    logSeedProgress("Students", startedAt, { students: seededRecords.length });
    logSeedProgress("Fee plans and instalments", startedAt, {
      feePlans: feePlanCount,
      instalments: instalmentCount,
    });
    logSeedProgress("Payments", startedAt, { successfulPaymentsProcessed: paymentCount });
    logSeedProgress("Attendance and test scores", startedAt, {
      attendanceRecords: attendanceCount,
      testScores: testScoreCount,
    });

    let riskRecordsProcessed = 0;
    for (const { student, account } of seededRecords) {
      // Preserve prior counsellor decisions; rerunning the seed must not reopen or duplicate tasks.
      const priorRiskFlag = await RiskFlag.findOne({ student: student._id }).sort({ createdAt: -1 });
      const riskFlag = !priorRiskFlag || priorRiskFlag.status === "OPEN"
        ? await analyzeStudentRisk(student._id)
        : priorRiskFlag;
      if (riskFlag.status === "OPEN" && riskFlag.followUpRequired && riskFlag.assignedTo?.toString() !== counsellor._id.toString()) {
        await assignRiskTask({ riskFlagId: riskFlag._id, counsellorId: counsellor._id, assignedBy: account });
      }
      riskRecordsProcessed += 1;
      if (riskRecordsProcessed % 10 === 0 || riskRecordsProcessed === seededRecords.length) {
        logSeedProgress("Risk analysis progress", startedAt, {
          studentsProcessed: riskRecordsProcessed,
          studentsTotal: seededRecords.length,
        });
      }
    }
    logSeedProgress("Risk analysis", startedAt, { studentsProcessed: riskRecordsProcessed });

    const counts = await verifySeededData({ centresByCode, batchesByKey, accountsByCentre, counsellor, seededRecords });
    logSeedProgress("Final verification", startedAt, {
      students: counts.students,
      feePlans: counts.feePlans,
      instalments: counts.instalments,
      consents: counts.activeParentConsents,
    });
    console.log(JSON.stringify({ success: true, consentNotice: "DEMO_SEED consent is synthetic and not legally valid parental consent", ...counts }));
  } finally {
    await mongoose.disconnect();
  }
};

export {
  DEMO_CENTRES,
  DEMO_BATCH_DEFINITIONS,
  DEMO_ACCOUNTS,
  DEMO_ACCOUNTS_EXECUTIVES,
  DEMO_COUNSELLOR,
  STUDENT_DEFINITIONS,
  deterministicBatchId,
  databaseNameFromUri,
  isDemoDatabaseName,
  splitIntoInstalments,
  plannedPayments,
  validateDemoSeedEnvironment,
  verifySeededData,
  seedDemoData,
};
