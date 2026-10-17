export type EmployeeBadgePayload = {
  v: 1;
  kind: "IAMS_EMPLOYEE";
  companyId: string;
  employeeId: string;
  employeeCode: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const codePattern = /^[A-Z0-9_-]{1,40}$/;

export function parseEmployeeBadge(rawValue: string): EmployeeBadgePayload | null {
  if (typeof rawValue !== "string" || rawValue.length > 1000) return null;
  try {
    const value: unknown = JSON.parse(rawValue);
    if (!value || typeof value !== "object") return null;
    const payload = value as Record<string, unknown>;
    if (payload.v !== 1 || payload.kind !== "IAMS_EMPLOYEE") return null;
    if (typeof payload.companyId !== "string" || !uuidPattern.test(payload.companyId)) return null;
    if (typeof payload.employeeId !== "string" || !uuidPattern.test(payload.employeeId)) return null;
    if (typeof payload.employeeCode !== "string" || !codePattern.test(payload.employeeCode)) return null;
    return {
      v: 1, kind: "IAMS_EMPLOYEE", companyId: payload.companyId,
      employeeId: payload.employeeId, employeeCode: payload.employeeCode,
    };
  } catch {
    return null;
  }
}
