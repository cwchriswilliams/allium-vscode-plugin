const HOVER_DOCS: Record<string, string> = {
  entity: "Defines a persisted domain concept with fields and derived values.",
  rule: "Defines a behavior: trigger (`when`), preconditions (`requires`), and outcomes (`ensures`).",
  when: "Trigger clause that starts a rule.",
  requires: "Precondition clause that must hold before a rule can apply.",
  ensures: "Outcome clause that must hold after a rule applies.",
  config:
    "Declares reusable configuration values referenced as `config.<key>`.",
  surface:
    "Defines an actor-facing projection with context, exposed fields, and capabilities.",
  actor: "Defines a principal interacting with one or more surfaces.",
  open_question:
    "Marks unresolved product or domain questions inside the specification.",
  deferred: "Declares behavior that is intentionally deferred to another spec.",
};

export function hoverTextAtOffset(text: string, offset: number): string | null {
  const token = tokenAtOffset(text, offset);
  if (!token) {
    return null;
  }

  return HOVER_DOCS[token] ?? null;
}

function tokenAtOffset(text: string, offset: number): string | null {
  if (offset < 0 || offset >= text.length) {
    return null;
  }

  const isIdent = (char: string | undefined): boolean =>
    !!char && /[A-Za-z_]/.test(char);
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
  return text.slice(start, end);
}
