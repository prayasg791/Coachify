import { getAccountsReminders, getParentReminders } from "../services/reminder/reminderRead.service.js";
import { logError } from "../utils/logger.js";

const sendReminderPage = async (res, operation, message) => {
  try {
    const page = await operation();
    return res.status(200).json({ success: true, ...page });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    logError(message, error);
    return res.status(500).json({ success: false, message: "Unable to retrieve reminders" });
  }
};

const getParentRemindersController = (req, res) => sendReminderPage(
  res,
  () => getParentReminders({ user: req.user, filters: req.query }),
  "Parent reminder retrieval error:",
);

const getAccountsRemindersController = (req, res) => sendReminderPage(
  res,
  () => getAccountsReminders({ user: req.user, filters: req.query }),
  "Accounts reminder retrieval error:",
);

export { getParentRemindersController, getAccountsRemindersController };
