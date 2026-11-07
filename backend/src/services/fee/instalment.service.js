
const generateInstalments = ({
  feePlanId,
  studentId,
  finalPayablePaise,
  instalments,
}) => {
  if (!Number.isSafeInteger(finalPayablePaise) || finalPayablePaise < 0) {
    throw new Error("Invalid final payable amount");
  }

  if (!Array.isArray(instalments) || instalments.length === 0) {
    throw new Error("At least one instalment is required");
  }

  const totalInstalmentAmount = instalments.reduce(
    (sum, item) => {
      if (
        !Number.isSafeInteger(item.amountPaise) ||
        item.amountPaise < 0
      ) {
        throw new Error("Invalid instalment amount");
      }

      return sum + item.amountPaise;
    },
    0
  );

  if (totalInstalmentAmount !== finalPayablePaise) {
    throw new Error(
      "Total instalment amount must equal final payable fee"
    );
  }

  return instalments.map((item, index) => {
    if (!item.dueDate || Number.isNaN(new Date(item.dueDate).getTime())) {
      throw new Error("Invalid instalment due date");
    }

    return {
      feePlan: feePlanId,
      student: studentId,
      instalmentNumber: index + 1,
      amountPaise: item.amountPaise,
      dueDate: new Date(item.dueDate),
    };
  });
};

export { generateInstalments };

