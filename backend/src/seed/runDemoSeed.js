import { seedDemoData } from "./demoSeed.js";
import { logError } from "../utils/logger.js";

seedDemoData().catch((error) => {
  logError("Demo seed failed", error);
  process.exitCode = 1;
});
