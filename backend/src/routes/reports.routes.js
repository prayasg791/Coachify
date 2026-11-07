import express from "express";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";
import {
  feeCollectionReportController, outstandingDuesReportController,
  paymentCollectionReportController, receiptConfigurationController,
  refundReportController, reportOptionsController, tallyCsvController,
} from "../controllers/accountsReports.controller.js";

const router = express.Router();
router.use(authenticate, authorizeRoles("ACCOUNTS"));
router.get("/receipt-configuration", receiptConfigurationController);
router.get("/options", reportOptionsController);
router.get("/fee-collection", feeCollectionReportController);
router.get("/payment-collections", paymentCollectionReportController);
router.get("/outstanding-dues", outstandingDuesReportController);
router.get("/refunds", refundReportController);
router.get("/tally.csv", tallyCsvController);
export default router;
