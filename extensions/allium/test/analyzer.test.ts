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

test("reports open_question as warning finding", () => {
  const findings = analyzeAllium(`open_question "Needs decision?"`);
  const finding = findings.find(
    (f) => f.code === "allium.openQuestion.present",
  );
  assert.ok(finding);
  assert.equal(finding.severity, "warning");
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

test("reports duplicate context binding names", () => {
  const findings = analyzeAllium(
    `entity Pipeline {\n  status: String\n}\n\ncontext {\n  pipeline: Pipeline\n  pipeline: Pipeline\n}\n`,
  );
  assert.ok(findings.some((f) => f.code === "allium.context.duplicateBinding"));
});

test("reports undefined context binding type", () => {
  const findings = analyzeAllium(`context {\n  pipeline: MissingType\n}\n`);
  assert.ok(findings.some((f) => f.code === "allium.context.undefinedType"));
});

test("does not report context type for imported alias reference", () => {
  const findings = analyzeAllium(
    `use "./shared.allium" as scheduling\n\ncontext {\n  calendar: scheduling/calendar\n}\n`,
  );
  assert.equal(
    findings.some((f) => f.code === "allium.context.undefinedType"),
    false,
  );
});

test("reports undefined related surface reference", () => {
  const findings = analyzeAllium(
    `surface Dashboard {\n  for user: User\n  related:\n    MissingSurface\n}\n`,
  );
  assert.ok(findings.some((f) => f.code === "allium.surface.relatedUndefined"));
});

test("does not report related surface when declared", () => {
  const findings = analyzeAllium(
    `surface Dashboard {\n  for user: User\n  related:\n    DetailView\n}\n\nsurface DetailView {\n  for user: User\n}\n`,
  );
  assert.equal(
    findings.some((f) => f.code === "allium.surface.relatedUndefined"),
    false,
  );
});

test("reports unused surface for-binding", () => {
  const findings = analyzeAllium(
    `surface Dashboard {\n  for viewer: User\n  exposes:\n    System.status\n}\n`,
  );
  assert.ok(findings.some((f) => f.code === "allium.surface.unusedBinding"));
});

test("does not report used surface bindings", () => {
  const findings = analyzeAllium(
    `surface Dashboard {\n  for viewer: User\n  context assignment: SlotConfirmation\n  exposes:\n    assignment.status\n  provides:\n    DashboardViewed(viewer: viewer)\n}\n`,
  );
  assert.equal(
    findings.some((f) => f.code === "allium.surface.unusedBinding"),
    false,
  );
});

test("reports config parameter missing explicit type/default", () => {
  const findings = analyzeAllium(`config {\n  timeout: Integer\n}\n`);
  assert.ok(findings.some((f) => f.code === "allium.config.invalidParameter"));
});

test("reports unknown alias in external config reference", () => {
  const findings = analyzeAllium(
    `rule A {\n  when: Ping()\n  ensures: now + oauth/config.session_duration\n}\n`,
  );
  assert.ok(
    findings.some((f) => f.code === "allium.config.undefinedExternalReference"),
  );
});

test("does not report known alias in external config reference", () => {
  const findings = analyzeAllium(
    `use "./oauth.allium" as oauth\n\nrule A {\n  when: Ping()\n  ensures: now + oauth/config.session_duration\n}\n`,
  );
  assert.equal(
    findings.some((f) => f.code === "allium.config.undefinedExternalReference"),
    false,
  );
});

test("reports discriminator references without matching variant declarations", () => {
  const findings = analyzeAllium(
    `entity Node {\n  kind: Branch | Leaf\n}\n\nvariant Branch : Node {\n  children: List<Node>\n}\n`,
  );
  assert.ok(
    findings.some((f) => f.code === "allium.sum.discriminatorUnknownVariant"),
  );
});

test("reports variant missing from base discriminator field", () => {
  const findings = analyzeAllium(
    `entity Node {\n  kind: Branch | Leaf\n}\n\nvariant Branch : Node {\n  children: List<Node>\n}\nvariant Trunk : Node {\n  rings: Integer\n}\nvariant Leaf : Node {\n  data: String\n}\n`,
  );
  assert.ok(
    findings.some((f) => f.code === "allium.sum.variantMissingInDiscriminator"),
  );
});

test("reports direct base instantiation for sum type entity", () => {
  const findings = analyzeAllium(
    `entity Node {\n  kind: Branch | Leaf\n}\n\nvariant Branch : Node {\n  children: List<Node>\n}\nvariant Leaf : Node {\n  data: String\n}\n\nrule CreateNode {\n  when: Ping()\n  ensures: Node.created(kind: Branch)\n}\n`,
  );
  assert.ok(findings.some((f) => f.code === "allium.sum.baseInstantiation"));
});

test("reports variant-like declaration missing keyword", () => {
  const findings = analyzeAllium(
    `entity Node {\n  kind: Branch | Leaf\n}\n\nBranch : Node {\n  children: List<Node>\n}\n`,
  );
  assert.ok(
    findings.some((f) => f.code === "allium.sum.missingVariantKeyword"),
  );
});

test("reports undefined local type reference in entity field", () => {
  const findings = analyzeAllium(
    `entity Invitation {\n  policy: MissingPolicy\n}\n`,
  );
  assert.ok(findings.some((f) => f.code === "allium.type.undefinedReference"));
});

test("does not report declared local type references", () => {
  const findings = analyzeAllium(
    `value Policy {\n  retries: Integer\n}\n\nentity Invitation {\n  policy: Policy\n}\n`,
  );
  assert.equal(
    findings.some((f) => f.code === "allium.type.undefinedReference"),
    false,
  );
});

test("reports unknown imported alias in type reference", () => {
  const findings = analyzeAllium(
    `entity Invitation {\n  policy: shared/Policy\n}\n`,
  );
  assert.ok(
    findings.some((f) => f.code === "allium.type.undefinedImportedAlias"),
  );
});

test("does not report known imported alias in type reference", () => {
  const findings = analyzeAllium(
    `use "./shared.allium" as shared\n\nentity Invitation {\n  policy: shared/Policy\n}\n`,
  );
  assert.equal(
    findings.some((f) => f.code === "allium.type.undefinedImportedAlias"),
    false,
  );
});

test("reports duplicate named requires blocks in surface", () => {
  const findings = analyzeAllium(
    `surface Dashboard {\n  for viewer: User\n  requires Visibility:\n    viewer.id != null\n  requires Visibility:\n    viewer.active = true\n}\n`,
  );
  assert.ok(
    findings.some((f) => f.code === "allium.surface.duplicateRequiresBlock"),
  );
});

test("reports duplicate named provides blocks in surface", () => {
  const findings = analyzeAllium(
    `surface Dashboard {\n  for viewer: User\n  provides Navigate:\n    Opened()\n  provides Navigate:\n    Refreshed()\n}\n`,
  );
  assert.ok(
    findings.some((f) => f.code === "allium.surface.duplicateProvidesBlock"),
  );
});

test("reports undefined trigger type reference in rule", () => {
  const findings = analyzeAllium(
    `rule Expire {\n  when: invite: MissingType.expires_at <= now\n  ensures: Done()\n}\n`,
  );
  assert.ok(
    findings.some((f) => f.code === "allium.rule.undefinedTypeReference"),
  );
});

test("reports undefined imported alias in rule type reference", () => {
  const findings = analyzeAllium(
    `rule Expire {\n  when: invite: shared/Invite.expires_at <= now\n  ensures: Done()\n}\n`,
  );
  assert.ok(
    findings.some((f) => f.code === "allium.rule.undefinedImportedAlias"),
  );
});

test("does not report known rule type references", () => {
  const findings = analyzeAllium(
    `entity Invite {\n  expires_at: Timestamp\n}\n\nrule Expire {\n  when: invite: Invite.expires_at <= now\n  ensures: Invite.created(expires_at: now)\n}\n`,
  );
  assert.equal(
    findings.some((f) => f.code === "allium.rule.undefinedTypeReference"),
    false,
  );
});

test("reports entity declared but never referenced", () => {
  const findings = analyzeAllium(`entity Invitation {\n  status: String\n}\n`);
  assert.ok(findings.some((f) => f.code === "allium.entity.unused"));
});

test("reports external entity without import source hints", () => {
  const findings = analyzeAllium(
    `external entity DirectoryUser {\n  id: String\n}\n`,
  );
  assert.ok(
    findings.some((f) => f.code === "allium.externalEntity.missingSourceHint"),
  );
});

test("does not report external entity source warning when imports exist", () => {
  const findings = analyzeAllium(
    `use "./directory.allium" as directory\n\nexternal entity DirectoryUser {\n  id: String\n}\n`,
  );
  assert.equal(
    findings.some((f) => f.code === "allium.externalEntity.missingSourceHint"),
    false,
  );
});
