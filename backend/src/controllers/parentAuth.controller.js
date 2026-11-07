
import {
  requestParentOtp,
  verifyParentOtp,
} from "../services/auth/otp.service.js";

const sendOtp = async (req, res) => {
  try {
    const result = await requestParentOtp(req.body.phone);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const result = await verifyParentOtp(req.body);

    return res.status(200).json({
      message: "Parent login successful",
      ...result,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message });
  }
};

export { sendOtp, verifyOtp };
