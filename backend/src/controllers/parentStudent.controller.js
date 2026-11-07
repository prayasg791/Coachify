import Consent from "../models/Consent.js";
import Student from "../models/Student.js";
import { logError } from "../utils/logger.js";

const getParentStudents = async (req, res) => {
  try {
    const consents = await Consent.find({
      parent: req.user._id,
      purpose: "STUDENT_DATA_PROCESSING",
      status: "GRANTED",
    }).select("student").lean();

    const studentIds = [...new Set(consents.map(({ student }) => student.toString()))];
    if (studentIds.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const students = await Student.find({
      _id: { $in: studentIds },
      parent: req.user._id,
    })
      .select("_id studentId name centre batch status")
      .populate({ path: "centre", select: "_id name" })
      .populate({ path: "batch", select: "_id name course academicYear" })
      .lean();

    return res.status(200).json({
      success: true,
      data: students.map((student) => ({
        id: student._id,
        studentId: student.studentId,
        name: student.name,
        centre: student.centre
          ? { id: student.centre._id, name: student.centre.name }
          : null,
        batch: student.batch
          ? { id: student.batch._id, name: student.batch.name }
          : null,
        course: student.batch?.course ?? null,
        ...(student.batch?.academicYear
          ? { academicYear: student.batch.academicYear }
          : {}),
        status: student.status,
      })),
    });
  } catch (error) {
    logError("Parent student lookup failed", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve linked students",
    });
  }
};

export { getParentStudents };
