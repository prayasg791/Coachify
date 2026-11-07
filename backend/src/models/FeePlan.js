
import mongoose from "mongoose";

const feePlanSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      unique: true,
    },

    totalCourseFeePaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
  validator: Number.isSafeInteger,
  message: "Amount must be an integer in paise",
}
    },

    discountType: {
      type: String,
      enum: ["FIXED", "PERCENTAGE"],
      default: "FIXED",
    },

    discountValue: {
      type: Number,
      default: 0,
      min: 0,
    },

    finalPayablePaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
  validator: Number.isSafeInteger,
  message: "Amount must be an integer in paise",
}
    },
      
    discountAmountPaise: {
  type: Number,
  required: true,
  min: 0,
  validate: {
  validator: Number.isSafeInteger,
  message: "Amount must be an integer in paise",
}
},

    status: {
      type: String,
      enum: ["ACTIVE", "COMPLETED", "CANCELLED"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

feePlanSchema.index({ createdAt: 1 });

const FeePlan = mongoose.model("FeePlan", feePlanSchema);

export default FeePlan;
