
import mongoose from "mongoose";

const testScoreSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    testName: {
      type: String,
      required: true,
      trim: true,
    },

    subject: {
      type: String,
      trim: true,
    },

    score: {
      type: Number,
      required: true,
      min: 0,
    },

    maximumScore: {
      type: Number,
      required: true,
      min: 1,
    },

    testDate: {
      type: Date,
      required: true,
    },

    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

testScoreSchema.index({ student: 1, testDate: 1 });

const TestScore = mongoose.model("TestScore", testScoreSchema);

export default TestScore;
