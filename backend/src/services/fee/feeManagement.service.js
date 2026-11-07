
import mongoose from "mongoose";
import Student from "../../models/Student.js";
import FeePlan from "../../models/FeePlan.js";
import AuditLog from "../../models/AuditLog.js";
import { calculateFeePlan } from "./feePlan.service.js";
import { generateInstalments } from "./instalment.service.js";
import Instalment from "../../models/Instalment.js";

const createStudentFeePlan = async ({
  studentId,
  accountUser,
  totalCourseFeePaise,
  discountType,
  discountValue,
  instalments,
}) => {
  const student = await Student.findById(studentId);

  if (!student) {
    throw new Error("Student not found");
  }

  // Accounts users can manage only their assigned centres.
  const hasCentreAccess = accountUser.centres.some(
    (centreId) => centreId.toString() === student.centre.toString()
  );

  if (!hasCentreAccess) {
    throw new Error("You cannot manage students at this centre");
  }

  if (await FeePlan.exists({ student: studentId })) {
    throw new Error("Student already has a fee plan");
  }

  const calculated = calculateFeePlan({
    totalCourseFeePaise,
    discountType,
    discountValue,
  });

  const session = await mongoose.startSession();

  try {
    let createdPlan;
    let createdInstalments;

    await session.withTransaction(async () => {
      const [feePlan] = await FeePlan.create(
        [{
          student: studentId,
          ...calculated,
          discountType,
          discountValue,
        }],
        { session }
      );

      const instalmentData = generateInstalments({
        feePlanId: feePlan._id,
        studentId,
        finalPayablePaise: calculated.finalPayablePaise,
        instalments,
      });

      createdInstalments = await Instalment.insertMany(
        instalmentData,
        { session }
      );

      await AuditLog.create(
        [{
          actor: accountUser._id,
          actorType: "USER",
          action: "FEE_PLAN_CREATED",
          entityType: "FeePlan",
          entityId: feePlan._id,
          details: {
            studentId,
            finalPayablePaise: calculated.finalPayablePaise,
          },
        }],
        { session }
      );

      createdPlan = feePlan;
    });

    return {
      feePlan: createdPlan,
      instalments: createdInstalments,
    };
  } finally {
    await session.endSession();
  }
};

export { createStudentFeePlan };
