import {
  createAttendance,
  createBulkAttendance,
  createBulkTestScores,
  createTestScore,
  getStudentAttendance,
  getStudentTestHistory,
} from "../services/academic/academicRecord.service.js";

const respondWithError = (res, error, fallbackMessage) => {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "A duplicate academic record already exists",
    });
  }

  logError(fallbackMessage, error);
  return res.status(500).json({
    success: false,
    message: fallbackMessage,
  });
};

const createAttendanceController = async (req, res) => {
  try {
    const result = await createAttendance({
      studentId: req.body.studentId,
      date: req.body.date,
      status: req.body.status,
      user: req.user,
    });

    return res.status(201).json({
      success: true,
      data: {
        attendance: result.attendance,
        riskAnalysis: result.riskAnalysis,
      },
    });
  } catch (error) {
    return respondWithError(res, error, "Unable to record attendance");
  }
};

const createBulkAttendanceController = async (req, res) => {
  try {
    const result = await createBulkAttendance({
      date: req.body.date,
      records: req.body.records,
      user: req.user,
    });

    return res.status(201).json({
      success: true,
      data: {
        attendance: result.attendanceRecords,
        riskAnalysis: result.riskAnalysis,
      },
    });
  } catch (error) {
    return respondWithError(res, error, "Unable to record bulk attendance");
  }
};

const getStudentAttendanceController = async (req, res) => {
  try {
    const attendance = await getStudentAttendance({
      studentId: req.params.studentId,
      user: req.user,
    });

    return res.status(200).json({
      success: true,
      data: attendance,
    });
  } catch (error) {
    return respondWithError(res, error, "Unable to retrieve attendance");
  }
};

const createTestScoreController = async (req, res) => {
  try {
    const result = await createTestScore({
      studentId: req.body.studentId,
      testName: req.body.testName,
      subject: req.body.subject,
      score: req.body.score,
      maximumScore: req.body.maximumScore,
      testDate: req.body.testDate,
      user: req.user,
    });

    return res.status(201).json({
      success: true,
      data: {
        testScore: result.testScore,
        riskAnalysis: result.riskAnalysis,
      },
    });
  } catch (error) {
    return respondWithError(res, error, "Unable to record test score");
  }
};

const createBulkTestScoresController = async (req, res) => {
  try {
    const result = await createBulkTestScores({
      testName: req.body.testName,
      subject: req.body.subject,
      testDate: req.body.testDate,
      records: req.body.records,
      user: req.user,
    });

    return res.status(201).json({
      success: true,
      data: {
        testScores: result.scores,
        riskAnalysis: result.riskAnalysis,
      },
    });
  } catch (error) {
    return respondWithError(res, error, "Unable to record bulk test scores");
  }
};

const getStudentTestHistoryController = async (req, res) => {
  try {
    const history = await getStudentTestHistory({
      studentId: req.params.studentId,
      user: req.user,
    });

    return res.status(200).json({
      success: true,
      data: history,
    });
  } catch (error) {
    return respondWithError(res, error, "Unable to retrieve test history");
  }
};

export {
  createAttendanceController,
  createBulkAttendanceController,
  createBulkTestScoresController,
  createTestScoreController,
  getStudentAttendanceController,
  getStudentTestHistoryController,
};
import { logError } from "../utils/logger.js";
