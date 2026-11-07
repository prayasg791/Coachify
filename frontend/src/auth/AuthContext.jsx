import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { accountsLogin, api, counsellorLogin, requestParentOtp, verifyParentOtp } from "./api.js";

const STORAGE_KEY = "coachify.auth";
const AuthContext = createContext(null);

function readSession() {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const session = JSON.parse(stored);
    if (typeof session.accessToken !== "string" || !session.user?.role) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession);

  useEffect(() => {
    if (session?.accessToken) {
      api.defaults.headers.common.Authorization = `Bearer ${session.accessToken}`;
    } else {
      delete api.defaults.headers.common.Authorization;
    }
  }, [session?.accessToken]);

  const acceptSession = useCallback((result) => {
    if (!result?.accessToken || !result?.user?.role) {
      throw new Error("The server returned an incomplete sign-in response.");
    }
    const nextSession = { accessToken: result.accessToken, user: result.user };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  }, []);

  const signInAccounts = useCallback(async (credentials) => {
    const result = await accountsLogin(credentials);
    acceptSession(result);
    return result.user;
  }, [acceptSession]);

  const signInCounsellor = useCallback(async (credentials) => {
    const result = await counsellorLogin(credentials);
    if (result?.user?.role !== "COUNSELLOR") {
      throw new Error("The server returned an invalid counsellor sign-in response.");
    }
    acceptSession(result);
    return result.user;
  }, [acceptSession]);

  const signInParent = useCallback(async (credentials) => {
    const result = await verifyParentOtp(credentials);
    acceptSession(result);
    return result.user;
  }, [acceptSession]);

  const signOut = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    delete api.defaults.headers.common.Authorization;
    setSession(null);
  }, []);

  const value = useMemo(() => ({
    accessToken: session?.accessToken ?? null,
    user: session?.user ?? null,
    signInAccounts,
    signInCounsellor,
    signInParent,
    requestParentOtp,
    signOut,
  }), [session, signInAccounts, signInCounsellor, signInParent, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
