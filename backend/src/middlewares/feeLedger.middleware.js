import mongoose from "mongoose";
import { requireStudentConsent } from "./consent.middleware.js";

const requireFeeLedgerAccess = (req, res, next) => {
  const { studentId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid student ID",
    });
  }

  if (req.user.role === "PARENT") {
    return requireStudentConsent(req, res, next);
  }

  if (req.user.role === "ACCOUNTS") {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "You are not authorized to access fee ledgers",
  });
};

export { requireFeeLedgerAccess };
