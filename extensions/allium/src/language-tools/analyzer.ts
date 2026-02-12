export type FindingSeverity = "error" | "warning" | "info";
export type DiagnosticsMode = "strict" | "relaxed";

export interface Finding {
  code: string;
  message: string;
  severity: FindingSeverity;
  start: { line: number; character: number };
  end: { line: number; character: number };
}

export interface AnalyzeOptions {
  mode?: DiagnosticsMode;
}

interface RuleBlock {
  name: string;
  startOffset: number;
  endOffset: number;
  body: string;
}

export function analyzeAllium(text: string, options: AnalyzeOptions = {}): Finding[] {
  const findings: Finding[] = [];
  const lineStarts = buildLineStarts(text);

  const ruleBlocks = findRuleBlocks(text);
  for (const block of ruleBlocks) {
    const hasWhen = /^\s*when\s*:/m.test(block.body);
    const hasEnsures = /^\s*ensures\s*:/m.test(block.body);

    if (!hasWhen) {
      findings.push(rangeFinding(
        lineStarts,
        block.startOffset,
        block.startOffset + block.name.length,
        "allium.rule.missingWhen",
        `Rule '${block.name}' must define a 'when:' trigger.`,
        "error"
      ));
    }

    if (!hasEnsures) {
      findings.push(rangeFinding(
        lineStarts,
        block.endOffset,
        block.endOffset + 1,
        "allium.rule.missingEnsures",
        `Rule '${block.name}' should include at least one 'ensures:' clause.`,
        "error"
      ));
    }

    const whenMatch = block.body.match(/^\s*when\s*:\s*(.+)$/m);
    const hasRequires = /^\s*requires\s*:/m.test(block.body);
    if (whenMatch && isTemporalWhenClause(whenMatch[1]) && !hasRequires) {
      const lineOffset = block.startOffset + 1 + block.body.indexOf(whenMatch[0]);
      findings.push(rangeFinding(
        lineStarts,
        lineOffset,
        lineOffset + whenMatch[0].length,
        "allium.temporal.missingGuard",
        "Temporal trigger should include a 'requires:' guard to avoid re-firing.",
        "warning"
      ));
    }

    const letNames = new Set<string>();
    const letRegex = /^\s*let\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/gm;
    for (let match = letRegex.exec(block.body); match; match = letRegex.exec(block.body)) {
      const name = match[1];
      if (letNames.has(name)) {
        const offset = block.startOffset + 1 + match.index;
        findings.push(rangeFinding(
          lineStarts,
          offset,
          offset + match[0].length,
          "allium.let.duplicateBinding",
          `Binding '${name}' is declared more than once in rule '${block.name}'.`,
          "error"
        ));
      }
      letNames.add(name);
    }
  }

  findings.push(...findDuplicateConfigKeys(text, lineStarts));
  findings.push(...findUndefinedConfigReferences(text, lineStarts));
  findings.push(...findOpenQuestions(text, lineStarts));

  return applyDiagnosticsMode(findings, options.mode ?? "strict");
}

function applyDiagnosticsMode(findings: Finding[], mode: DiagnosticsMode): Finding[] {
  if (mode === "strict") {
    return findings;
  }

  return findings.flatMap((finding) => {
    if (finding.code === "allium.temporal.missingGuard") {
      return [];
    }
    if (finding.code === "allium.config.undefinedReference") {
      return [{ ...finding, severity: "info" }];
    }
    return [finding];
  });
}

function findOpenQuestions(text: string, lineStarts: number[]): Finding[] {
  const findings: Finding[] = [];
  const pattern = /^\s*open_question\s+"[^"]*"/gm;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    findings.push(rangeFinding(
      lineStarts,
      match.index,
      match.index + match[0].length,
      "allium.openQuestion.present",
      "Open question present: specification is likely incomplete.",
      "info"
    ));
  }
  return findings;
}

function findUndefinedConfigReferences(text: string, lineStarts: number[]): Finding[] {
  const findings: Finding[] = [];
  const declared = new Set<string>();

  const configBlocks = findNamedBlocks(text, /^\s*config\s*\{/gm);
  const keyPattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm;
  for (const block of configBlocks) {
    for (let keyMatch = keyPattern.exec(block.body); keyMatch; keyMatch = keyPattern.exec(block.body)) {
      declared.add(keyMatch[1]);
    }
  }

  const refPattern = /\bconfig\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
  for (let match = refPattern.exec(text); match; match = refPattern.exec(text)) {
    const key = match[1];
    if (!declared.has(key)) {
      findings.push(rangeFinding(
        lineStarts,
        match.index,
        match.index + match[0].length,
        "allium.config.undefinedReference",
        `Reference '${match[0]}' has no matching declaration in a local config block.`,
        "warning"
      ));
    }
  }

  return findings;
}

function findDuplicateConfigKeys(text: string, lineStarts: number[]): Finding[] {
  const findings: Finding[] = [];
  const configBlocks = findNamedBlocks(text, /^\s*config\s*\{/gm);

  for (const block of configBlocks) {
    const seen = new Set<string>();
    const pattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm;
    for (let match = pattern.exec(block.body); match; match = pattern.exec(block.body)) {
      const key = match[1];
      if (seen.has(key)) {
        const offset = block.startOffset + 1 + match.index;
        findings.push(rangeFinding(
          lineStarts,
          offset,
          offset + match[0].length,
          "allium.config.duplicateKey",
          `Config key '${key}' is declared more than once in this block.`,
          "error"
        ));
      }
      seen.add(key);
    }
  }

  return findings;
}

function findRuleBlocks(text: string): RuleBlock[] {
  const results: RuleBlock[] = [];
  const rulePattern = /\brule\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/g;

  for (let match = rulePattern.exec(text); match; match = rulePattern.exec(text)) {
    const braceOffset = text.indexOf("{", match.index);
    if (braceOffset < 0) {
      continue;
    }

    const endOffset = findMatchingBrace(text, braceOffset);
    if (endOffset < 0) {
      continue;
    }

    results.push({
      name: match[1],
      startOffset: match.index,
      endOffset,
      body: text.slice(braceOffset + 1, endOffset)
    });
  }

  return results;
}

function findNamedBlocks(text: string, startPattern: RegExp): RuleBlock[] {
  const results: RuleBlock[] = [];

  for (let match = startPattern.exec(text); match; match = startPattern.exec(text)) {
    const braceOffset = text.indexOf("{", match.index);
    if (braceOffset < 0) {
      continue;
    }

    const endOffset = findMatchingBrace(text, braceOffset);
    if (endOffset < 0) {
      continue;
    }

    results.push({
      name: "",
      startOffset: match.index,
      endOffset,
      body: text.slice(braceOffset + 1, endOffset)
    });
  }

  return results;
}

function findMatchingBrace(text: string, openOffset: number): number {
  let depth = 0;
  for (let i = openOffset; i < text.length; i += 1) {
    const char = text[i];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function isTemporalWhenClause(clause: string): boolean {
  const normalized = clause.trim();
  if (/:[^\n]*(<=|>=|<|>)\s*now\b/.test(normalized)) {
    return true;
  }
  if (/\bnow\s*[+-]\s*\d/.test(normalized)) {
    return true;
  }
  return false;
}

function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      starts.push(i + 1);
    }
  }
  return starts;
}

function offsetToPosition(lineStarts: number[], offset: number): { line: number; character: number } {
  let line = 0;
  let hi = lineStarts.length - 1;
  while (line <= hi) {
    const mid = Math.floor((line + hi) / 2);
    if (lineStarts[mid] <= offset) {
      if (mid === lineStarts.length - 1 || lineStarts[mid + 1] > offset) {
        return { line: mid, character: offset - lineStarts[mid] };
      }
      line = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return { line: 0, character: offset };
}

function rangeFinding(
  lineStarts: number[],
  startOffset: number,
  endOffset: number,
  code: string,
  message: string,
  severity: FindingSeverity
): Finding {
  return {
    code,
    message,
    severity,
    start: offsetToPosition(lineStarts, startOffset),
    end: offsetToPosition(lineStarts, endOffset)
  };
}
