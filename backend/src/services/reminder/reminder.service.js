
import Reminder from "../../models/Reminder.js";

const cancelInstalmentReminders = async (instalmentId, session) => {
  const result = await Reminder.updateMany(
    {
      instalment: instalmentId,
      status: "SCHEDULED",
    },
    {
      $set: {
        status: "CANCELLED",
      },
    },
    { session }
  );

  return result.modifiedCount;
};

export { cancelInstalmentReminders };
