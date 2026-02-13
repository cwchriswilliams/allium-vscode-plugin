import test from "node:test";
import assert from "node:assert/strict";
import {
  collectCodeLensTargets,
  countSymbolReferencesInTestBodies,
} from "../src/language-tools/codelens";

test("collects code lens targets for top-level declarations", () => {
  const text = `
entity Invitation {
    status: String
}

rule AcceptInvitation {
    when: Ping()
    ensures: Done()
}

config {
    channel: String = "email"
}
`;
  const targets = collectCodeLensTargets(text);
  assert.deepEqual(
    targets.map((target) => target.name),
    ["Invitation", "AcceptInvitation"],
  );
});

test("includes enum and default declarations", () => {
  const text = `
enum Recommendation {
    yes | no
}

default Recommendation Preferred = Recommendation.yes
`;
  const targets = collectCodeLensTargets(text);
  assert.deepEqual(
    targets.map((target) => target.name),
    ["Recommendation", "Preferred"],
  );
});

test("counts symbol references across test bodies", () => {
  const counts = countSymbolReferencesInTestBodies(
    ["Invitation", "AcceptInvitation"],
    [
      'test("Invitation", () => Invitation.created())',
      'test("accept", () => expect(AcceptInvitation).toBeDefined())',
      "const x = Invitation",
    ],
  );
  assert.equal(counts.get("Invitation"), 3);
  assert.equal(counts.get("AcceptInvitation"), 1);
});
