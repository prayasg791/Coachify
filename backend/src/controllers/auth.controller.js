
import { loginAccounts, loginCounsellor } from "../services/auth/auth.service.js";
import { logError } from "../utils/logger.js";

const accountsLogin = async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string" ||
        !email.trim() || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const result = await loginAccounts({ email, password });

    return res.status(200).json({
      message: "Login successful",
      ...result,
    });
  } catch (error) {
    if (
      error.message === "Invalid email or password"
    ) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    logError("Accounts login failed", error);

    return res.status(500).json({
      message: "Login failed due to a server error",
    });
  }
};

const counsellorLogin = async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string" ||
        !email.trim() || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const result = await loginCounsellor({ email, password });

    return res.status(200).json({
      message: "Login successful",
      ...result,
    });
  } catch (error) {
    if (error.message === "Invalid email or password") {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    logError("Counsellor login failed", error);

    return res.status(500).json({
      message: "Login failed due to a server error",
    });
  }
};

export { accountsLogin, counsellorLogin };
