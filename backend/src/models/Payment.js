
import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
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



amountPaise: {
  type: Number,
  required: true,
  min: 1,
  validate: {
    validator: Number.isSafeInteger,
    message: "Amount must be an integer in paise",
  },
},


    
    paymentMethod: {
      type: String,
      enum: ["GATEWAY", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE"],
      required: true,
    },

    transactionId: {
      type: String,
      unique: true,
      sparse: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
    },

    paidAt: {
      type: Date,
      default: null,
    },

    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

paymentSchema.index({ instalment: 1, status: 1 });
paymentSchema.index({ status: 1, paidAt: 1 });
paymentSchema.index({ student: 1, status: 1, paidAt: -1, _id: -1 });

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
