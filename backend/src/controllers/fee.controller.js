
import { createStudentFeePlan } from "../services/fee/feeManagement.service.js";
import { logError } from "../utils/logger.js";

const createFeePlan = async (req, res) => {
  try {
    const {
      studentId,
      totalCourseFeePaise,
      discountType,
      discountValue,
      instalments,
    } = req.body;

    if (
      !studentId ||
      !Number.isSafeInteger(totalCourseFeePaise) ||
      !Array.isArray(instalments) ||
      instalments.length === 0
    ) {
      return res.status(400).json({
        message: "Invalid fee plan details",
      });
    }

    const result = await createStudentFeePlan({
      studentId,
      accountUser: req.user,
      totalCourseFeePaise,
      discountType,
      discountValue,
      instalments,
    });

    return res.status(201).json({
      message: "Fee plan created successfully",
      ...result,
    });
  } catch (error) {
    logError("Fee plan creation failed", error);

    const status = error.message.includes("not found") ? 404 :
      error.message.includes("cannot manage") ? 403 :
      error.message.includes("already has") ? 409 : 400;

    return res.status(status).json({
      message: error.message,
    });
  }
};

export { createFeePlan };
