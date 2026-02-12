import {
  buildDefinitionLookup,
  findDefinitionsAtOffset,
  tokenAtOffset,
  type DefinitionSite,
} from "./definitions";
import { findReferencesInText, type ReferenceSite } from "./references";

export interface RenamePlan {
  definition: DefinitionSite;
  references: ReferenceSite[];
}

export function prepareRenameTarget(
  text: string,
  offset: number,
): { startOffset: number; endOffset: number } | null {
  const token = tokenAtOffset(text, offset);
  if (!token) {
    return null;
  }
  const definitions = findDefinitionsAtOffset(text, offset);
  if (definitions.length !== 1) {
    return null;
  }

  const bounds = tokenBoundsAtOffset(text, offset);
  if (!bounds) {
    return null;
  }
  return {
    startOffset: bounds.startOffset,
    endOffset: bounds.endOffset,
  };
}

export function planRename(
  text: string,
  offset: number,
  newName: string,
): { plan: RenamePlan | null; error?: string } {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newName)) {
    return {
      plan: null,
      error: "Allium rename target must be a valid identifier.",
    };
  }

  const definitions = findDefinitionsAtOffset(text, offset);
  if (definitions.length !== 1) {
    return {
      plan: null,
      error:
        "Rename requires an unambiguous symbol. Multiple matching definitions were found.",
    };
  }

  const definition = definitions[0];
  if (definition.name === newName) {
    return {
      plan: { definition, references: [] },
    };
  }

  const lookup = buildDefinitionLookup(text);
  const allDefinitions = [...lookup.symbols, ...lookup.configKeys];
  const conflict = allDefinitions.find(
    (candidate) =>
      candidate.name === newName &&
      candidate.startOffset !== definition.startOffset,
  );
  if (conflict) {
    return {
      plan: null,
      error: `Rename would collide with existing ${conflict.kind} '${newName}'.`,
    };
  }

  return {
    plan: {
      definition,
      references: findReferencesInText(text, definition),
    },
  };
}

function tokenBoundsAtOffset(
  text: string,
  offset: number,
): { startOffset: number; endOffset: number } | null {
  if (offset < 0 || offset >= text.length) {
    return null;
  }
  const isIdent = (char: string | undefined): boolean =>
    !!char && /[A-Za-z0-9_]/.test(char);
  let start = offset;
  while (start > 0 && isIdent(text[start - 1])) {
    start -= 1;
  }
  let end = offset;
  while (end < text.length && isIdent(text[end])) {
    end += 1;
  }
  if (start === end) {
    return null;
  }
  return { startOffset: start, endOffset: end };
}
