import { getAccountsDashboard } from "../services/dashboard/accountsDashboard.service.js";
import { logError } from "../utils/logger.js";

const getAccountsDashboardController = async (req, res) => {
  try {
    const dashboard = await getAccountsDashboard({
      user: req.user,
      filters: {
        centreId: req.query.centreId,
        batchId: req.query.batchId,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      },
    });

    return res.status(200).json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    logError("Accounts dashboard failed", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve accounts dashboard",
    });
  }
};

export { getAccountsDashboardController };
