
import { randomInt } from "crypto";
import User from "../../models/User.js";
import { generateAccessToken } from "../../utils/token.js";

// Temporary in-memory OTP storage
const otpStore = new Map();

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const CONSENT_OTP_FRESHNESS_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_ACTIVE_OTP_RECORDS = 10000;

const normalizePhone = (phone) => phone.replace(/\D/g, "");

const isDemoOtpEnabled = () =>
  process.env.NODE_ENV === "development" &&
  process.env.DEMO_OTP_ENABLED === "true";

const isAllowlistedDemoPhone = (phone) => {
  const allowlist = (process.env.DEMO_PARENT_PHONES || "")
    .split(",")
    .map(normalizePhone)
    .filter(Boolean);
  return allowlist.includes(normalizePhone(phone));
};

const requestParentOtp = async (phone) => {
  if (process.env.NODE_ENV === "production") {
    const unavailable = new Error("Parent OTP delivery is not configured");
    unavailable.statusCode = 503;
    throw unavailable;
  }
  if (!phone || typeof phone !== "string") {
    throw new Error("Valid phone number is required");
  }

  const normalizedPhone = normalizePhone(phone);

  if (!/^\d{10}$/.test(normalizedPhone)) {
    throw new Error("Enter a valid 10-digit phone number");
  }

  const user = await User.findOne({
    phone: normalizedPhone,
    role: "PARENT",
    isActive: true,
  });

  const demoAccount = isDemoOtpEnabled() &&
    isAllowlistedDemoPhone(normalizedPhone) &&
    user?.email?.toLowerCase().endsWith("@example.test");
  if (!demoAccount) {
    return { message: "If this number is linked to an eligible parent account, a code is available." };
  }

  const now = Date.now();
  for (const [key, active] of otpStore) {
    if (active.expiresAt <= now) otpStore.delete(key);
  }
  if (!otpStore.has(normalizedPhone) && otpStore.size >= MAX_ACTIVE_OTP_RECORDS) {
    const limited = new Error("OTP service is busy. Please try again later.");
    limited.statusCode = 429;
    throw limited;
  }

  const existingOtp = otpStore.get(normalizedPhone);

  if (
    existingOtp &&
    now - existingOtp.requestedAt < 60 * 1000
  ) {
    throw new Error("Please wait 60 seconds before requesting another OTP");
  }

  const otp = randomInt(100000, 1000000).toString();

  otpStore.set(normalizedPhone, {
    otp,
    expiresAt: now + OTP_EXPIRY_MS,
    requestedAt: now,
    attempts: 0,
  });

  return { message: "Development OTP generated.", devOtp: otp };
};

const verifyParentOtp = async ({ phone, otp }) => {
  if (process.env.NODE_ENV === "production") {
    const unavailable = new Error("Parent OTP verification is not configured");
    unavailable.statusCode = 503;
    throw unavailable;
  }
  if (!phone || !otp) {
    throw new Error("Phone and OTP are required");
  }

  const normalizedPhone = normalizePhone(phone);
  if (!isDemoOtpEnabled() || !isAllowlistedDemoPhone(normalizedPhone)) {
    throw new Error("Demo OTP is not enabled for this account");
  }
  const stored = otpStore.get(normalizedPhone);

  if (!stored) {
    throw new Error("OTP not found. Request a new OTP.");
  }

  if (Date.now() > stored.expiresAt) {
    otpStore.delete(normalizedPhone);
    throw new Error("OTP expired. Request a new OTP.");
  }

  if (stored.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(normalizedPhone);
    throw new Error("Too many attempts. Request a new OTP.");
  }

  if (stored.otp !== String(otp).trim()) {
    stored.attempts += 1;
    throw new Error("Invalid OTP");
  }

  otpStore.delete(normalizedPhone);

  const user = await User.findOne({
    phone: normalizedPhone,
    role: "PARENT",
    isActive: true,
  });

  if (!user || !user.email?.toLowerCase().endsWith("@example.test")) {
    throw new Error("Parent account not found");
  }

  return {
    accessToken: generateAccessToken(user, {
      authMethod: "PARENT_OTP",
      otpVerifiedAt: Date.now(),
    }),
    user: {
      id: user._id,
      name: user.name,
      phone: user.phone,
      role: user.role,
    },
  };
};

export { requestParentOtp, verifyParentOtp, CONSENT_OTP_FRESHNESS_MS };
