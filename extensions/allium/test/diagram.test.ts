import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDiagramModel,
  renderDiagram,
} from "../src/language-tools/diagram";

test("builds diagram model with entities, rules, and surfaces", () => {
  const model = buildDiagramModel(
    `entity Invitation {\n  status: pending | accepted\n}\n\nrule AcceptInvitation {\n  when: invitation: Invitation.status becomes pending\n  ensures: Invitation.created(status: accepted)\n}\n\nsurface InvitationPortal {\n  for user: User\n  context invitation: Invitation\n  provides:\n    AcceptInvitation(invitation)\n}\n`,
  );

  assert.ok(model.nodes.some((n) => n.key === "entity:Invitation"));
  assert.ok(model.nodes.some((n) => n.key === "rule:AcceptInvitation"));
  assert.ok(model.nodes.some((n) => n.key === "surface:InvitationPortal"));
  assert.ok(
    model.edges.some(
      (e) => e.label === "when" && e.to === "rule_AcceptInvitation",
    ),
  );
  assert.ok(
    model.edges.some(
      (e) => e.label === "provides" && e.from === "surface_InvitationPortal",
    ),
  );
});

test("renders d2 and mermaid output", () => {
  const model = buildDiagramModel(
    `entity Ticket {\n  status: open | closed\n}\nrule Close {\n  when: CloseTicket(ticket)\n  ensures: Ticket.created(status: closed)\n}\n`,
  );

  const d2 = renderDiagram(model, "d2");
  const mermaid = renderDiagram(model, "mermaid");

  assert.match(d2, /direction: right/);
  assert.match(d2, /rule_Close/);
  assert.match(mermaid, /flowchart LR/);
  assert.match(mermaid, /rule_Close/);
});
