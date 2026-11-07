
import {
  grantParentalConsent,
  withdrawParentalConsent,
} from "../services/auth/consent.service.js";

const grantConsent = async (req, res) => {
  try {
    const consent = await grantParentalConsent({
      parentId: req.user._id,
      studentId: req.body.studentId,
      policyVersion: req.body.policyVersion,
      otpVerifiedAt: req.auth?.authMethod === "PARENT_OTP" ? req.auth.otpVerifiedAt : undefined,
    });

    res.status(200).json({
      message: "Parental consent recorded",
      consent,
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ message: error.message });
  }
};

const withdrawConsent = async (req, res) => {
  try {
    const consent = await withdrawParentalConsent({
      parentId: req.user._id,
      studentId: req.body.studentId,
    });

    res.status(200).json({
      message: "Parental consent withdrawn",
      consent,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export { grantConsent, withdrawConsent };
