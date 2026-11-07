import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { api, getParentStudents } from "./api.js";

const STORAGE_KEY = "coachify.parent.selectedStudent";
const ParentStudentsContext = createContext(null);

export function ParentStudentsProvider({ children }) {
  const { accessToken, user, signOut } = useAuth();
  const [students, setStudents] = useState([]);
  const [selectedId, setSelectedId] = useState(() => sessionStorage.getItem(STORAGE_KEY) ?? "");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (response) => response,
      (requestError) => {
        if (requestError.response?.status === 401) signOut();
        return Promise.reject(requestError);
      },
    );
    return () => api.interceptors.response.eject(interceptor);
  }, [signOut]);

  useEffect(() => {
    if (!accessToken || user?.role !== "PARENT") {
      setStudents([]);
      setStatus("empty");
      return undefined;
    }
    const controller = new AbortController();
    setStatus("loading");
    setStudents([]);
    setError("");
    getParentStudents({ accessToken, signal: controller.signal })
      .then((response) => {
        if (!response?.success || !Array.isArray(response.data)) {
          throw new Error("The parent student lookup returned an unexpected response.");
        }
        setStudents(response.data);
        const savedId = sessionStorage.getItem(STORAGE_KEY);
        const nextId = response.data.some((student) => student.id === savedId)
          ? savedId
          : response.data.length === 1 ? response.data[0].id : "";
        setSelectedId(nextId);
        if (nextId) sessionStorage.setItem(STORAGE_KEY, nextId);
        else sessionStorage.removeItem(STORAGE_KEY);
        setStatus(response.data.length ? "ready" : "empty");
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        if (requestError.response?.status === 401) signOut();
        setError(requestError.response?.data?.message || requestError.message || "Please try again in a moment.");
        setStatus("error");
      });
    return () => controller.abort();
  }, [accessToken, user?.role, signOut, attempt]);

  const selectStudent = useCallback((id) => {
    if (!students.some((student) => student.id === id)) return;
    setSelectedId(id);
    sessionStorage.setItem(STORAGE_KEY, id);
  }, [students]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedId) ?? null,
    [students, selectedId],
  );
  const value = useMemo(() => ({
    students, selectedStudent, studentId: selectedStudent?.id ?? "", selectStudent, status, error,
    retry: () => setAttempt((current) => current + 1),
  }), [students, selectedStudent, selectStudent, status, error]);

  return <ParentStudentsContext.Provider value={value}>{children}</ParentStudentsContext.Provider>;
}

export function useParentStudents() {
  const context = useContext(ParentStudentsContext);
  if (!context) throw new Error("useParentStudents must be used within ParentStudentsProvider");
  return context;
}

export function useParentStudentsOptional() {
  return useContext(ParentStudentsContext);
}
