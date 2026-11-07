import cron from "node-cron";
import Reminder from "../models/Reminder.js";
import { processReminder } from "../services/reminder/reminderProcessing.service.js";
import { logError } from "../utils/logger.js";

let scheduledTask = null;

const startReminderJob = () => {
  if (process.env.NODE_ENV === "production") {
    console.warn("Reminder scheduler is disabled: no production messaging provider is configured.");
    return null;
  }
  if (scheduledTask) return scheduledTask;

  scheduledTask = cron.schedule("* * * * *", async () => {

    try {
      const reminders = await Reminder.find({
        status: "SCHEDULED",
        scheduledAt: { $lte: new Date() },
      }).select("_id");

      for (const reminder of reminders) {
        try {
          await processReminder(reminder._id);
        } catch (error) {
          logError("Reminder processing failed", error);
        }
      }
    } catch (error) {
      logError("Reminder job failed", error);
    }
  });

  console.log("Development reminder scheduler started.");
  return scheduledTask;
};

const stopReminderJob = () => {
  scheduledTask?.stop();
  scheduledTask = null;
};

export { startReminderJob, stopReminderJob };
