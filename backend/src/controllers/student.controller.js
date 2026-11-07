import { getStudents } from "../services/student/student.service.js";
import { logError } from "../utils/logger.js";

const getStudentsController = async (req, res) => {
  try {
    const supportedQueryParameters = new Set([
      "search",
      "centreId",
      "batchId",
      "page",
      "limit",
    ]);
    const unsupportedParameter = Object.keys(req.query).find(
      (key) => !supportedQueryParameters.has(key),
    );
    if (unsupportedParameter) {
      return res.status(400).json({
        success: false,
        message: `Unsupported query parameter: ${unsupportedParameter}`,
      });
    }

    const result = await getStudents({
      user: req.user,
      filters: {
        search: req.query.search,
        centreId: req.query.centreId,
        batchId: req.query.batchId,
      },
      pagination: {
        page: req.query.page,
        limit: req.query.limit,
      },
    });

    return res.status(200).json({
      success: true,
      data: result.students,
      pagination: result.pagination,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    logError("Student directory retrieval failed", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve students",
    });
  }
};

export { getStudentsController };
