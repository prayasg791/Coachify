import { useParentStudents } from "../auth/ParentStudentsContext.jsx";
import { EmptyState } from "../components/ui/States.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { StudentReceiptList } from "../receipts/ReceiptComponents.jsx";

export function ParentReceiptsPage() {
  const { studentId, status } = useParentStudents();
  return <>
    <PageHeader eyebrow="Parent portal" title="Receipts" description="View or print server-issued receipts for successful payments." />
    {!studentId && status === "empty" && <section className="rounded-xl border border-slate-200/80 bg-white shadow-card"><EmptyState title="No eligible student selected" description="Receipts are available after the institute verifies your account and required consent." /></section>}
    {studentId && <StudentReceiptList studentId={studentId} />}
  </>;
}
