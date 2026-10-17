import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseEmployeeBadge } from "../lib/attendance/employee-badge";

const payload = {
  v: 1,
  kind: "IAMS_EMPLOYEE",
  companyId: "c1fee485-53b2-48ed-a950-4edabbf3738e",
  employeeId: "b1fee485-53b2-48ed-a950-4edabbf3738e",
  employeeCode: "CW-001",
};

describe("employee QR badge parsing", () => {
  it("accepts a valid versioned IAMS employee badge", () => {
    assert.deepEqual(parseEmployeeBadge(JSON.stringify(payload)), payload);
  });

  it("rejects a QR from another format", () => {
    assert.equal(parseEmployeeBadge("https://example.com"), null);
    assert.equal(parseEmployeeBadge(JSON.stringify({ ...payload, kind: "LOGIN_TOKEN" })), null);
  });

  it("rejects invalid company/employee identifiers and codes", () => {
    assert.equal(parseEmployeeBadge(JSON.stringify({ ...payload, companyId: "wrong" })), null);
    assert.equal(parseEmployeeBadge(JSON.stringify({ ...payload, employeeId: "wrong" })), null);
    assert.equal(parseEmployeeBadge(JSON.stringify({ ...payload, employeeCode: "ID WITH SPACES" })), null);
  });

  it("rejects oversized or malformed payloads", () => {
    assert.equal(parseEmployeeBadge("x".repeat(1001)), null);
    assert.equal(parseEmployeeBadge("{"), null);
  });
});
