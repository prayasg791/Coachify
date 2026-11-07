
import Student from "../../models/Student.js";
import Instalment from "../../models/Instalment.js";
import Attendance from "../../models/Attendance.js";
import TestScore from "../../models/TestScore.js";
import RiskFlag from "../../models/RiskFlag.js";
import { getInstalmentSummary } from "../fee/fee.service.js";

const analyzeStudentRisk = async (studentId) => {
  const student = await Student.findById(studentId);

  if (!student) {
    throw new Error("Student not found");
  }

  const today = new Date();

  // 1. Check overdue instalments
  const overdueInstalments = await Instalment.find({
    student: studentId,
    dueDate: { $lt: today },
  });

  const summaries = await Promise.all(
    overdueInstalments.map((item) =>
      getInstalmentSummary(item._id)
    )
  );

  const missedInstalments = summaries.filter(
    (item) => item.balancePaise > 0
  ).length;

  // 2. Calculate attendance percentage (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const attendanceRecords = await Attendance.find({
    student: studentId,
    date: { $gte: thirtyDaysAgo, $lte: today },
    status: { $in: ["PRESENT", "ABSENT"] },
  });

  const totalClasses = attendanceRecords.length;

  const presentClasses = attendanceRecords.filter(
    (item) => item.status === "PRESENT"
  ).length;

  const attendancePercentage = totalClasses > 0
    ? (presentClasses / totalClasses) * 100
    : null;

  // 3. Analyze recent test-score trend
  const tests = await TestScore.find({ student: studentId })
    .sort({ testDate: -1 })
    .limit(6);

  let testScoreTrend = "INSUFFICIENT_DATA";

  if (tests.length >= 4) {
    const percentages = tests.map(
      (test) => (test.score / test.maximumScore) * 100
    );

    const recentAverage =
      percentages.slice(0, 3).reduce((a, b) => a + b, 0) / 3;

    const olderAverage =
      percentages.slice(3).reduce((a, b) => a + b, 0) /
      percentages.slice(3).length;

    const difference = recentAverage - olderAverage;

    if (difference < -10) {
      testScoreTrend = "DECLINING";
    } else if (difference > 10) {
      testScoreTrend = "IMPROVING";
    } else {
      testScoreTrend = "STABLE";
    }
  }

  // 4. Calculate risk score
  let score = 0;
  const reasons = [];

  if (missedInstalments >= 2) {
    score += 2;
    reasons.push("Multiple overdue fee instalments");
  } else if (missedInstalments === 1) {
    score += 1;
    reasons.push("An overdue fee instalment");
  }

  if (attendancePercentage !== null && attendancePercentage < 75) {
    score += 2;
    reasons.push("Low attendance");
  }

  if (testScoreTrend === "DECLINING") {
    score += 2;
    reasons.push("Declining test performance");
  }

  const riskLevel =
    score >= 4 ? "HIGH" :
    score >= 2 ? "MEDIUM" : "LOW";

  if (reasons.length === 0) {
    reasons.push("No significant risk signals detected");
  }

  // 5. Create or update the student's open risk flag
  const riskFlag = await RiskFlag.findOneAndUpdate(
    {
      student: studentId,
      status: "OPEN",
    },
    {
      $set: {
        riskLevel,
        followUpRequired: riskLevel !== "LOW",
        confidence: null,
        reasons,
        signals: {
          attendancePercentage,
          missedInstalments,
          testScoreTrend,
        },
        analysisSource: "RULES_FALLBACK",
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  return riskFlag;
};

export { analyzeStudentRisk };
