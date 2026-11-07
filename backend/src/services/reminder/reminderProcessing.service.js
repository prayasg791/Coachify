import Reminder from "../../models/Reminder.js";
import { sendMockMessage } from "./mockMessaging.service.js";
import { getInstalmentSummary } from "../fee/fee.service.js";

const processReminder = async (reminderId) => {
const reminder = await Reminder.findOneAndUpdate(
  {
    _id: reminderId,
    status: "SCHEDULED",
    scheduledAt: { $lte: new Date() },
  },
  {
    $set: { status: "PROCESSING" },
  },
  { new: true }
);

  if (!reminder) {
    return { success: false, message: "Reminder unavailable or already processed" };
  }

  try {
    const summary = await getInstalmentSummary(reminder.instalment);

    // Stop if the instalment is already fully paid.
    if (summary.paymentStatus === "PAID") {
      reminder.status = "CANCELLED";
      await reminder.save();

      return { success: true, message: "Reminder cancelled: instalment paid" };
    }

    const result = sendMockMessage({
      language: reminder.language,
      type: reminder.type,
      balancePaise: summary.balancePaise,
    });

    reminder.status = "SENT";
    reminder.sentAt = result.sentAt;
    await reminder.save();

    return { success: true, message: "Reminder sent" };
  } catch (error) {
    reminder.status = "FAILED";
    await reminder.save();

    throw error;
  }
};

export { processReminder };
