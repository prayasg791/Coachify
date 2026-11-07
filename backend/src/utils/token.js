
import jwt from "jsonwebtoken";

const generateAccessToken = (user, additionalClaims = {}) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    { sub: user._id.toString(), ...additionalClaims },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
};

export { generateAccessToken };

