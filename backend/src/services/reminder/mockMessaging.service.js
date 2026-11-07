import { formatRupees } from "../../utils/money.js";

const templates = {
  ENGLISH: {
    BEFORE_7_DAYS: "Your fee instalment is due in 7 days.",
    BEFORE_3_DAYS: "Your fee instalment is due in 3 days.",
    DUE_TODAY: "Your fee instalment is due today.",
    OVERDUE: "Your fee instalment is overdue. Please make the payment.",
    FOLLOW_UP: "This is a reminder about your pending fee instalment.",
  },

  HINDI: {
    BEFORE_7_DAYS: "आपकी फीस की किस्त 7 दिनों में देय है।",
    BEFORE_3_DAYS: "आपकी फीस की किस्त 3 दिनों में देय है।",
    DUE_TODAY: "आपकी फीस की किस्त आज देय है।",
    OVERDUE: "आपकी फीस की किस्त की अंतिम तिथि निकल चुकी है। कृपया भुगतान करें।",
    FOLLOW_UP: "यह आपकी बकाया फीस की किस्त के लिए एक रिमाइंडर है।",
  },
};

const sendMockMessage = ({ language, type, balancePaise }) => {
const template = templates[language]?.[type];

if (!template) {
  throw new Error("Unsupported reminder language or type");
}

const message = `${template} Outstanding amount: ${formatRupees(balancePaise)}`;

  if (!message) {
    throw new Error("Unsupported reminder language or type");
  }

  return {
    success: true,
    message,
    sentAt: new Date(),
  };
};

export { sendMockMessage };
