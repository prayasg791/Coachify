
import Reminder from "../../models/Reminder.js";

const generateReminderSchedule = ({
  studentId,
  instalmentId,
  dueDate,
  language = "ENGLISH",
}) => {
  const due = new Date(dueDate);

  if (Number.isNaN(due.getTime())) {
    throw new Error("Invalid due date");
  }

  const reminders = [];

  const schedule = [
    { days: -7, type: "BEFORE_7_DAYS" },
    { days: -3, type: "BEFORE_3_DAYS" },
    { days: 0, type: "DUE_TODAY" },
    { days: 3, type: "OVERDUE" },
  ];

  for (const item of schedule) {
    const scheduledAt = new Date(due);
    scheduledAt.setDate(scheduledAt.getDate() + item.days);

    reminders.push({
      student: studentId,
      instalment: instalmentId,
      type: item.type,
      language,
      scheduledAt,
      status: "SCHEDULED",
      message: "Fee payment reminder",
    });
  }

  // Follow-up reminders every 7 days for 8 weeks
  for (let day = 10; day <= 59; day += 7) {
    const scheduledAt = new Date(due);
    scheduledAt.setDate(scheduledAt.getDate() + day);

    reminders.push({
      student: studentId,
      instalment: instalmentId,
      type: "FOLLOW_UP",
      language,
      scheduledAt,
      status: "SCHEDULED",
      message: "Overdue fee payment follow-up",
    });
  }

  return reminders;
};

const createReminderSchedule = async (data) => {
  const reminders = generateReminderSchedule(data);

  return await Reminder.insertMany(reminders, {
    ordered: false,
  });
};

export { createReminderSchedule ,generateReminderSchedule};

