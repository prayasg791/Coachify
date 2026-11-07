
export const rupeesToPaise = (rupees) => {
  if (!Number.isFinite(rupees) || rupees < 0) {
    throw new Error("Invalid rupee amount");
  }

  return Math.round(rupees * 100);
};

export const paiseToRupees = (paise) => {
  if (!Number.isSafeInteger(paise) || paise < 0) {
    throw new Error("Invalid paise amount");
  }

  return paise / 100;
};

export const formatRupees = (paise) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paiseToRupees(paise));
};
