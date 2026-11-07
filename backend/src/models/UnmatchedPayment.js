import mongoose from "mongoose";

const unmatchedPaymentSchema = new mongoose.Schema({
  transactionId: { type: String, required: true, trim: true, maxlength: 100, unique: true },
  amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  paymentMethod: { type: String, enum: ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"], required: true },
  paymentDate: { type: Date, required: true },
  centre: { type: mongoose.Schema.Types.ObjectId, ref: "Centre", required: true, index: true },
  payerDetails: { type: String, trim: true, maxlength: 500, default: "" },
  status: { type: String, enum: ["UNMATCHED", "MATCHED", "REJECTED"], default: "UNMATCHED", index: true },
  reviewNotes: { type: String, trim: true, maxlength: 1000, default: "" },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
  matchedStudent: { type: mongoose.Schema.Types.ObjectId, ref: "Student", default: null },
  matchedInstalment: { type: mongoose.Schema.Types.ObjectId, ref: "Instalment", default: null },
  matchedPayment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null },
}, { timestamps: true });

unmatchedPaymentSchema.index({ centre: 1, status: 1, createdAt: -1, _id: -1 });
const UnmatchedPayment = mongoose.model("UnmatchedPayment", unmatchedPaymentSchema);
export default UnmatchedPayment;
