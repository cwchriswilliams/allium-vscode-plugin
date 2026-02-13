export interface DriftReport {
  missingInSpecs: string[];
  staleInSpecs: string[];
}

export function extractAlliumDiagnosticCodes(source: string): Set<string> {
  return new Set(
    source
      .match(/"allium\.[A-Za-z0-9_.-]+"/g)
      ?.map((item) => item.slice(1, -1)) ?? [],
  );
}

export function extractSpecDiagnosticCodes(specText: string): Set<string> {
  return new Set(
    specText
      .match(/code:\s*"allium\.[A-Za-z0-9_.-]+"/g)
      ?.map((item) => item.replace(/^code:\s*"/, "").slice(0, -1)) ?? [],
  );
}

export function extractSpecCommands(specText: string): Set<string> {
  return new Set(
    specText
      .match(/CommandInvoked\(name:\s*"[^"]+"\)/g)
      ?.map((item) => item.match(/"([^"]+)"/)?.[1] ?? "")
      .filter((item) => item.length > 0) ?? [],
  );
}

export function buildDriftReport(
  implemented: Set<string>,
  specified: Set<string>,
): DriftReport {
  const missingInSpecs = [...implemented]
    .filter((item) => !specified.has(item))
    .sort();
  const staleInSpecs = [...specified]
    .filter((item) => !implemented.has(item))
    .sort();
  return { missingInSpecs, staleInSpecs };
}

export function renderDriftMarkdown(
  diagnostics: DriftReport,
  commands: DriftReport,
): string {
  const out: string[] = [];
  out.push("# Allium Spec Drift Report");
  out.push("");
  out.push("## Diagnostics Implemented But Missing In Specs");
  if (diagnostics.missingInSpecs.length === 0) {
    out.push("- _(none)_");
  } else {
    for (const code of diagnostics.missingInSpecs) {
      out.push(`- \`${code}\``);
    }
  }
  out.push("");
  out.push("## Diagnostics In Specs But Not Implemented");
  if (diagnostics.staleInSpecs.length === 0) {
    out.push("- _(none)_");
  } else {
    for (const code of diagnostics.staleInSpecs) {
      out.push(`- \`${code}\``);
    }
  }
  out.push("");
  out.push("## Commands Implemented But Missing In Specs");
  if (commands.missingInSpecs.length === 0) {
    out.push("- _(none)_");
  } else {
    for (const name of commands.missingInSpecs) {
      out.push(`- \`${name}\``);
    }
  }
  out.push("");
  out.push("## Commands In Specs But Not Implemented");
  if (commands.staleInSpecs.length === 0) {
    out.push("- _(none)_");
  } else {
    for (const name of commands.staleInSpecs) {
      out.push(`- \`${name}\``);
    }
  }
  out.push("");
  return out.join("\n");
}
