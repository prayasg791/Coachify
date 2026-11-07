const withProductionConsentGuard = (filter, environment = process.env) => ({
  ...filter,
  ...(environment.NODE_ENV === "production"
    ? { isDemoConsent: { $ne: true } }
    : {}),
});

export { withProductionConsentGuard };
