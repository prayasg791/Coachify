import { getStudentFeeLedger } from "../services/fee/feeLedger.service.js";
import { logError } from "../utils/logger.js";

const getStudentFeeLedgerController = async (req, res) => {
  try {
    const ledger = await getStudentFeeLedger({
      studentId: req.params.studentId,
      user: req.user,
    });

    return res.status(200).json({
      success: true,
      data: ledger,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    logError("Fee ledger retrieval failed", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve fee ledger",
    });
  }
};

export { getStudentFeeLedgerController };
