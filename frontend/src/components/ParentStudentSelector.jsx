import { useParentStudents } from "../auth/ParentStudentsContext.jsx";
import { EmptyState, ErrorState, LoadingState } from "./ui/States.jsx";

export function ParentStudentSelector() {
  const { students, selectedStudent, selectStudent, status, error, retry } = useParentStudents();
  if (status === "loading") return <section className="mb-5 rounded-xl border border-slate-200/80 bg-white shadow-card"><LoadingState label="Loading linked students" /></section>;
  if (status === "error") return <section className="mb-5 rounded-xl border border-slate-200/80 bg-white shadow-card"><ErrorState title="Couldn’t load linked students" description={error} onRetry={retry} /></section>;
  if (!students.length) return <section className="mb-5 rounded-xl border border-slate-200/80 bg-white shadow-card"><EmptyState title="No eligible students found" description="The institute may need to verify that this account is linked to a student and that parental consent is active. Contact your institute for help." /></section>;

  return (
    <section aria-label="Selected student" className="mb-5 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
      {students.length > 1 && <label htmlFor="parent-student-selector" className="mb-2 block text-sm font-semibold text-slate-700">Viewing student</label>}
      {students.length > 1 && (
        <select id="parent-student-selector" value={selectedStudent?.id ?? ""} onChange={(event) => selectStudent(event.target.value)} className="mb-3 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 sm:max-w-md">
          <option value="" disabled>Select a student</option>
          {students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.studentId}</option>)}
        </select>
      )}
      {selectedStudent ? (
        <div className="min-w-0">
          {students.length === 1 && <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-600">Selected student</p>}
          <p className="break-words font-display text-base font-bold text-slate-900">{selectedStudent.name} <span className="font-sans text-sm font-medium text-slate-500">· {selectedStudent.studentId}</span></p>
          <p className="mt-1 break-words text-xs text-slate-500">{selectedStudent.centre?.name ?? "Centre unavailable"} · {selectedStudent.batch?.name ?? "Batch unavailable"}{selectedStudent.course ? ` · ${selectedStudent.course}` : ""}</p>
        </div>
      ) : <p role="status" className="text-sm text-slate-600">Choose a student to view their information.</p>}
    </section>
  );
}
