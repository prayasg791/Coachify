import mongoose from "mongoose";

let connectionPromise;

const connectDB = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  if (mongoose.connection.readyState === 1) return mongoose;
  if (mongoose.connection.readyState !== 2 || !connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGO_URI).catch((error) => {
      connectionPromise = undefined;
      throw error;
    });
  }
  await connectionPromise;
  return mongoose;
};

export default connectDB;
