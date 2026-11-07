
import mongoose from "mongoose";

const reminderSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    instalment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Instalment",
      required: true,
    },

    type: {
      type: String,
      enum: [
        "BEFORE_7_DAYS",
        "BEFORE_3_DAYS",
        "DUE_TODAY",
        "OVERDUE",
        "FOLLOW_UP",
      ],
      required: true,
    },

    language: {
      type: String,
      enum: ["ENGLISH", "HINDI"],
      default: "ENGLISH",
    },

    scheduledAt: {
      type: Date,
      required: true,
    },

    sentAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
     enum: [
  "SCHEDULED",
  "PROCESSING",
  "SENT",
  "CANCELLED",
  "FAILED"
],
      default: "SCHEDULED",
    },

    message: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);


reminderSchema.index(
  { instalment: 1, type: 1, scheduledAt: 1 },
  { unique: true }
);
reminderSchema.index({ student: 1, scheduledAt: -1, _id: -1 });
  
const Reminder = mongoose.model("Reminder", reminderSchema);
export default Reminder;
