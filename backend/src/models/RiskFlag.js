
import mongoose from "mongoose";

const riskFlagSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    riskLevel: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      required: true,
    },

    followUpRequired: {
      type: Boolean,
      default: false,
    },

    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },

    reasons: [
      {
        type: String,
      },
    ],

    signals: {
      attendancePercentage: {
        type: Number,
        min: 0,
        max: 100,
      },

      missedInstalments: {
        type: Number,
        min: 0,
      },

      testScoreTrend: {
        type: String,
        enum: ["IMPROVING", "DECLINING", "STABLE", "INSUFFICIENT_DATA"],
      },
    },

    status: {
      type: String,
      enum: ["OPEN", "REVIEWED", "FALSE_POSITIVE", "RESOLVED"],
      default: "OPEN",
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    analysisSource: {
      type: String,
      enum: ["AI", "RULES_FALLBACK"],
      required: true,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reviewNotes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

const RiskFlag = mongoose.model("RiskFlag", riskFlagSchema);

export default RiskFlag;
