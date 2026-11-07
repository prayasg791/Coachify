import mongoose from "mongoose";
import Attendance from "../../models/Attendance.js";
import TestScore from "../../models/TestScore.js";
import Student from "../../models/Student.js";
import AuditLog from "../../models/AuditLog.js";
import { analyzeStudentRisk } from "../risk/riskAnalysis.service.js";

const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LEAVE"];
const MAX_BULK_RECORDS = 500;

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeDate = (value, label) => {
  if (typeof value !== "string" || !value.trim()) {
    throw createError(`${label} is required`);
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const dateOnly = new Date(Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day)
    ));

    if (dateOnly.toISOString().slice(0, 10) !== value) {
      throw createError(`Invalid ${label.toLowerCase()}`);
    }

    return dateOnly;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw createError(`Invalid ${label.toLowerCase()}`);
  }

  return new Date(Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate()
  ));
};

const validateObjectId = (id, label) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError(`Invalid ${label}`);
  }
};

const validateBulkRecords = (records) => {
  if (!Array.isArray(records) || records.length === 0) {
    throw createError("Records must be a non-empty array");
  }
  if (records.length > MAX_BULK_RECORDS) {
    throw createError(`A maximum of ${MAX_BULK_RECORDS} records is allowed`);
  }
  if (records.some(
    (record) => !record || typeof record !== "object" || Array.isArray(record)
  )) {
    throw createError("Every record must be an object");
  }
};

const assertUniqueStudents = (records) => {
  const seen = new Set();
  for (const record of records) {
    validateObjectId(record.studentId, "student ID");
    const id = record.studentId.toString();
    if (seen.has(id)) {
      throw createError("Duplicate student IDs are not allowed in one request");
    }
    seen.add(id);
  }
};

const findAccessibleStudents = async ({ studentIds, user }) => {
  const students = await Student.find({
    _id: { $in: studentIds },
  }).select("_id centre parent studentId name");

  if (students.length !== studentIds.length) {
    throw createError("One or more students were not found", 404);
  }

  const studentById = new Map(
    students.map((student) => [student._id.toString(), student])
  );

  for (const id of studentIds) {
    const student = studentById.get(id.toString());

    if (user.role === "ACCOUNTS") {
      const hasCentreAccess = user.centres?.some(
        (centreId) => centreId.toString() === student.centre.toString()
      );
      if (!hasCentreAccess) {
        throw createError("You cannot manage students at this centre", 403);
      }
    } else {
      throw createError("You are not authorized for this action", 403);
    }
  }

  return studentById;
};

const assertStudentAccess = async ({ studentId, user }) => {
  validateObjectId(studentId, "student ID");

  const student = await Student.findById(studentId).select(
    "_id centre parent studentId name"
  );

  if (!student) {
    throw createError("Student not found", 404);
  }

  if (user.role === "ACCOUNTS") {
    const hasCentreAccess = user.centres?.some(
      (centreId) => centreId.toString() === student.centre.toString()
    );
    if (!hasCentreAccess) {
      throw createError("You cannot access students at this centre", 403);
    }
  } else if (
    user.role !== "PARENT" ||
    student.parent.toString() !== user._id.toString()
  ) {
    throw createError("Student not found", 404);
  }

  return student;
};

const runRiskAnalysis = async (studentIds) => {
  const uniqueStudentIds = [...new Set(studentIds.map((id) => id.toString()))];
  const results = await Promise.allSettled(
    uniqueStudentIds.map((studentId) => analyzeStudentRisk(studentId))
  );
  const failures = results.flatMap((result, index) =>
    result.status === "rejected"
      ? [{ studentId: uniqueStudentIds[index], message: result.reason.message }]
      : []
  );

  if (failures.length > 0) {
    console.warn("Risk analysis failed after academic records were saved", { failureCount: failures.length });
  }

  return {
    analyzed: results.length - failures.length,
    failures,
  };
};

const createAttendance = async ({ studentId, date, status, user }) => {
  validateObjectId(studentId, "student ID");
  if (!ATTENDANCE_STATUSES.includes(status)) {
    throw createError("Invalid attendance status");
  }

  const normalizedDate = normalizeDate(date, "Attendance date");
  await assertStudentAccess({ studentId, user });
  const nextDate = new Date(normalizedDate);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  const duplicate = await Attendance.exists({
    student: studentId,
    date: { $gte: normalizedDate, $lt: nextDate },
  });
  if (duplicate) {
    throw createError("Attendance already exists for this student and date", 409);
  }

  const session = await mongoose.startSession();
  try {
    let attendance;
    await session.withTransaction(async () => {
      [attendance] = await Attendance.create(
        [{
          student: studentId,
          date: normalizedDate,
          status,
          recordedBy: user._id,
          source: "MANUAL",
        }],
        { session }
      );
      await AuditLog.create(
        [{
          actor: user._id,
          actorType: "USER",
          action: "ATTENDANCE_RECORDED",
          entityType: "Attendance",
          entityId: attendance._id,
          details: { studentId, date: normalizedDate, status, source: "MANUAL" },
        }],
        { session }
      );
    });

    const riskAnalysis = await runRiskAnalysis([studentId]);
    return { attendance, riskAnalysis };
  } catch (error) {
    if (error.code === 11000) {
      throw createError("Attendance already exists for this student and date", 409);
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

const createBulkAttendance = async ({ date, records, user }) => {
  const normalizedDate = normalizeDate(date, "Attendance date");
  validateBulkRecords(records);
  assertUniqueStudents(records);

  for (const record of records) {
    if (!ATTENDANCE_STATUSES.includes(record.status)) {
      throw createError("Invalid attendance status");
    }
  }

  const studentIds = records.map((record) => record.studentId);
  const studentsById = await findAccessibleStudents({ studentIds, user });
  const nextDate = new Date(normalizedDate);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const existing = await Attendance.find({
    student: { $in: studentIds },
    date: { $gte: normalizedDate, $lt: nextDate },
  }).select("student");

  if (existing.length > 0) {
    throw createError("Attendance already exists for one or more students", 409);
  }

  const session = await mongoose.startSession();
  try {
    let attendanceRecords;
    await session.withTransaction(async () => {
      attendanceRecords = await Attendance.insertMany(
        records.map((record) => ({
          student: studentsById.get(record.studentId.toString())._id,
          date: normalizedDate,
          status: record.status,
          recordedBy: user._id,
          source: "BULK_UPLOAD",
        })),
        { session, ordered: true }
      );

      await AuditLog.create(
        attendanceRecords.map((attendance) => ({
          actor: user._id,
          actorType: "USER",
          action: "ATTENDANCE_BULK_RECORDED",
          entityType: "Attendance",
          entityId: attendance._id,
          details: {
            studentId: attendance.student,
            date: normalizedDate,
            status: attendance.status,
            source: "BULK_UPLOAD",
          },
        })),
        { session }
      );
    });

    const riskAnalysis = await runRiskAnalysis(studentIds);
    return { attendanceRecords, riskAnalysis };
  } catch (error) {
    if (error.code === 11000) {
      throw createError("Attendance already exists for one or more students", 409);
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

const getStudentAttendance = async ({ studentId, user }) => {
  const student = await assertStudentAccess({ studentId, user });
  const records = await Attendance.find({ student: student._id })
    .select("date status source createdAt")
    .sort({ date: -1 });
  const attendanceDays = records.filter(
    (record) => record.status === "PRESENT" || record.status === "ABSENT"
  );
  const presentDays = attendanceDays.filter(
    (record) => record.status === "PRESENT"
  ).length;

  return {
    student: {
      id: student._id,
      studentId: student.studentId,
      name: student.name,
    },
    attendancePercentage: attendanceDays.length > 0
      ? (presentDays / attendanceDays.length) * 100
      : null,
    records,
  };
};

const validateScore = ({ score, maximumScore }) => {
  if (!Number.isFinite(score) || score < 0) {
    throw createError("Score must be a non-negative number");
  }
  if (!Number.isFinite(maximumScore) || maximumScore <= 0) {
    throw createError("Maximum score must be a positive number");
  }
  if (score > maximumScore) {
    throw createError("Score cannot exceed maximum score");
  }
};

const normalizeTestDetails = ({ testName, subject, testDate }) => {
  if (typeof testName !== "string" || !testName.trim() || testName.length > 200) {
    throw createError("A valid test name is required");
  }
  if (
    subject !== undefined &&
    subject !== null &&
    (typeof subject !== "string" || subject.length > 100)
  ) {
    throw createError("Invalid subject");
  }
  return {
    testName: testName.trim(),
    subject: typeof subject === "string" ? subject.trim() : undefined,
    testDate: normalizeDate(testDate, "Test date"),
  };
};

const createTestScore = async ({
  studentId,
  testName,
  subject,
  score,
  maximumScore,
  testDate,
  user,
}) => {
  validateObjectId(studentId, "student ID");
  validateScore({ score, maximumScore });
  const details = normalizeTestDetails({ testName, subject, testDate });
  await assertStudentAccess({ studentId, user });

  const session = await mongoose.startSession();
  try {
    let testScore;
    await session.withTransaction(async () => {
      [testScore] = await TestScore.create(
        [{
          student: studentId,
          ...details,
          score,
          maximumScore,
          recordedBy: user._id,
        }],
        { session }
      );
      await AuditLog.create(
        [{
          actor: user._id,
          actorType: "USER",
          action: "TEST_SCORE_RECORDED",
          entityType: "TestScore",
          entityId: testScore._id,
          details: {
            studentId,
            testName: details.testName,
            subject: details.subject,
            score,
            maximumScore,
            testDate: details.testDate,
          },
        }],
        { session }
      );
    });

    const riskAnalysis = await runRiskAnalysis([studentId]);
    return { testScore, riskAnalysis };
  } finally {
    await session.endSession();
  }
};

const createBulkTestScores = async ({
  testName,
  subject,
  testDate,
  records,
  user,
}) => {
  const details = normalizeTestDetails({ testName, subject, testDate });
  validateBulkRecords(records);
  assertUniqueStudents(records);
  for (const record of records) {
    validateScore(record);
  }

  const studentIds = records.map((record) => record.studentId);
  const studentsById = await findAccessibleStudents({ studentIds, user });
  const session = await mongoose.startSession();

  try {
    let scores;
    await session.withTransaction(async () => {
      scores = await TestScore.insertMany(
        records.map((record) => ({
          student: studentsById.get(record.studentId.toString())._id,
          ...details,
          score: record.score,
          maximumScore: record.maximumScore,
          recordedBy: user._id,
        })),
        { session, ordered: true }
      );

      await AuditLog.create(
        scores.map((testScore) => ({
          actor: user._id,
          actorType: "USER",
          action: "TEST_SCORE_BULK_RECORDED",
          entityType: "TestScore",
          entityId: testScore._id,
          details: {
            studentId: testScore.student,
            testName: testScore.testName,
            subject: testScore.subject,
            score: testScore.score,
            maximumScore: testScore.maximumScore,
            testDate: testScore.testDate,
          },
        })),
        { session }
      );
    });

    const riskAnalysis = await runRiskAnalysis(studentIds);
    return { scores, riskAnalysis };
  } finally {
    await session.endSession();
  }
};

const getStudentTestHistory = async ({ studentId, user }) => {
  const student = await assertStudentAccess({ studentId, user });
  const scores = await TestScore.find({ student: student._id })
    .select("testName subject score maximumScore testDate createdAt")
    .sort({ testDate: -1, createdAt: -1 });

  return {
    student: {
      id: student._id,
      studentId: student.studentId,
      name: student.name,
    },
    tests: scores.map((testScore) => ({
      id: testScore._id,
      testName: testScore.testName,
      subject: testScore.subject,
      score: testScore.score,
      maximumScore: testScore.maximumScore,
      percentage: (testScore.score / testScore.maximumScore) * 100,
      testDate: testScore.testDate,
      createdAt: testScore.createdAt,
    })),
  };
};

export {
  createAttendance,
  createBulkAttendance,
  createBulkTestScores,
  createTestScore,
  getStudentAttendance,
  getStudentTestHistory,
};
