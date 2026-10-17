"use client";

import { useState } from "react";
import { Archive, LoaderCircle } from "lucide-react";
import { deactivateWorker } from "./actions";

export default function DeleteEmployeeButton({ employeeId, employeeName, disabled = false }: {
  employeeId: string;
  employeeName: string;
  disabled?: boolean;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form action={deactivateWorker} onSubmit={(event) => {
      const confirmed = window.confirm(
        "Remove " + employeeName + " from active employees? Their worker portal access will be disabled. Historical attendance, leave, roster and audit records will be preserved."
      );
      if (!confirmed) {
        event.preventDefault();
        return;
      }
      setIsSubmitting(true);
    }}>
      <input type="hidden" name="employee_id" value={employeeId} />
      <button
        type="submit"
        disabled={disabled || isSubmitting}
        title={disabled ? "Configure SUPABASE_SECRET_KEY in Vercel first" : "Disable this employee and preserve attendance history"}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isSubmitting ? <LoaderCircle size={14} className="animate-spin" /> : <Archive size={14} />}
        {isSubmitting ? "Removing…" : "Delete"}
      </button>
    </form>
  );
}
