import { findMatchingBrace, parseAlliumBlocks } from "./parser";

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

export function analyzeAllium(
  text: string,
  options: AnalyzeOptions = {},
): Finding[] {
  const findings: Finding[] = [];
  const lineStarts = buildLineStarts(text);
  const blocks = parseAlliumBlocks(text);

  const ruleBlocks = blocks.filter((block) => block.kind === "rule");
  for (const block of ruleBlocks) {
    const hasWhen = /^\s*when\s*:/m.test(block.body);
    const hasEnsures = /^\s*ensures\s*:/m.test(block.body);

    if (!hasWhen) {
      findings.push(
        rangeFinding(
          lineStarts,
          block.startOffset,
          block.startOffset + block.name.length,
          "allium.rule.missingWhen",
          `Rule '${block.name}' must define a 'when:' trigger.`,
          "error",
        ),
      );
    }

    if (!hasEnsures) {
      findings.push(
        rangeFinding(
          lineStarts,
          block.endOffset,
          block.endOffset + 1,
          "allium.rule.missingEnsures",
          `Rule '${block.name}' should include at least one 'ensures:' clause.`,
          "error",
        ),
      );
    }

    const whenMatch = block.body.match(/^\s*when\s*:\s*(.+)$/m);
    const hasRequires = /^\s*requires\s*:/m.test(block.body);
    if (whenMatch && isTemporalWhenClause(whenMatch[1]) && !hasRequires) {
      const lineOffset =
        block.startOffset + 1 + block.body.indexOf(whenMatch[0]);
      findings.push(
        rangeFinding(
          lineStarts,
          lineOffset,
          lineOffset + whenMatch[0].length,
          "allium.temporal.missingGuard",
          "Temporal trigger should include a 'requires:' guard to avoid re-firing.",
          "warning",
        ),
      );
    }

    const letNames = new Set<string>();
    const letRegex = /^\s*let\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/gm;
    for (
      let match = letRegex.exec(block.body);
      match;
      match = letRegex.exec(block.body)
    ) {
      const name = match[1];
      if (letNames.has(name)) {
        const offset = block.startOffset + 1 + match.index;
        findings.push(
          rangeFinding(
            lineStarts,
            offset,
            offset + match[0].length,
            "allium.let.duplicateBinding",
            `Binding '${name}' is declared more than once in rule '${block.name}'.`,
            "error",
          ),
        );
      }
      letNames.add(name);
    }
  }

  findings.push(...findDuplicateConfigKeys(text, lineStarts, blocks));
  findings.push(...findConfigParameterShapeIssues(lineStarts, blocks));
  findings.push(...findUndefinedConfigReferences(text, lineStarts, blocks));
  findings.push(
    ...findUndefinedExternalConfigReferences(text, lineStarts, blocks),
  );
  findings.push(...findUndefinedStatusAssignments(text, lineStarts, blocks));
  findings.push(...findEnumDeclarationIssues(lineStarts, blocks));
  findings.push(...findSumTypeIssues(text, lineStarts));
  findings.push(...findTypeReferenceIssues(text, lineStarts, blocks));
  findings.push(...findRuleTypeReferenceIssues(lineStarts, blocks, text));
  findings.push(...findContextBindingIssues(text, lineStarts, blocks));
  findings.push(...findOpenQuestions(text, lineStarts));
  findings.push(...findSurfaceActorLinkIssues(text, lineStarts, blocks));
  findings.push(...findSurfaceRelatedIssues(lineStarts, blocks));
  findings.push(...findSurfaceBindingUsageIssues(lineStarts, blocks));
  findings.push(...findSurfaceNamedBlockUniquenessIssues(lineStarts, blocks));
  findings.push(...findSurfaceProvidesTriggerIssues(lineStarts, blocks, text));
  findings.push(...findUnusedEntityIssues(text, lineStarts));
  findings.push(...findExternalEntitySourceHints(text, lineStarts, blocks));
  findings.push(...findDeferredLocationHints(text, lineStarts));
  findings.push(...findImplicitLambdaIssues(text, lineStarts));

  return applySuppressions(
    applyDiagnosticsMode(findings, options.mode ?? "strict"),
    text,
    lineStarts,
  );
}

function applyDiagnosticsMode(
  findings: Finding[],
  mode: DiagnosticsMode,
): Finding[] {
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
    findings.push(
      rangeFinding(
        lineStarts,
        match.index,
        match.index + match[0].length,
        "allium.openQuestion.present",
        "Open question present: specification is likely incomplete.",
        "warning",
      ),
    );
  }
  return findings;
}

function findUndefinedConfigReferences(
  text: string,
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const declared = new Set<string>();

  const configBlocks = blocks.filter((block) => block.kind === "config");
  const keyPattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm;
  for (const block of configBlocks) {
    for (
      let keyMatch = keyPattern.exec(block.body);
      keyMatch;
      keyMatch = keyPattern.exec(block.body)
    ) {
      declared.add(keyMatch[1]);
    }
  }

  const refPattern = /\bconfig\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
  for (
    let match = refPattern.exec(text);
    match;
    match = refPattern.exec(text)
  ) {
    if (isCommentLineAtIndex(text, match.index)) {
      continue;
    }
    const key = match[1];
    if (!declared.has(key)) {
      findings.push(
        rangeFinding(
          lineStarts,
          match.index,
          match.index + match[0].length,
          "allium.config.undefinedReference",
          `Reference '${match[0]}' has no matching declaration in a local config block.`,
          "warning",
        ),
      );
    }
  }

  return findings;
}

function findUndefinedExternalConfigReferences(
  text: string,
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const aliases = new Set(
    blocks
      .filter((block) => block.kind === "use")
      .map((block) => block.alias ?? block.name),
  );
  const pattern =
    /\b([A-Za-z_][A-Za-z0-9_]*)\/config\.([A-Za-z_][A-Za-z0-9_]*)\b/g;

  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (isCommentLineAtIndex(text, match.index)) {
      continue;
    }
    const alias = match[1];
    if (aliases.has(alias)) {
      continue;
    }
    findings.push(
      rangeFinding(
        lineStarts,
        match.index,
        match.index + match[0].length,
        "allium.config.undefinedExternalReference",
        `External config reference '${match[0]}' uses unknown import alias '${alias}'.`,
        "error",
      ),
    );
  }

  return findings;
}

function findUndefinedStatusAssignments(
  text: string,
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const statusByEntity = collectEntityStatusEnums(text);
  if (statusByEntity.size === 0) {
    return findings;
  }

  const ruleBlocks = blocks.filter((block) => block.kind === "rule");
  for (const rule of ruleBlocks) {
    const whenBindingMatch = rule.body.match(
      /^\s*when\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\./m,
    );
    if (!whenBindingMatch) {
      continue;
    }
    const bindingName = whenBindingMatch[1];
    const entityName = whenBindingMatch[2];
    const allowedStatuses = statusByEntity.get(entityName);
    if (!allowedStatuses || allowedStatuses.size === 0) {
      continue;
    }

    const ensuresPattern = new RegExp(
      `^\\s*ensures\\s*:\\s*${escapeRegex(bindingName)}\\.status\\s*=\\s*([a-z_][a-z0-9_]*)\\b`,
      "gm",
    );
    for (
      let match = ensuresPattern.exec(rule.body);
      match;
      match = ensuresPattern.exec(rule.body)
    ) {
      const status = match[1];
      if (allowedStatuses.has(status)) {
        continue;
      }
      const statusOffset =
        rule.startOffset + 1 + match.index + match[0].lastIndexOf(status);
      findings.push(
        rangeFinding(
          lineStarts,
          statusOffset,
          statusOffset + status.length,
          "allium.status.undefinedValue",
          `Status value '${status}' is not declared in ${entityName}.status enum.`,
          "error",
        ),
      );
    }
  }

  return findings;
}

function findDuplicateConfigKeys(
  text: string,
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const configBlocks = blocks.filter((block) => block.kind === "config");

  for (const block of configBlocks) {
    const seen = new Set<string>();
    const pattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm;
    for (
      let match = pattern.exec(block.body);
      match;
      match = pattern.exec(block.body)
    ) {
      const key = match[1];
      if (seen.has(key)) {
        const offset = block.startOffset + 1 + match.index;
        findings.push(
          rangeFinding(
            lineStarts,
            offset,
            offset + match[0].length,
            "allium.config.duplicateKey",
            `Config key '${key}' is declared more than once in this block.`,
            "error",
          ),
        );
      }
      seen.add(key);
    }
  }

  return findings;
}

function findConfigParameterShapeIssues(
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const configBlocks = blocks.filter((block) => block.kind === "config");
  const validPattern =
    /^\s*[A-Za-z_][A-Za-z0-9_]*\s*:\s*[A-Za-z_][A-Za-z0-9_<?>[\]| ]*\s*=\s*.+$/;
  const keyLinePattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/;

  for (const block of configBlocks) {
    const body = block.body;
    let cursor = 0;
    while (cursor < body.length) {
      const lineEnd = body.indexOf("\n", cursor);
      const end = lineEnd >= 0 ? lineEnd : body.length;
      const line = body.slice(cursor, end);
      const trimmed = line.trim();
      if (trimmed.length > 0 && !trimmed.startsWith("--")) {
        const keyMatch = line.match(keyLinePattern);
        if (keyMatch && !validPattern.test(line)) {
          const keyOffset =
            block.startOffset + 1 + cursor + line.indexOf(keyMatch[1]);
          findings.push(
            rangeFinding(
              lineStarts,
              keyOffset,
              keyOffset + keyMatch[1].length,
              "allium.config.invalidParameter",
              `Config parameter '${keyMatch[1]}' must declare both explicit type and default value.`,
              "error",
            ),
          );
        }
      }
      cursor = end + 1;
    }
  }
  return findings;
}

function findEnumDeclarationIssues(
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const enumBlocks = blocks.filter((block) => block.kind === "enum");

  for (const block of enumBlocks) {
    const literals = new Set<string>();
    let foundAny = false;
    const literalPattern = /\b([a-z_][a-z0-9_]*)\b/g;
    for (
      let literal = literalPattern.exec(block.body);
      literal;
      literal = literalPattern.exec(block.body)
    ) {
      foundAny = true;
      const value = literal[1];
      if (literals.has(value)) {
        const offset = block.startOffset + 1 + literal.index;
        findings.push(
          rangeFinding(
            lineStarts,
            offset,
            offset + value.length,
            "allium.enum.duplicateLiteral",
            `Enum '${block.name}' declares literal '${value}' more than once.`,
            "error",
          ),
        );
      }
      literals.add(value);
    }

    if (!foundAny) {
      findings.push(
        rangeFinding(
          lineStarts,
          block.startOffset,
          block.startOffset + block.name.length,
          "allium.enum.empty",
          `Enum '${block.name}' should declare at least one literal.`,
          "warning",
        ),
      );
    }
  }

  return findings;
}

function findSumTypeIssues(text: string, lineStarts: number[]): Finding[] {
  const findings: Finding[] = [];
  const variants = parseVariantDeclarations(text);
  const variantsByBase = new Map<string, Set<string>>();
  for (const variant of variants) {
    const set = variantsByBase.get(variant.base) ?? new Set<string>();
    set.add(variant.name);
    variantsByBase.set(variant.base, set);
  }

  const entities = parseEntityBlocks(text);
  const discriminatorByEntity = new Map<string, Set<string>>();
  for (const entity of entities) {
    for (const field of entity.pipeFields) {
      if (!field.hasCapitalizedName) {
        continue;
      }
      if (!field.allNamesCapitalized) {
        findings.push(
          rangeFinding(
            lineStarts,
            field.startOffset,
            field.startOffset + field.rawNames.length,
            "allium.sum.invalidDiscriminator",
            `Entity '${entity.name}' discriminator '${field.fieldName}' must use only capitalized variant names.`,
            "error",
          ),
        );
        continue;
      }

      const listed = new Set(field.names);
      discriminatorByEntity.set(entity.name, listed);
      const declaredForBase =
        variantsByBase.get(entity.name) ?? new Set<string>();
      for (const name of field.names) {
        if (declaredForBase.has(name)) {
          continue;
        }
        findings.push(
          rangeFinding(
            lineStarts,
            field.startOffset,
            field.startOffset + field.rawNames.length,
            "allium.sum.discriminatorUnknownVariant",
            `Entity '${entity.name}' discriminator references '${name}' without matching 'variant ${name} : ${entity.name}'.`,
            "error",
          ),
        );
      }
    }
  }

  for (const variant of variants) {
    const listed = discriminatorByEntity.get(variant.base);
    if (!listed || listed.has(variant.name)) {
      continue;
    }
    findings.push(
      rangeFinding(
        lineStarts,
        variant.startOffset,
        variant.startOffset + variant.name.length,
        "allium.sum.variantMissingInDiscriminator",
        `Variant '${variant.name}' extends '${variant.base}' but is missing from '${variant.base}' discriminator field.`,
        "error",
      ),
    );
  }

  for (const entity of entities) {
    if (!discriminatorByEntity.has(entity.name)) {
      continue;
    }
    const pattern = new RegExp(
      `\\b${escapeRegex(entity.name)}\\.created\\s*\\(`,
      "g",
    );
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      if (isCommentLineAtIndex(text, match.index)) {
        continue;
      }
      findings.push(
        rangeFinding(
          lineStarts,
          match.index,
          match.index + entity.name.length,
          "allium.sum.baseInstantiation",
          `Base entity '${entity.name}' with discriminator cannot be instantiated directly; instantiate a variant instead.`,
          "error",
        ),
      );
    }
  }

  const missingKeywordPattern =
    /^\s*([A-Z][A-Za-z0-9_]*)\s*:\s*([A-Z][A-Za-z0-9_]*)\s*\{/gm;
  for (
    let match = missingKeywordPattern.exec(text);
    match;
    match = missingKeywordPattern.exec(text)
  ) {
    const lineEnd = text.indexOf("\n", match.index);
    const line = text.slice(
      text.lastIndexOf("\n", match.index) + 1,
      lineEnd >= 0 ? lineEnd : text.length,
    );
    if (
      /^\s*(entity|external\s+entity|value|variant|rule|surface|actor|enum|config|context)\b/.test(
        line,
      )
    ) {
      continue;
    }
    findings.push(
      rangeFinding(
        lineStarts,
        match.index,
        match.index + match[1].length,
        "allium.sum.missingVariantKeyword",
        `Declaration '${match[1]} : ${match[2]} { ... }' must use 'variant ${match[1]} : ${match[2]} { ... }'.`,
        "error",
      ),
    );
  }

  return findings;
}

function findTypeReferenceIssues(
  text: string,
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const declaredTypes = new Set<string>([
    ...collectDeclaredTypeNames(text),
    "String",
    "Integer",
    "Decimal",
    "Boolean",
    "Timestamp",
    "Duration",
    "List",
    "Set",
    "Map",
  ]);
  const aliases = new Set(
    blocks
      .filter((block) => block.kind === "use")
      .map((block) => block.alias ?? block.name),
  );

  const typeSites = collectFieldTypeSites(text);
  for (const site of typeSites) {
    const pattern = /([A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)?)/g;
    for (
      let token = pattern.exec(site.typeExpression);
      token;
      token = pattern.exec(site.typeExpression)
    ) {
      const value = token[1];
      const absoluteOffset = site.startOffset + token.index;
      if (value.includes("/")) {
        const alias = value.split("/")[0];
        if (!aliases.has(alias)) {
          findings.push(
            rangeFinding(
              lineStarts,
              absoluteOffset,
              absoluteOffset + value.length,
              "allium.type.undefinedImportedAlias",
              `Type reference '${value}' uses unknown import alias '${alias}'.`,
              "error",
            ),
          );
        }
        continue;
      }
      if (/^[a-z]/.test(value)) {
        continue;
      }
      if (!declaredTypes.has(value)) {
        findings.push(
          rangeFinding(
            lineStarts,
            absoluteOffset,
            absoluteOffset + value.length,
            "allium.type.undefinedReference",
            `Type reference '${value}' is not declared locally or imported.`,
            "error",
          ),
        );
      }
    }
  }

  return findings;
}

function findRuleTypeReferenceIssues(
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
  text: string,
): Finding[] {
  const findings: Finding[] = [];
  const declaredTypes = new Set<string>(collectDeclaredTypeNames(text));
  const aliases = new Set(
    blocks
      .filter((block) => block.kind === "use")
      .map((block) => block.alias ?? block.name),
  );
  const ruleBlocks = blocks.filter((block) => block.kind === "rule");
  const patterns = [
    /^\s*when\s*:\s*[A-Za-z_][A-Za-z0-9_]*\s*:\s*([A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)?)\./gm,
    /^\s*when\s*:\s*([A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)?)\.created\s*\(/gm,
    /^\s*ensures\s*:\s*([A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)?)\.created\s*\(/gm,
  ];

  for (const rule of ruleBlocks) {
    for (const pattern of patterns) {
      for (
        let match = pattern.exec(rule.body);
        match;
        match = pattern.exec(rule.body)
      ) {
        const typeName = match[1];
        const offset =
          rule.startOffset + 1 + match.index + match[0].indexOf(typeName);
        findings.push(
          ...validateTypeNameReference(
            typeName,
            offset,
            lineStarts,
            declaredTypes,
            aliases,
            "allium.rule.undefinedTypeReference",
            "allium.rule.undefinedImportedAlias",
          ),
        );
      }
    }
  }
  return findings;
}

function findContextBindingIssues(
  text: string,
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const localEntityTypes = new Set<string>();
  const declaredEntityPattern =
    /^\s*(?:external\s+)?entity\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm;
  for (
    let match = declaredEntityPattern.exec(text);
    match;
    match = declaredEntityPattern.exec(text)
  ) {
    localEntityTypes.add(match[1]);
  }
  const variantPattern = /^\s*variant\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/gm;
  for (
    let match = variantPattern.exec(text);
    match;
    match = variantPattern.exec(text)
  ) {
    localEntityTypes.add(match[1]);
  }

  const importAliases = new Set(
    blocks
      .filter((block) => block.kind === "use")
      .map((block) => block.alias ?? block.name),
  );
  const contextBlocks = blocks.filter((block) => block.kind === "context");
  const bindingPattern =
    /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)?)\s*$/gm;

  for (const block of contextBlocks) {
    const seenBindings = new Set<string>();
    for (
      let match = bindingPattern.exec(block.body);
      match;
      match = bindingPattern.exec(block.body)
    ) {
      const bindingName = match[1];
      const bindingType = match[2];
      const bindingOffset =
        block.startOffset + 1 + match.index + match[0].indexOf(bindingName);

      if (seenBindings.has(bindingName)) {
        findings.push(
          rangeFinding(
            lineStarts,
            bindingOffset,
            bindingOffset + bindingName.length,
            "allium.context.duplicateBinding",
            `Context binding '${bindingName}' is declared more than once.`,
            "error",
          ),
        );
      }
      seenBindings.add(bindingName);

      if (bindingType.includes("/")) {
        const alias = bindingType.split("/")[0];
        if (!importAliases.has(alias)) {
          const typeOffset =
            block.startOffset + 1 + match.index + match[0].indexOf(bindingType);
          findings.push(
            rangeFinding(
              lineStarts,
              typeOffset,
              typeOffset + bindingType.length,
              "allium.context.undefinedType",
              `Context binding type '${bindingType}' does not resolve to a local entity or imported alias.`,
              "error",
            ),
          );
        }
        continue;
      }

      if (!localEntityTypes.has(bindingType)) {
        const typeOffset =
          block.startOffset + 1 + match.index + match[0].indexOf(bindingType);
        findings.push(
          rangeFinding(
            lineStarts,
            typeOffset,
            typeOffset + bindingType.length,
            "allium.context.undefinedType",
            `Context binding type '${bindingType}' does not resolve to a local entity or imported alias.`,
            "error",
          ),
        );
      }
    }
  }

  return findings;
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

function offsetToPosition(
  lineStarts: number[],
  offset: number,
): { line: number; character: number } {
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
  severity: FindingSeverity,
): Finding {
  return {
    code,
    message,
    severity,
    start: offsetToPosition(lineStarts, startOffset),
    end: offsetToPosition(lineStarts, endOffset),
  };
}

function findSurfaceActorLinkIssues(
  _text: string,
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const actorNames = new Set(
    blocks.filter((block) => block.kind === "actor").map((block) => block.name),
  );
  const surfaceBlocks = blocks.filter((block) => block.kind === "surface");
  const referencedActors = new Set<string>();
  const forPattern =
    /^\s*for\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/m;

  for (const surface of surfaceBlocks) {
    const match = surface.body.match(forPattern);
    if (!match) {
      continue;
    }
    const actorName = match[1];
    referencedActors.add(actorName);
    if (!actorNames.has(actorName)) {
      const lineOffset =
        surface.startOffset + 1 + surface.body.indexOf(match[0]);
      findings.push(
        rangeFinding(
          lineStarts,
          lineOffset,
          lineOffset + match[0].length,
          "allium.surface.missingActor",
          `Surface '${surface.name}' references actor '${actorName}' which is not declared locally.`,
          "warning",
        ),
      );
    }
  }

  for (const actor of blocks.filter((block) => block.kind === "actor")) {
    if (referencedActors.has(actor.name)) {
      continue;
    }
    findings.push(
      rangeFinding(
        lineStarts,
        actor.startOffset,
        actor.startOffset + actor.name.length,
        "allium.actor.unused",
        `Actor '${actor.name}' is not referenced by any local surface.`,
        "info",
      ),
    );
  }

  return findings;
}

function findSurfaceRelatedIssues(
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const surfaceBlocks = blocks.filter((block) => block.kind === "surface");
  const knownSurfaceNames = new Set(
    surfaceBlocks.map((surface) => surface.name),
  );

  for (const surface of surfaceBlocks) {
    const relatedRefs = parseRelatedReferences(surface.body);
    for (const ref of relatedRefs) {
      if (knownSurfaceNames.has(ref.name)) {
        continue;
      }
      const offset = surface.startOffset + 1 + ref.offsetInBody;
      findings.push(
        rangeFinding(
          lineStarts,
          offset,
          offset + ref.name.length,
          "allium.surface.relatedUndefined",
          `Surface '${surface.name}' references unknown related surface '${ref.name}'.`,
          "error",
        ),
      );
    }
  }

  return findings;
}

function findSurfaceBindingUsageIssues(
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const surfaceBlocks = blocks.filter((block) => block.kind === "surface");

  for (const surface of surfaceBlocks) {
    const body = surface.body;
    const forMatch = body.match(
      /^\s*for\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*[A-Za-z_][A-Za-z0-9_]*(?:\s+with\s+.+)?\s*$/m,
    );
    const contextMatch = body.match(
      /^\s*context\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*[A-Za-z_][A-Za-z0-9_]*(?:\s+with\s+.+)?\s*$/m,
    );
    const bindings = [
      ...(forMatch
        ? [{ name: forMatch[1], source: "for", line: forMatch[0] }]
        : []),
      ...(contextMatch
        ? [{ name: contextMatch[1], source: "context", line: contextMatch[0] }]
        : []),
    ];

    for (const binding of bindings) {
      const usagePattern = new RegExp(
        `\\b${escapeRegex(binding.name)}\\b`,
        "g",
      );
      const matches = [...body.matchAll(usagePattern)];
      if (matches.length > 1) {
        continue;
      }

      const linePattern = new RegExp(
        `^\\s*${binding.source}\\s+${escapeRegex(binding.name)}\\s*:`,
        "m",
      );
      const lineMatch = body.match(linePattern);
      if (!lineMatch) {
        continue;
      }
      const offsetInBody = body.indexOf(lineMatch[0]);
      const absoluteOffset =
        surface.startOffset +
        1 +
        offsetInBody +
        lineMatch[0].indexOf(binding.name);
      findings.push(
        rangeFinding(
          lineStarts,
          absoluteOffset,
          absoluteOffset + binding.name.length,
          "allium.surface.unusedBinding",
          `Surface '${surface.name}' binding '${binding.name}' from '${binding.source}' is not used in the surface body.`,
          "warning",
        ),
      );
    }
  }

  return findings;
}

function findSurfaceNamedBlockUniquenessIssues(
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const surfaces = blocks.filter((block) => block.kind === "surface");
  for (const surface of surfaces) {
    findings.push(
      ...findDuplicateNamedSurfaceBlocks(
        surface,
        lineStarts,
        "requires",
        "allium.surface.duplicateRequiresBlock",
      ),
    );
    findings.push(
      ...findDuplicateNamedSurfaceBlocks(
        surface,
        lineStarts,
        "provides",
        "allium.surface.duplicateProvidesBlock",
      ),
    );
  }
  return findings;
}

function findSurfaceProvidesTriggerIssues(
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
  text: string,
): Finding[] {
  const findings: Finding[] = [];
  const knownExternalTriggers = collectExternalStimulusTriggers(text);
  const surfaces = blocks.filter((block) => block.kind === "surface");
  for (const surface of surfaces) {
    const providesCalls = parseProvidesTriggerCalls(surface.body);
    for (const call of providesCalls) {
      if (knownExternalTriggers.has(call.name)) {
        continue;
      }
      const offset = surface.startOffset + 1 + call.offsetInBody;
      findings.push(
        rangeFinding(
          lineStarts,
          offset,
          offset + call.name.length,
          "allium.surface.undefinedProvidesTrigger",
          `Surface '${surface.name}' provides trigger '${call.name}' which is not defined as an external stimulus rule trigger.`,
          "error",
        ),
      );
    }
  }
  return findings;
}

function collectExternalStimulusTriggers(text: string): Set<string> {
  const out = new Set<string>();
  const rulePattern = /^\s*rule\s+[A-Za-z_][A-Za-z0-9_]*\s*\{([\s\S]*?)^\s*}/gm;
  for (let rule = rulePattern.exec(text); rule; rule = rulePattern.exec(text)) {
    const body = rule[1];
    const whenLine = body.match(/^\s*when\s*:\s*(.+)$/m);
    if (!whenLine) {
      continue;
    }
    const trigger = whenLine[1].trim();
    if (
      trigger.includes(":") ||
      /\b(becomes|<=|>=|<|>|and|or|if|exists)\b/.test(trigger)
    ) {
      continue;
    }
    const callMatch = trigger.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (callMatch) {
      out.add(callMatch[1]);
    }
  }
  return out;
}

function parseProvidesTriggerCalls(
  body: string,
): Array<{ name: string; offsetInBody: number }> {
  const calls: Array<{ name: string; offsetInBody: number }> = [];
  const sectionPattern = /^(\s*)provides\s*:\s*$/gm;
  for (
    let section = sectionPattern.exec(body);
    section;
    section = sectionPattern.exec(body)
  ) {
    const baseIndent = (section[1] ?? "").length;
    let cursor = section.index + section[0].length + 1;
    while (cursor < body.length) {
      const lineEnd = body.indexOf("\n", cursor);
      const end = lineEnd >= 0 ? lineEnd : body.length;
      const line = body.slice(cursor, end);
      const trimmed = line.trim();
      const indent = (line.match(/^\s*/) ?? [""])[0].length;

      if (trimmed.length === 0) {
        cursor = end + 1;
        continue;
      }
      if (indent <= baseIndent) {
        break;
      }
      const callMatch = line.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      if (callMatch) {
        calls.push({
          name: callMatch[1],
          offsetInBody: cursor + line.indexOf(callMatch[1]),
        });
      }
      cursor = end + 1;
    }
  }
  return calls;
}

function findUnusedEntityIssues(text: string, lineStarts: number[]): Finding[] {
  const findings: Finding[] = [];
  const entityPattern =
    /^\s*(?:external\s+)?entity\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm;
  for (
    let match = entityPattern.exec(text);
    match;
    match = entityPattern.exec(text)
  ) {
    const name = match[1];
    const usagePattern = new RegExp(`\\b${escapeRegex(name)}\\b`, "g");
    let count = 0;
    for (
      let usage = usagePattern.exec(text);
      usage;
      usage = usagePattern.exec(text)
    ) {
      if (isCommentLineAtIndex(text, usage.index)) {
        continue;
      }
      count += 1;
    }
    if (count > 1) {
      continue;
    }
    const offset = match.index + match[0].indexOf(name);
    findings.push(
      rangeFinding(
        lineStarts,
        offset,
        offset + name.length,
        "allium.entity.unused",
        `Entity '${name}' is declared but not referenced elsewhere in this specification.`,
        "warning",
      ),
    );
  }
  return findings;
}

function findExternalEntitySourceHints(
  text: string,
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const hasImports = blocks.some((block) => block.kind === "use");
  if (hasImports) {
    return findings;
  }
  const pattern = /^\s*external\s+entity\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const name = match[1];
    const offset = match.index + match[0].indexOf(name);
    findings.push(
      rangeFinding(
        lineStarts,
        offset,
        offset + name.length,
        "allium.externalEntity.missingSourceHint",
        `External entity '${name}' has no obvious governing specification import in this module.`,
        "warning",
      ),
    );
  }
  return findings;
}

function findDeferredLocationHints(
  text: string,
  lineStarts: number[],
): Finding[] {
  const findings: Finding[] = [];
  const pattern = /^\s*deferred\s+([A-Za-z_][A-Za-z0-9_.]*)(.*)$/gm;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const suffix = (match[2] ?? "").trim();
    if (
      suffix.includes("http://") ||
      suffix.includes("https://") ||
      suffix.includes('"')
    ) {
      continue;
    }
    const name = match[1];
    const offset = match.index + match[0].indexOf(name);
    findings.push(
      rangeFinding(
        lineStarts,
        offset,
        offset + name.length,
        "allium.deferred.missingLocationHint",
        `Deferred specification '${name}' should include a location hint.`,
        "warning",
      ),
    );
  }
  return findings;
}

function findImplicitLambdaIssues(
  text: string,
  lineStarts: number[],
): Finding[] {
  const findings: Finding[] = [];
  const pattern = /\.((?:any|all|each))\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g;

  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (isCommentLineAtIndex(text, match.index)) {
      continue;
    }
    const operator = match[1];
    const shorthand = match[2];
    const shorthandOffset = match.index + match[0].lastIndexOf(shorthand);
    findings.push(
      rangeFinding(
        lineStarts,
        shorthandOffset,
        shorthandOffset + shorthand.length,
        "allium.expression.implicitLambda",
        `Collection operator '${operator}' must use an explicit lambda (for example 'x => ...') instead of shorthand '${shorthand}'.`,
        "error",
      ),
    );
  }

  return findings;
}

function findDuplicateNamedSurfaceBlocks(
  surface: ReturnType<typeof parseAlliumBlocks>[number],
  lineStarts: number[],
  keyword: "requires" | "provides",
  code: string,
): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const pattern = new RegExp(
    `^\\s*${keyword}\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*:`,
    "gm",
  );
  for (
    let match = pattern.exec(surface.body);
    match;
    match = pattern.exec(surface.body)
  ) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      continue;
    }
    const offset =
      surface.startOffset + 1 + match.index + match[0].indexOf(name);
    findings.push(
      rangeFinding(
        lineStarts,
        offset,
        offset + name.length,
        code,
        `Surface '${surface.name}' has duplicate named '${keyword}' block '${name}'.`,
        "error",
      ),
    );
  }
  return findings;
}

function parseRelatedReferences(
  body: string,
): Array<{ name: string; offsetInBody: number }> {
  const refs: Array<{ name: string; offsetInBody: number }> = [];
  const relatedPattern = /^(\s*)related\s*:\s*$/gm;
  for (
    let related = relatedPattern.exec(body);
    related;
    related = relatedPattern.exec(body)
  ) {
    const baseIndent = (related[1] ?? "").length;
    const sectionStart = related.index + related[0].length + 1;
    let cursor = sectionStart;

    while (cursor < body.length) {
      const nextNewline = body.indexOf("\n", cursor);
      const lineEnd = nextNewline >= 0 ? nextNewline : body.length;
      const line = body.slice(cursor, lineEnd);
      const trimmed = line.trim();
      const indent = (line.match(/^\s*/) ?? [""])[0].length;

      if (trimmed.length === 0) {
        cursor = lineEnd + 1;
        continue;
      }
      if (indent <= baseIndent) {
        break;
      }
      if (!trimmed.startsWith("--")) {
        const identifierPattern = /([A-Za-z_][A-Za-z0-9_]*)/g;
        for (
          let ident = identifierPattern.exec(line);
          ident;
          ident = identifierPattern.exec(line)
        ) {
          refs.push({
            name: ident[1],
            offsetInBody: cursor + ident.index,
          });
        }
      }

      cursor = lineEnd + 1;
    }
  }
  return refs;
}

function parseVariantDeclarations(
  text: string,
): Array<{ name: string; base: string; startOffset: number }> {
  const out: Array<{ name: string; base: string; startOffset: number }> = [];
  const pattern =
    /^\s*variant\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    out.push({
      name: match[1],
      base: match[2],
      startOffset: match.index + match[0].indexOf(match[1]),
    });
  }
  return out;
}

function collectDeclaredTypeNames(text: string): string[] {
  const out = new Set<string>();
  const patterns = [
    /^\s*(?:external\s+)?entity\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm,
    /^\s*value\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm,
    /^\s*variant\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm,
    /^\s*enum\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm,
    /^\s*actor\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm,
  ];
  for (const pattern of patterns) {
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      out.add(match[1]);
    }
  }
  return [...out];
}

function collectFieldTypeSites(
  text: string,
): Array<{ typeExpression: string; startOffset: number }> {
  const out: Array<{ typeExpression: string; startOffset: number }> = [];
  const blockPattern =
    /^\s*(?:external\s+entity|entity|value|variant)\s+[A-Za-z_][A-Za-z0-9_]*(?:\s*:\s*[A-Za-z_][A-Za-z0-9_]*)?\s*\{/gm;
  for (
    let block = blockPattern.exec(text);
    block;
    block = blockPattern.exec(text)
  ) {
    const open = text.indexOf("{", block.index);
    if (open < 0) {
      continue;
    }
    const close = findMatchingBrace(text, open);
    if (close < 0) {
      continue;
    }
    const body = text.slice(open + 1, close);
    const fieldPattern = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*:\s*([^=\n]+)$/gm;
    for (
      let field = fieldPattern.exec(body);
      field;
      field = fieldPattern.exec(body)
    ) {
      const typeExpression = field[1].trim();
      out.push({
        typeExpression,
        startOffset: open + 1 + field.index + field[0].indexOf(typeExpression),
      });
    }
  }
  return out;
}

function collectEntityStatusEnums(text: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const entityPattern =
    /^\s*(?:external\s+)?entity\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm;
  for (
    let entity = entityPattern.exec(text);
    entity;
    entity = entityPattern.exec(text)
  ) {
    const open = text.indexOf("{", entity.index);
    if (open < 0) {
      continue;
    }
    const close = findMatchingBrace(text, open);
    if (close < 0) {
      continue;
    }
    const body = text.slice(open + 1, close);
    const statusField = body.match(
      /^\s*status\s*:\s*([a-z_][a-z0-9_]*(?:\s*\|\s*[a-z_][a-z0-9_]*)+)\s*$/m,
    );
    if (!statusField) {
      continue;
    }
    const values = statusField[1]
      .split("|")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    out.set(entity[1], new Set(values));
  }
  return out;
}

function validateTypeNameReference(
  typeName: string,
  offset: number,
  lineStarts: number[],
  declaredTypes: Set<string>,
  aliases: Set<string>,
  undefinedTypeCode: string,
  undefinedAliasCode: string,
): Finding[] {
  if (typeName.includes("/")) {
    const alias = typeName.split("/")[0];
    if (aliases.has(alias)) {
      return [];
    }
    return [
      rangeFinding(
        lineStarts,
        offset,
        offset + typeName.length,
        undefinedAliasCode,
        `Type reference '${typeName}' uses unknown import alias '${alias}'.`,
        "error",
      ),
    ];
  }
  if (/^[a-z]/.test(typeName) || declaredTypes.has(typeName)) {
    return [];
  }
  return [
    rangeFinding(
      lineStarts,
      offset,
      offset + typeName.length,
      undefinedTypeCode,
      `Type reference '${typeName}' is not declared locally or imported.`,
      "error",
    ),
  ];
}

function parseEntityBlocks(text: string): Array<{
  name: string;
  pipeFields: Array<{
    fieldName: string;
    names: string[];
    rawNames: string;
    allNamesCapitalized: boolean;
    hasCapitalizedName: boolean;
    startOffset: number;
  }>;
}> {
  const entities: Array<{
    name: string;
    pipeFields: Array<{
      fieldName: string;
      names: string[];
      rawNames: string;
      allNamesCapitalized: boolean;
      hasCapitalizedName: boolean;
      startOffset: number;
    }>;
  }> = [];
  const pattern =
    /^\s*(?:external\s+)?entity\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const open = text.indexOf("{", match.index);
    if (open < 0) {
      continue;
    }
    const close = findMatchingBrace(text, open);
    if (close < 0) {
      continue;
    }
    const body = text.slice(open + 1, close);
    const pipeFields: Array<{
      fieldName: string;
      names: string[];
      rawNames: string;
      allNamesCapitalized: boolean;
      hasCapitalizedName: boolean;
      startOffset: number;
    }> = [];
    const fieldPattern =
      /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*(?:\s*\|\s*[A-Za-z_][A-Za-z0-9_]*)+)\s*$/gm;
    for (
      let field = fieldPattern.exec(body);
      field;
      field = fieldPattern.exec(body)
    ) {
      const rawNames = field[2];
      const names = rawNames.split("|").map((v) => v.trim());
      const hasCapitalizedName = names.some((n) => /^[A-Z]/.test(n));
      const allNamesCapitalized = names.every((n) => /^[A-Z]/.test(n));
      pipeFields.push({
        fieldName: field[1],
        names,
        rawNames,
        hasCapitalizedName,
        allNamesCapitalized,
        startOffset: open + 1 + field.index + field[0].indexOf(rawNames),
      });
    }
    entities.push({ name: match[1], pipeFields });
  }
  return entities;
}

function applySuppressions(
  findings: Finding[],
  text: string,
  lineStarts: number[],
): Finding[] {
  const directives = collectSuppressions(text, lineStarts);
  return findings.filter((finding) => {
    const line = finding.start.line;
    const lineSuppressed = directives.get(line);
    const prevLineSuppressed = directives.get(line - 1);
    const active = lineSuppressed ?? prevLineSuppressed;
    if (!active) {
      return true;
    }
    return !(active.has("all") || active.has(finding.code));
  });
}

function collectSuppressions(
  text: string,
  lineStarts: number[],
): Map<number, Set<string>> {
  const suppressionByLine = new Map<number, Set<string>>();
  const pattern = /^\s*--\s*allium-ignore\s+([A-Za-z0-9._,\- \t]+)$/gm;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const line = offsetToPosition(lineStarts, match.index).line;
    const codes = match[1]
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    suppressionByLine.set(line, new Set(codes));
  }
  return suppressionByLine;
}

function isCommentLineAtIndex(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const lineEnd = text.indexOf("\n", index);
  const line = text.slice(lineStart, lineEnd >= 0 ? lineEnd : text.length);
  return /^\s*--/.test(line);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
