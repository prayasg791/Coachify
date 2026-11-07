
import bcrypt from "bcryptjs";
import User from "../../models/User.js";
import { generateAccessToken } from "../../utils/token.js";

const loginStaff = async ({ email, password, role }) => {
  if (typeof email !== "string" || typeof password !== "string" ||
      !email.trim() || !password) {
    throw new Error("Email and password are required");
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = await User.findOne({
    email: normalizedEmail,
    role,
    isActive: true,
  }).select("+password");

  if (!user) {
    throw new Error("Invalid email or password");
  }

  const isPasswordValid = await bcrypt.compare(
    password,
    user.password
  );

  if (!isPasswordValid) {
    throw new Error("Invalid email or password");
  }

  const accessToken = generateAccessToken(user);

  return {
    accessToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      centres: user.centres,
    },
  };
};

const loginAccounts = ({ email, password }) =>
  loginStaff({ email, password, role: "ACCOUNTS" });

const loginCounsellor = ({ email, password }) =>
  loginStaff({ email, password, role: "COUNSELLOR" });

export { loginAccounts, loginCounsellor };
