
const calculateRefund = ({
  eligiblePaidFeesPaise,
  courseStartDate,
  courseEndDate,
  withdrawalDate,
}) => {
  if (
    !Number.isSafeInteger(eligiblePaidFeesPaise) ||
    eligiblePaidFeesPaise < 0
  ) {
    throw new Error("Invalid eligible paid fees");
  }

  const start = new Date(courseStartDate);
  const end = new Date(courseEndDate);
  const withdrawal = new Date(withdrawalDate);

  if (
    [start, end, withdrawal].some(
      (date) => Number.isNaN(date.getTime())
    )
  ) {
    throw new Error("Invalid course or withdrawal date");
  }

  const toUTCDay = (date) =>
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    );

  const totalCourseDays = Math.floor(
    (toUTCDay(end) - toUTCDay(start)) / 86400000
  );

  if (totalCourseDays <= 0) {
    throw new Error("Invalid course duration");
  }

  if (toUTCDay(withdrawal) < toUTCDay(start) ||
      toUTCDay(withdrawal) > toUTCDay(end)) {
    throw new Error("Withdrawal date must be within course dates");
  }

  const elapsedDays = Math.floor(
    (toUTCDay(withdrawal) - toUTCDay(start)) / 86400000
  );

  const unusedCourseDays = totalCourseDays - elapsedDays;

  const refundAmountPaise = Number(
    (
      (BigInt(eligiblePaidFeesPaise) * BigInt(unusedCourseDays) +
        BigInt(Math.floor(totalCourseDays / 2))) /
      BigInt(totalCourseDays)
    )
  );

  return {
    eligibleAmountPaise: eligiblePaidFeesPaise,
    totalCourseDays,
    unusedCourseDays,
    refundAmountPaise,
  };
};

export { calculateRefund };
