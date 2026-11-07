import Student from "../../models/Student.js";
import FeePlan from "../../models/FeePlan.js";
import Instalment from "../../models/Instalment.js";
import Payment from "../../models/Payment.js";
import { getInstalmentSummary } from "./fee.service.js";

const createError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getReferenceDetails = (reference) => {
  if (!reference) {
    return null;
  }

  return {
    id: reference._id,
    name: reference.name,
    ...(reference.code ? { code: reference.code } : {}),
    ...(reference.course ? { course: reference.course } : {}),
    ...(reference.academicYear
      ? { academicYear: reference.academicYear }
      : {}),
  };
};

const getStudentFeeLedger = async ({ studentId, user }) => {
  const student = await Student.findById(studentId)
    .select(
      "studentId name centre batch parent status courseStartDate courseEndDate"
    )
    .populate({ path: "centre", select: "name code" })
    .populate({ path: "batch", select: "name course academicYear" });

  if (!student) {
    throw createError("Student not found", 404);
  }

  if (user.role === "ACCOUNTS") {
    const hasCentreAccess = user.centres?.some(
      (centreId) => centreId.toString() === student.centre?._id?.toString()
    );

    if (!hasCentreAccess) {
      throw createError("You cannot access students at this centre", 403);
    }
  } else if (
    user.role !== "PARENT" ||
    student.parent?.toString() !== user._id.toString()
  ) {
    throw createError("You are not authorized to access this fee ledger", 403);
  }

  const feePlan = await FeePlan.findOne({ student: student._id });

  if (!feePlan) {
    throw createError("Fee plan not found for student", 404);
  }

  const instalments = await Instalment.find({ student: student._id })
    .sort({ instalmentNumber: 1 });

  const [summaries, successfulPayments] = await Promise.all([
    Promise.all(
      instalments.map((instalment) =>
        getInstalmentSummary(instalment._id)
      )
    ),
    Payment.find({
      student: student._id,
      status: "SUCCESS",
    })
      .select("instalment amountPaise paymentMethod transactionId paidAt")
      .sort({ paidAt: 1, _id: 1 }),
  ]);

  const summaryByInstalment = new Map(
    summaries.map((summary) => [summary.instalmentId.toString(), summary])
  );

  const paymentHistory = successfulPayments.map((payment) => ({
    id: payment._id,
    instalmentId: payment.instalment,
    amountPaise: payment.amountPaise,
    paymentMethod: payment.paymentMethod,
    transactionId: payment.transactionId,
    paidAt: payment.paidAt,
  }));

  const ledgerInstalments = instalments.map((instalment) => {
    const summary = summaryByInstalment.get(instalment._id.toString());

    return {
      id: instalment._id,
      instalmentNumber: instalment.instalmentNumber,
      amountPaise: instalment.amountPaise,
      dueDate: instalment.dueDate,
      amountPaidPaise: summary.totalPaidPaise,
      remainingBalancePaise: summary.balancePaise,
      paymentStatus: summary.paymentStatus,
      dueStatus: summary.dueStatus,
      daysOverdue: summary.daysOverdue,
    };
  });

  const totalPaidPaise = summaries.reduce(
    (total, summary) => total + summary.totalPaidPaise,
    0
  );
  const remainingBalancePaise = summaries.reduce(
    (total, summary) => total + summary.balancePaise,
    0
  );

  return {
    student: {
      id: student._id,
      studentId: student.studentId,
      name: student.name,
      status: student.status,
      courseStartDate: student.courseStartDate,
      courseEndDate: student.courseEndDate,
      centre: getReferenceDetails(student.centre),
      batch: getReferenceDetails(student.batch),
    },
    feePlan: {
      id: feePlan._id,
      status: feePlan.status,
      totalCourseFeePaise: feePlan.totalCourseFeePaise,
      discountType: feePlan.discountType,
      discountValue: feePlan.discountValue,
      discountAmountPaise: feePlan.discountAmountPaise,
      finalPayablePaise: feePlan.finalPayablePaise,
    },
    totals: {
      totalCourseFeePaise: feePlan.totalCourseFeePaise,
      discountAmountPaise: feePlan.discountAmountPaise,
      finalPayablePaise: feePlan.finalPayablePaise,
      amountPaidPaise: totalPaidPaise,
      remainingBalancePaise,
    },
    instalments: ledgerInstalments,
    paymentHistory,
  };
};

export { getStudentFeeLedger };
