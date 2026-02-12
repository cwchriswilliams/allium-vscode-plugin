import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAllium } from "../src/language-tools/analyzer";

test("reports missing ensures", () => {
  const findings = analyzeAllium(`rule A {\n  when: Ping()\n}`);
  assert.ok(findings.some((f) => f.code === "allium.rule.missingEnsures"));
});

test("reports missing when trigger", () => {
  const findings = analyzeAllium(`rule A {\n  ensures: Done()\n}`);
  assert.ok(findings.some((f) => f.code === "allium.rule.missingWhen"));
});

test("reports temporal trigger without guard", () => {
  const findings = analyzeAllium(
    `rule Expires {\n  when: invitation: Invitation.expires_at <= now\n  ensures: invitation.status = expired\n}`,
  );
  assert.ok(findings.some((f) => f.code === "allium.temporal.missingGuard"));
});

test("does not report temporal guard if requires exists", () => {
  const findings = analyzeAllium(
    `rule Expires {\n  when: invitation: Invitation.expires_at <= now\n  requires: invitation.status = pending\n  ensures: invitation.status = expired\n}`,
  );
  assert.equal(
    findings.some((f) => f.code === "allium.temporal.missingGuard"),
    false,
  );
});

test("reports duplicate config keys", () => {
  const findings = analyzeAllium(
    `config {\n  timeout: Integer = 1\n  timeout: Integer = 2\n}`,
  );
  assert.ok(findings.some((f) => f.code === "allium.config.duplicateKey"));
});

test("reports duplicate let bindings", () => {
  const findings = analyzeAllium(
    `rule A {\n  when: Ping()\n  let x = 1\n  let x = 2\n  ensures: Done()\n}`,
  );
  assert.ok(findings.some((f) => f.code === "allium.let.duplicateBinding"));
});

test("reports undefined config reference", () => {
  const findings = analyzeAllium(
    `rule A {\n  when: Ping()\n  ensures: now + config.missing\n}`,
  );
  assert.ok(
    findings.some((f) => f.code === "allium.config.undefinedReference"),
  );
});

test("reports open_question as informational finding", () => {
  const findings = analyzeAllium(`open_question "Needs decision?"`);
  const finding = findings.find(
    (f) => f.code === "allium.openQuestion.present",
  );
  assert.ok(finding);
  assert.equal(finding.severity, "info");
});

test("relaxed mode suppresses temporal guard warning", () => {
  const findings = analyzeAllium(
    `rule Expires {\n  when: invitation: Invitation.expires_at <= now\n  ensures: invitation.status = expired\n}`,
    { mode: "relaxed" },
  );
  assert.equal(
    findings.some((f) => f.code === "allium.temporal.missingGuard"),
    false,
  );
});

test("relaxed mode downgrades undefined config severity", () => {
  const findings = analyzeAllium(
    `rule A {\n  when: Ping()\n  ensures: now + config.missing\n}`,
    { mode: "relaxed" },
  );
  const finding = findings.find(
    (f) => f.code === "allium.config.undefinedReference",
  );
  assert.ok(finding);
  assert.equal(finding.severity, "info");
});

test("reports missing actor referenced by surface", () => {
  const findings = analyzeAllium(
    `surface ChildView {\n  for parent: Parent\n}\n`,
  );
  assert.ok(findings.some((f) => f.code === "allium.surface.missingActor"));
});

test("reports unused actor when not referenced by any surface", () => {
  const findings = analyzeAllium(
    `actor Parent {\n  identified_by: User.email\n}\n`,
  );
  assert.ok(findings.some((f) => f.code === "allium.actor.unused"));
});

test("suppresses finding using allium-ignore on previous line", () => {
  const findings = analyzeAllium(
    `rule A {\n  when: Ping()\n  -- allium-ignore allium.config.undefinedReference\n  ensures: now + config.missing\n}\n`,
  );
  assert.equal(
    findings.some((f) => f.code === "allium.config.undefinedReference"),
    false,
  );
});

test("does not treat config references inside comments as findings", () => {
  const findings = analyzeAllium(
    `rule A {\n  when: Ping()\n  -- config.missing\n  ensures: Done()\n}\n`,
  );
  assert.equal(
    findings.some((f) => f.code === "allium.config.undefinedReference"),
    false,
  );
});

test("reports duplicate enum literals", () => {
  const findings = analyzeAllium(
    `enum Recommendation {\n  yes | no | yes\n}\n`,
  );
  assert.ok(findings.some((f) => f.code === "allium.enum.duplicateLiteral"));
});

test("reports empty enum declarations", () => {
  const findings = analyzeAllium(`enum Recommendation {\n}\n`);
  assert.ok(findings.some((f) => f.code === "allium.enum.empty"));
});
