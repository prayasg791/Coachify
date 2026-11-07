
import mongoose from "mongoose";

const consentSchema = new mongoose.Schema(
  {
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    purpose: {
      type: String,
      enum: ["STUDENT_DATA_PROCESSING"],
      required: true,
    },

    status: {
      type: String,
      enum: ["GRANTED", "WITHDRAWN"],
      default: "GRANTED",
    },

    verificationMethod: {
      type: String,
      enum: ["OTP", "DEMO_SEED"],
      required: true,
    },

    // Synthetic seed consent is only eligible in development and is not legal consent.
    isDemoConsent: {
      type: Boolean,
      default: false,
    },

    verificationReference: {
      type: String,
      required: true,
    },

    policyVersion: {
      type: String,
      required: true,
    },

    consentedAt: {
      type: Date,
      required: true,
    },

    withdrawnAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

consentSchema.index({ parent: 1, student: 1, purpose: 1 });

const Consent = mongoose.model("Consent", consentSchema);

export default Consent;
