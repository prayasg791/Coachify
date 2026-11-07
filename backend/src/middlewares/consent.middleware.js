
import mongoose from "mongoose";
import Student from "../models/Student.js";
import Consent from "../models/Consent.js";
import { logError } from "../utils/logger.js";
import { withProductionConsentGuard } from "../utils/consentQuery.js";

const requireStudentConsent = async (req, res, next) => {
  try {
    const studentId = req.params.studentId || req.body.studentId;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid student ID",
      });
    }

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "Student ID is required",
      });
    }

    // This middleware is intended for parent routes.
    if (req.user.role !== "PARENT") {
      return res.status(403).json({
        success: false,
        message: "Parent access required",
      });
    }

    const student = await Student.findOne({
      _id: studentId,
      parent: req.user._id,
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const consent = await Consent.findOne(withProductionConsentGuard({
      parent: req.user._id,
      student: studentId,
      purpose: "STUDENT_DATA_PROCESSING",
      status: "GRANTED",
    }));

    if (!consent) {
      return res.status(403).json({
        success: false,
        message: "Parental consent is required to access student data",
      });
    }

    req.student = student;
    next();
  } catch (error) {
    logError("Consent verification failed", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify parental consent",
    });
  }
};

export { requireStudentConsent };
