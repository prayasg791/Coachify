
import Instalment from "../../models/Instalment.js";
import Payment from "../../models/Payment.js";

const getInstalmentSummary = async (instalmentId) => {
  const instalment = await Instalment.findById(instalmentId);

  if (!instalment) {
    throw new Error("Instalment not found");
  }

  // Calculate total successful payments
  const paymentSummary = await Payment.aggregate([
    {
      $match: {
        instalment: instalment._id,
        status: "SUCCESS",
      },
    },
    {
      $group: {
        _id: null,
        totalPaid: { $sum: "$amountPaise" },
      },
    },
  ]);

  const totalPaidPaise = paymentSummary[0]?.totalPaid || 0;

  const balancePaise =
    instalment.amountPaise - totalPaidPaise;

  // Derive payment status
  let paymentStatus;

  if (balancePaise === 0) {
    paymentStatus = "PAID";
  } else if (totalPaidPaise > 0) {
    paymentStatus = "PARTIALLY_PAID";
  } else {
    paymentStatus = "UNPAID";
  }

  // Calculate due status
  const today = new Date();

  const todayUTC = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );

  const dueDate = new Date(instalment.dueDate);

  const dueDateUTC = Date.UTC(
    dueDate.getUTCFullYear(),
    dueDate.getUTCMonth(),
    dueDate.getUTCDate()
  );

  const daysOverdue = Math.max(
    0,
    Math.floor((todayUTC - dueDateUTC) / 86400000)
  );

  let dueStatus;

  if (paymentStatus === "PAID") {
    dueStatus = "SETTLED";
  } else if (daysOverdue > 0) {
    dueStatus = "OVERDUE";
  } else if (todayUTC === dueDateUTC) {
    dueStatus = "DUE_TODAY";
  } else {
    dueStatus = "UPCOMING";
  }

  return {
    instalmentId: instalment._id,
    amountPaise: instalment.amountPaise,
    totalPaidPaise,
    balancePaise,
    paymentStatus,
    dueStatus,
    daysOverdue,
  };
};

export { getInstalmentSummary };
