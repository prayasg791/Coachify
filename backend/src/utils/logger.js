const safeErrorDetails = (error) => ({
  name: typeof error?.name === "string" ? error.name : "Error",
  ...(typeof error?.code === "string" || typeof error?.code === "number" ? { code: error.code } : {}),
  ...(Number.isInteger(error?.statusCode) ? { statusCode: error.statusCode } : {}),
});

export const logError = (context, error) => {
  console.error(context, safeErrorDetails(error));
};
