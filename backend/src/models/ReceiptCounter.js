import mongoose from "mongoose";
const schema = new mongoose.Schema({ _id: String, sequence: { type: Number, required: true, default: 0 } });
export default mongoose.model("ReceiptCounter", schema);
