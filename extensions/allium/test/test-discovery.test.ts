import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFindInFilesIncludePattern,
  buildTestFileMatcher,
  resolveTestDiscoveryOptions,
} from "../src/language-tools/test-discovery";

test("resolveTestDiscoveryOptions prefers trace tests and patterns from config", () => {
  const options = resolveTestDiscoveryOptions({
    project: { testPaths: ["tests"] },
    trace: {
      tests: ["integration"],
      testExtensions: [".py"],
      testNamePatterns: ["_test\\.py$"],
    },
  });
  assert.deepEqual(options.testInputs, ["integration"]);
  assert.deepEqual(options.testExtensions, [".py"]);
  assert.deepEqual(options.testNamePatterns, ["_test\\.py$"]);
});

test("resolveTestDiscoveryOptions falls back to project.testPaths", () => {
  const options = resolveTestDiscoveryOptions({
    project: { testPaths: ["tests", "specs"] },
  });
  assert.deepEqual(options.testInputs, ["tests", "specs"]);
});

test("buildTestFileMatcher supports language-agnostic extension and name patterns", () => {
  const matcher = buildTestFileMatcher(
    [".py", ".clj"],
    ["_test\\.py$", "-test\\.clj$"],
  );
  assert.equal(matcher("/repo/tests/service_test.py"), true);
  assert.equal(matcher("/repo/tests/service-test.clj"), true);
  assert.equal(matcher("/repo/tests/service.spec.ts"), false);
});

test("buildFindInFilesIncludePattern handles multiple configured test roots", () => {
  assert.equal(
    buildFindInFilesIncludePattern(["tests", "integration/tests"]),
    "{tests/**/*,integration/tests/**/*}",
  );
  assert.equal(buildFindInFilesIncludePattern(["."]), "**/*");
});
