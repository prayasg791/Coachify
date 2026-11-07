
import mongoose from "mongoose";

const refundSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    totalPaidPaise: {
  type: Number,
  required: true,
  min: 0,
  validate: {
    validator: Number.isSafeInteger,
    message: "Amount must be an integer in paise",
  },
},

    eligibleAmountPaise:{
  type: Number,
  required: true,
  min: 0,
  validate: {
    validator: Number.isSafeInteger,
    message: "Amount must be an integer in paise",
  },
},

    unusedCourseDays: {
      type: Number,
      required: true,
      min: 0,
    },

    totalCourseDays: {
      type: Number,
      required: true,
      min: 1,
    },

    refundAmountPaise:{
  type: Number,
  required: true,
  min: 0,
  validate: {
    validator: Number.isSafeInteger,
    message: "Amount must be an integer in paise",
  },
},

    withdrawalDate: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "PROCESSING", "PROCESSED", "REJECTED"],
      default: "PENDING",
    },

    decisionBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    decisionAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    processedAt: {
      type: Date,
      default: null,
    },

    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    refundTransactionId: {
  type: String,
  unique: true,
  sparse: true,
},
  },
  { timestamps: true }
);

refundSchema.index(
  { student: 1, withdrawalDate: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["PENDING", "APPROVED", "PROCESSING", "PROCESSED"] },
    },
  }
);
refundSchema.index({ createdAt: -1, _id: -1 });

const Refund = mongoose.model("Refund", refundSchema);

export default Refund;
