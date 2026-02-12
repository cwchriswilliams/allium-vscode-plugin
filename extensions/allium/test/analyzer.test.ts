import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAllium } from "../src/language-tools/analyzer";

test("reports missing ensures", () => {
  const findings = analyzeAllium(`rule A {\n  when: Ping()\n}`);
  assert.ok(findings.some((f) => f.code === "allium.rule.missingEnsures"));
});

test("reports temporal trigger without guard", () => {
  const findings = analyzeAllium(`rule Expires {\n  when: invitation: Invitation.expires_at <= now\n  ensures: invitation.status = expired\n}`);
  assert.ok(findings.some((f) => f.code === "allium.temporal.missingGuard"));
});

test("does not report temporal guard if requires exists", () => {
  const findings = analyzeAllium(`rule Expires {\n  when: invitation: Invitation.expires_at <= now\n  requires: invitation.status = pending\n  ensures: invitation.status = expired\n}`);
  assert.equal(findings.some((f) => f.code === "allium.temporal.missingGuard"), false);
});

test("reports duplicate config keys", () => {
  const findings = analyzeAllium(`config {\n  timeout: Integer = 1\n  timeout: Integer = 2\n}`);
  assert.ok(findings.some((f) => f.code === "allium.config.duplicateKey"));
});

test("reports undefined config reference", () => {
  const findings = analyzeAllium(`rule A {\n  when: Ping()\n  ensures: now + config.missing\n}`);
  assert.ok(findings.some((f) => f.code === "allium.config.undefinedReference"));
});

test("relaxed mode suppresses temporal guard warning", () => {
  const findings = analyzeAllium(
    `rule Expires {\n  when: invitation: Invitation.expires_at <= now\n  ensures: invitation.status = expired\n}`,
    { mode: "relaxed" }
  );
  assert.equal(findings.some((f) => f.code === "allium.temporal.missingGuard"), false);
});

test("relaxed mode downgrades undefined config severity", () => {
  const findings = analyzeAllium(
    `rule A {\n  when: Ping()\n  ensures: now + config.missing\n}`,
    { mode: "relaxed" }
  );
  const finding = findings.find((f) => f.code === "allium.config.undefinedReference");
  assert.ok(finding);
  assert.equal(finding.severity, "info");
});
