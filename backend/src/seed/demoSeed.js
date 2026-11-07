import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";
import Centre from "../models/Centre.js";
import Batch from "../models/Batch.js";
import Student from "../models/Student.js";
import FeePlan from "../models/FeePlan.js";
import Instalment from "../models/Instalment.js";
import Payment from "../models/Payment.js";
import Attendance from "../models/Attendance.js";
import TestScore from "../models/TestScore.js";
import { calculateFeePlan } from "../services/fee/feePlan.service.js";
import { generateInstalments } from "../services/fee/instalment.service.js";
import { analyzeStudentRisk } from "../services/risk/riskAnalysis.service.js";
import { getStudentFeeLedger } from "../services/fee/feeLedger.service.js";
import { getAccountsDashboard } from "../services/dashboard/accountsDashboard.service.js";

dotenv.config();

const DEMO_CENTRES = [
  { name: "Jaipur Central", code: "JPR-CEN", address: "Demo Road, Jaipur" },
  { name: "Jaipur North", code: "JPR-NTH", address: "Demo Avenue, Jaipur" },
  { name: "Jaipur South", code: "JPR-STH", address: "Demo Street, Jaipur" },
  { name: "Jaipur West", code: "JPR-WST", address: "Demo Lane, Jaipur" },
];

const COURSES = ["JEE", "NEET"];
const SHIFTS = ["MORNING", "EVENING"];
const COURSE_START_DATE = new Date("2026-04-01T00:00:00.000Z");
const COURSE_END_DATE = new Date("2027-03-31T00:00:00.000Z");

const STUDENT_DEFINITIONS = [
  {
    studentId: "STU-0412",
    name: "Aarav Meena",
    course: "JEE",
    shift: "MORNING",
    centreCode: "JPR-CEN",
    totalFeePaise: 3000000,
    discountType: "FIXED",
    discountValue: 0,
    instalmentAmountPaise: 3000000,
    dueDate: new Date("2026-10-10T00:00:00.000Z"),
    parent: {
      name: "Demo Parent Aarav",
      email: "parent.aarav@example.test",
      phone: "9000000412",
    },
    payments: [
      {
        transactionId: "DEMO-PAY-STU-0412-001",
        amountPaise: 3000000,
      },
    ],
  },
  {
    studentId: "STU-0587",
    name: "Ishita Sharma",
    course: "JEE",
    shift: "EVENING",
    centreCode: "JPR-NTH",
    totalFeePaise: 3000000,
    discountType: "FIXED",
    discountValue: 0,
    instalmentAmountPaise: 3000000,
    dueDate: new Date("2026-10-10T00:00:00.000Z"),
    parent: {
      name: "Demo Parent Ishita",
      email: "parent.ishita@example.test",
      phone: "9000000587",
    },
    payments: [
      {
        transactionId: "DEMO-PAY-STU-0587-001",
        amountPaise: 1500000,
      },
    ],
  },
  {
    studentId: "STU-0219",
    name: "Mohit Gurjar",
    course: "NEET",
    shift: "MORNING",
    centreCode: "JPR-STH",
    totalFeePaise: 4000000,
    discountType: "FIXED",
    discountValue: 0,
    instalmentAmountPaise: 4000000,
    dueDate: new Date("2026-11-15T00:00:00.000Z"),
    parent: {
      name: "Demo Parent Mohit",
      email: "parent.mohit@example.test",
      phone: "9000000219",
    },
    payments: [],
  },
];

const DEMO_ACCOUNTS = {
  name: "Coachify Demo Accounts",
  email: "accounts.demo@coachify.test",
  role: "ACCOUNTS",
};

const DEMO_COUNSELLOR = {
  name: "Coachify Demo Counsellor",
  email: "counsellor.demo@coachify.test",
  phone: "9000000001",
  role: "COUNSELLOR",
};

const validateDemoSeedEnvironment = (environment) => {
  if (environment.NODE_ENV !== "development") {
    throw new Error("Demo seeding requires NODE_ENV=development");
  }
  if (environment.DEMO_SEED_ENABLED !== "true") {
    throw new Error("Set DEMO_SEED_ENABLED=true to confirm demo seeding");
  }
  if (!environment.MONGO_URI) {
    throw new Error("MONGO_URI is required");
  }

  const uri = environment.MONGO_URI.trim().replace(/^['"]|['"]$/g, "");
  const uriMatch = uri.match(
    /^mongodb(?:\+srv)?:\/\/(?:[^@/]+@)?[^/]+\/([^/?#]+)(?:[?#].*)?$/i
  );
  const databaseName = uriMatch?.[1];
  if (!databaseName || !/(^|[-_])(dev|development|demo|test)([-_]|$)/i.test(databaseName)) {
    throw new Error(
      "MONGO_URI must select a database whose name includes dev, development, demo, or test"
    );
  }
  if (!environment.DEMO_ACCOUNTS_PASSWORD) {
    throw new Error("DEMO_ACCOUNTS_PASSWORD is required");
  }
  if (!environment.DEMO_COUNSELLOR_PASSWORD) {
    throw new Error("DEMO_COUNSELLOR_PASSWORD is required");
  }
  if (!environment.DEMO_PARENT_PASSWORD) {
    throw new Error("DEMO_PARENT_PASSWORD is required");
  }
};

const upsertUser = async ({ identity, fields, password }) => {
  let user = await User.findOne(identity).select("+password");

  if (!user) {
    try {
      user = await User.create({ ...identity, ...fields, password });
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }
      user = await User.findOne(identity).select("+password");
    }
  }

  if (!user) {
    throw new Error(`Unable to create demo user ${identity.email || identity.phone}`);
  }

  Object.assign(user, fields);
  if (password && !user.password) {
    user.password = password;
  }
  await user.save();
  return user;
};

const upsertBy = async (Model, filter, fields) => {
  const result = await Model.findOneAndUpdate(
    filter,
    { $set: fields },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  return result;
};

const deterministicBatchId = (centreIndex, courseIndex, shiftIndex) =>
  new mongoose.Types.ObjectId(
    (100 + centreIndex * 10 + courseIndex * 2 + shiftIndex)
      .toString(16)
      .padStart(24, "0")
  );

const verifySeededData = async ({ accounts, seededStudents }) => {
  const studentIds = seededStudents.map((student) => student._id);
  const storedStudents = await Student.find({
    _id: { $in: studentIds },
  }).select("_id centre batch parent");

  if (storedStudents.length !== STUDENT_DEFINITIONS.length) {
    throw new Error("Demo student relationship verification failed");
  }

  const [feePlans, instalments, successfulPayments] =
    await Promise.all([
      FeePlan.find({ student: { $in: studentIds } }).select("student"),
      Instalment.find({ student: { $in: studentIds } }).select(
        "student amountPaise"
      ),
      Payment.find({ student: { $in: studentIds }, status: "SUCCESS" })
        .select("student amountPaise transactionId"),
    ]);

  if (
    feePlans.length !== STUDENT_DEFINITIONS.length ||
    instalments.length !== STUDENT_DEFINITIONS.length
  ) {
    throw new Error("Demo fee or instalment verification failed");
  }

  const expectedPayments = STUDENT_DEFINITIONS.flatMap((student) =>
    student.payments.map((payment) => ({
      studentId: student.studentId,
      transactionId: payment.transactionId,
      amountPaise: payment.amountPaise,
    }))
  );
  if (
    successfulPayments.length !== expectedPayments.length ||
    expectedPayments.some((expected) =>
      !successfulPayments.some((payment) =>
        payment.transactionId === expected.transactionId &&
        payment.amountPaise === expected.amountPaise
      )
    )
  ) {
    throw new Error("Demo successful payment history verification failed");
  }

  const ledgerBalancesPaise = {};
  for (const [index, student] of seededStudents.entries()) {
    const ledger = await getStudentFeeLedger({
      studentId: student._id,
      user: accounts,
    });
    const expectedBalance =
      STUDENT_DEFINITIONS[index].instalmentAmountPaise -
      STUDENT_DEFINITIONS[index].payments.reduce(
        (total, payment) => total + payment.amountPaise,
        0
      );

    if (
      ledger.totals.remainingBalancePaise !== expectedBalance ||
      ledger.paymentHistory.length !==
        STUDENT_DEFINITIONS[index].payments.length
    ) {
      throw new Error(`Demo fee ledger verification failed for ${student.studentId}`);
    }

    ledgerBalancesPaise[student.studentId] = ledger.totals.remainingBalancePaise;
  }

  const dashboard = await getAccountsDashboard({
    user: accounts,
    filters: {},
  });
  const expectedBilledPaise = STUDENT_DEFINITIONS.reduce(
    (total, student) => total + student.totalFeePaise,
    0
  );
  const expectedCollectedPaise = expectedPayments.reduce(
    (total, payment) => total + payment.amountPaise,
    0
  );

  if (
    dashboard.financialSummary.totalBilledPaise !== expectedBilledPaise ||
    dashboard.financialSummary.totalCollectedPaise !== expectedCollectedPaise ||
    dashboard.financialSummary.totalOutstandingPaise !==
      expectedBilledPaise - expectedCollectedPaise
  ) {
    throw new Error("Demo dashboard totals verification failed");
  }

  return {
    ledgerBalancesPaise,
    dashboardTotalsPaise: {
      billed: dashboard.financialSummary.totalBilledPaise,
      collected: dashboard.financialSummary.totalCollectedPaise,
      outstanding: dashboard.financialSummary.totalOutstandingPaise,
    },
  };
};

const seedDemoData = async () => {
  validateDemoSeedEnvironment(process.env);
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const centresByCode = new Map();
    for (const centre of DEMO_CENTRES) {
      const saved = await upsertBy(
        Centre,
        { code: centre.code },
        { ...centre, isActive: true }
      );
      centresByCode.set(saved.code, saved);
    }

    const batchesByKey = new Map();
    for (const [centreIndex, centre] of DEMO_CENTRES.entries()) {
      for (const [courseIndex, course] of COURSES.entries()) {
        for (const [shiftIndex, shift] of SHIFTS.entries()) {
          const batchName = `${course} 2027 ${shift === "MORNING" ? "Morning" : "Evening"}`;
          const batchFields = {
            centre: centresByCode.get(centre.code)._id,
            course,
            shift,
            academicYear: "2027",
          };
          const batch = await upsertBy(Batch, {
            _id: deterministicBatchId(centreIndex, courseIndex, shiftIndex),
          }, {
            name: batchName,
            ...batchFields,
            isActive: true,
          });
          batchesByKey.set(`${centre.code}:${course}:${shift}`, batch);
        }
      }
    }

    const accounts = await upsertUser({
      identity: { email: DEMO_ACCOUNTS.email },
      fields: {
        name: DEMO_ACCOUNTS.name,
        role: DEMO_ACCOUNTS.role,
        centres: [...centresByCode.values()].map((centre) => centre._id),
        isActive: true,
      },
      password: process.env.DEMO_ACCOUNTS_PASSWORD,
    });

    await upsertUser({
      identity: { email: DEMO_COUNSELLOR.email },
      fields: {
        name: DEMO_COUNSELLOR.name,
        phone: DEMO_COUNSELLOR.phone,
        role: DEMO_COUNSELLOR.role,
        centres: [...centresByCode.values()].map((centre) => centre._id),
        isActive: true,
      },
      password: process.env.DEMO_COUNSELLOR_PASSWORD,
    });

    const seededStudents = [];
    for (const definition of STUDENT_DEFINITIONS) {
      const parent = await upsertUser({
        identity: { email: definition.parent.email },
        fields: {
          name: definition.parent.name,
          phone: definition.parent.phone,
          role: "PARENT",
          centres: [],
          isActive: true,
        },
        password: process.env.DEMO_PARENT_PASSWORD,
      });

      const centre = centresByCode.get(definition.centreCode);
      const batch = batchesByKey.get(
        `${definition.centreCode}:${definition.course}:${definition.shift}`
      );
      const student = await upsertBy(
        Student,
        { studentId: definition.studentId },
        {
          name: definition.name,
          centre: centre._id,
          batch: batch._id,
          parent: parent._id,
          courseStartDate: COURSE_START_DATE,
          courseEndDate: COURSE_END_DATE,
          status: "ACTIVE",
        }
      );

      const calculatedPlan = calculateFeePlan({
        totalCourseFeePaise: definition.totalFeePaise,
        discountType: definition.discountType,
        discountValue: definition.discountValue,
      });
      const feePlan = await upsertBy(
        FeePlan,
        { student: student._id },
        { student: student._id, ...calculatedPlan, status: "ACTIVE" }
      );

      const instalmentData = generateInstalments({
        feePlanId: feePlan._id,
        studentId: student._id,
        finalPayablePaise: calculatedPlan.finalPayablePaise,
        instalments: [{
          amountPaise: definition.instalmentAmountPaise,
          dueDate: definition.dueDate,
        }],
      });

      const instalment = await upsertBy(
        Instalment,
        { feePlan: feePlan._id, instalmentNumber: 1 },
        instalmentData[0]
      );

      for (const payment of definition.payments) {
        await upsertBy(
          Payment,
          { transactionId: payment.transactionId },
          {
            student: student._id,
            instalment: instalment._id,
            amountPaise: payment.amountPaise,
            paymentMethod: "BANK_TRANSFER",
            transactionId: payment.transactionId,
            status: "SUCCESS",
            paidAt: new Date("2026-10-10T12:00:00.000Z"),
            recordedBy: accounts._id,
          }
        );
      }

      for (const [offset, status] of [
        [-3, "PRESENT"],
        [-2, "ABSENT"],
        [-1, "PRESENT"],
        [0, "PRESENT"],
      ]) {
        const attendanceDate = new Date("2026-11-06T00:00:00.000Z");
        attendanceDate.setUTCDate(attendanceDate.getUTCDate() + offset);
        await upsertBy(
          Attendance,
          { student: student._id, date: attendanceDate },
          {
            student: student._id,
            date: attendanceDate,
            status,
            recordedBy: accounts._id,
            source: "MANUAL",
          }
        );
      }

      const scores = [62, 68, 74, 81];
      for (let index = 0; index < scores.length; index += 1) {
        const testDate = new Date("2026-10-01T00:00:00.000Z");
        testDate.setUTCDate(testDate.getUTCDate() + index * 7);
        await upsertBy(
          TestScore,
          {
            student: student._id,
            testName: `Demo Assessment ${index + 1}`,
            testDate,
          },
          {
            student: student._id,
            testName: `Demo Assessment ${index + 1}`,
            subject: definition.course === "JEE" ? "Mathematics" : "Biology",
            score: scores[index],
            maximumScore: 100,
            testDate,
            recordedBy: accounts._id,
          }
        );
      }

      seededStudents.push(student);
    }

    for (const student of seededStudents) {
      await analyzeStudentRisk(student._id);
    }

    const verification = await verifySeededData({ accounts, seededStudents });
    console.log(JSON.stringify({
      success: true,
      centres: centresByCode.size,
      batches: batchesByKey.size,
      students: seededStudents.length,
      feePlans: seededStudents.length,
      successfulPayments: STUDENT_DEFINITIONS.reduce(
        (total, student) => total + student.payments.length,
        0
      ),
      ...verification,
    }));
  } finally {
    await mongoose.disconnect();
  }
};

export {
  DEMO_CENTRES,
  DEMO_COUNSELLOR,
  DEMO_ACCOUNTS,
  STUDENT_DEFINITIONS,
  deterministicBatchId,
  seedDemoData,
  validateDemoSeedEnvironment,
  verifySeededData,
};
