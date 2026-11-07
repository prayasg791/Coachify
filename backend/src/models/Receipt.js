import mongoose from "mongoose";

const receiptSchema = new mongoose.Schema({
  receiptNumber: { type: String, required: true, unique: true },
  issueDate: { type: Date, required: true },
  institute: { name: { type: String, required: true }, address: { type: String, required: true } },
  student: { id: { type: mongoose.Schema.Types.ObjectId, required: true }, studentId: { type: String, required: true }, name: { type: String, required: true } },
  centre: { id: { type: mongoose.Schema.Types.ObjectId, required: true }, name: { type: String, required: true } },
  batch: { id: { type: mongoose.Schema.Types.ObjectId, default: null }, name: { type: String, default: "" }, course: { type: String, default: "" }, academicYear: { type: String, default: "" } },
  instalment: { id: { type: mongoose.Schema.Types.ObjectId, required: true }, number: { type: Number, required: true }, dueDate: { type: Date, required: true }, amountPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger } },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true, unique: true },
  paymentDate: { type: Date, required: true },
  paymentMethod: { type: String, required: true },
  transactionId: { type: String, default: "" },
  amountPaidPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  gstConfiguration: { taxability: { type: String, required: true }, rateBps: { type: Number, default: null }, treatment: { type: String, default: null } },
  gstBreakdown: { taxableBasePaise: { type: Number, default: null, validate: (value) => value == null || Number.isSafeInteger(value) }, gstAmountPaise: { type: Number, default: null, validate: (value) => value == null || Number.isSafeInteger(value) }, grossAmountPaise: { type: Number, default: null, validate: (value) => value == null || Number.isSafeInteger(value) } },
}, { timestamps: true });

receiptSchema.index({ "student.id": 1, issueDate: -1, _id: -1 });
receiptSchema.index({ "centre.id": 1, issueDate: -1, _id: -1 });
export default mongoose.model("Receipt", receiptSchema);
