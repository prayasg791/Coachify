
import mongoose from "mongoose";

const instalmentSchema = new mongoose.Schema(
    {
        feePlan: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "FeePlan",
            required: true,
        },

        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Student",
            required: true,
        },

        instalmentNumber: {
            type: Number,
            required: true,
            min: 1,
        },

        amountPaise: {
            type: Number,
            required: true,
            min: 0,
            validate: {
                validator: Number.isSafeInteger,
                message: "Amount must be an integer in paise",
            },
        },

        dueDate: {
            type: Date,
            required: true,
        },
    },
    { timestamps: true }
);

instalmentSchema.index(
    { feePlan: 1, instalmentNumber: 1 },
    { unique: true }
);

const Instalment = mongoose.model("Instalment", instalmentSchema);

export default Instalment;
