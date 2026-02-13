import type { WorkspaceAlliumConfig } from "./drift-workspace";

const DEFAULT_TEST_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

const DEFAULT_TEST_NAME_PATTERNS = ["\\.test\\.", "\\.spec\\."];

export interface TestDiscoveryOptions {
  testInputs: string[];
  testExtensions: string[];
  testNamePatterns: string[];
}

export function resolveTestDiscoveryOptions(
  config: WorkspaceAlliumConfig | undefined,
): TestDiscoveryOptions {
  const testInputs = [
    ...(config?.trace?.tests ?? config?.project?.testPaths ?? ["."]),
  ];
  const testExtensions = [
    ...(config?.trace?.testExtensions ?? DEFAULT_TEST_EXTENSIONS),
  ];
  const testNamePatterns = [
    ...(config?.trace?.testNamePatterns ?? DEFAULT_TEST_NAME_PATTERNS),
  ];
  return {
    testInputs,
    testExtensions,
    testNamePatterns,
  };
}

export function buildTestFileMatcher(
  testExtensions: string[],
  testNamePatterns: string[],
): (filePath: string) => boolean {
  const extensionSet = new Set(
    testExtensions.map((extension) =>
      extension.startsWith(".")
        ? extension.toLowerCase()
        : `.${extension.toLowerCase()}`,
    ),
  );
  const matchers = testNamePatterns.map((pattern) => new RegExp(pattern));
  return (filePath: string): boolean => {
    const lowerPath = filePath.toLowerCase();
    const extension = lowerPath.slice(lowerPath.lastIndexOf("."));
    if (!extensionSet.has(extension)) {
      return false;
    }
    if (matchers.length === 0) {
      return true;
    }
    return matchers.some((matcher) => matcher.test(filePath));
  };
}

export function buildFindInFilesIncludePattern(testInputs: string[]): string {
  const normalized = testInputs
    .map((input) => input.trim())
    .filter((input) => input.length > 0)
    .map((input) => {
      if (input === ".") {
        return "**/*";
      }
      const normalizedPath = input.endsWith("/") ? input.slice(0, -1) : input;
      return `${normalizedPath}/**/*`;
    });
  if (normalized.length === 0) {
    return "**/*";
  }
  if (normalized.length === 1) {
    return normalized[0];
  }
  return `{${normalized.join(",")}}`;
}
