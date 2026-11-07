
import mongoose from "mongoose";

const studentSchema = new mongoose.Schema(
  {
    studentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    centre: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Centre",
      required: true,
    },

    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },

    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    courseStartDate: {
      type: Date,
      required: true,
    },

    courseEndDate: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "WITHDRAWN", "COMPLETED"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

studentSchema.index({ centre: 1, name: 1, _id: 1 });
studentSchema.index({ centre: 1, batch: 1, name: 1, _id: 1 });

const Student = mongoose.model("Student", studentSchema);

export default Student;
