
import Student from "../../models/Student.js";
import Consent from "../../models/Consent.js";
import AuditLog from "../../models/AuditLog.js";
import { CONSENT_OTP_FRESHNESS_MS } from "./otp.service.js";

const grantParentalConsent = async ({
  parentId,
  studentId,
  policyVersion,
  otpVerifiedAt,
}) => {
  const verifiedAt = Number(otpVerifiedAt);
  if (
    !Number.isSafeInteger(verifiedAt) ||
    Date.now() - verifiedAt < 0 ||
    Date.now() - verifiedAt > CONSENT_OTP_FRESHNESS_MS
  ) {
    const error = new Error("Recent OTP verification is required to grant consent");
    error.statusCode = 403;
    throw error;
  }

  if (!policyVersion) {
    throw new Error("Policy version is required");
  }

  // Ensure this student is linked to the logged-in parent.
  const student = await Student.findOne({
    _id: studentId,
    parent: parentId,
  });

  if (!student) {
    throw new Error("Student not linked to this parent");
  }

  const consent = await Consent.findOneAndUpdate(
    {
      parent: parentId,
      student: studentId,
      purpose: "STUDENT_DATA_PROCESSING",
    },
    {
      $set: {
        status: "GRANTED",
        verificationMethod: "OTP",
        verificationReference: `PARENT_OTP_${verifiedAt}`,
        policyVersion,
        consentedAt: new Date(),
        withdrawnAt: null,
      },
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
    }
  );

  await AuditLog.create({
    actor: parentId,
    actorType: "USER",
    action: "PARENTAL_CONSENT_GRANTED",
    entityType: "Consent",
    entityId: consent._id,
    details: { studentId, policyVersion },
  });

  return consent;
};

const withdrawParentalConsent = async ({
  parentId,
  studentId,
}) => {
  const consent = await Consent.findOneAndUpdate(
    {
      parent: parentId,
      student: studentId,
      purpose: "STUDENT_DATA_PROCESSING",
      status: "GRANTED",
    },
    {
      $set: {
        status: "WITHDRAWN",
        withdrawnAt: new Date(),
      },
    },
    { new: true }
  );

  if (!consent) {
    throw new Error("Active consent not found");
  }

  await AuditLog.create({
    actor: parentId,
    actorType: "USER",
    action: "PARENTAL_CONSENT_WITHDRAWN",
    entityType: "Consent",
    entityId: consent._id,
    details: { studentId },
  });

  return consent;
};

export {
  grantParentalConsent,
  withdrawParentalConsent,
};
