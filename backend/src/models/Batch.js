
import mongoose from "mongoose";

const batchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    course: {
      type: String,
      enum: ["JEE", "NEET"],
      required: true,
    },

    shift: {
      type: String,
      enum: ["MORNING", "EVENING"],
      required: true,
    },

    centre: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Centre",
      required: true,
    },

    academicYear: {
      type: String,
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const Batch = mongoose.model("Batch", batchSchema);

export default Batch;
