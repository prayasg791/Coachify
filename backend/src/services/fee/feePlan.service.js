
const calculateFeePlan = ({
  totalCourseFeePaise,
  discountType,
  discountValue,
}) => {
  if (!Number.isSafeInteger(totalCourseFeePaise) || totalCourseFeePaise <= 0) {
    throw new Error("Invalid course fee");
  }

  if (!Number.isFinite(discountValue) || discountValue < 0) {
    throw new Error("Invalid discount value");
  }

  let discountAmountPaise;

  if (discountType === "FIXED") {
    if (!Number.isSafeInteger(discountValue)) {
      throw new Error("Fixed discount must be in paise");
    }

    discountAmountPaise = discountValue;
  } else if (discountType === "PERCENTAGE") {
    if (discountValue > 100) {
      throw new Error("Discount cannot exceed 100%");
    }

    discountAmountPaise = Math.round(
      (totalCourseFeePaise * discountValue) / 100
    );
  } else {
    throw new Error("Invalid discount type");
  }

  if (discountAmountPaise > totalCourseFeePaise) {
    throw new Error("Discount cannot exceed course fee");
  }

  return {
    totalCourseFeePaise,
    discountType,
    discountValue,
    discountAmountPaise,
    finalPayablePaise:
      totalCourseFeePaise - discountAmountPaise,
  };
};

export { calculateFeePlan };
