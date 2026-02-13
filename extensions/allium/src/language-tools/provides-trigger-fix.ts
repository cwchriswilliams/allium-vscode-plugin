export function extractUndefinedProvidesTriggerName(
  message: string,
): string | null {
  const match = message.match(/provides trigger '([A-Za-z_][A-Za-z0-9_]*)'/);
  return match?.[1] ?? null;
}

export function buildExternalTriggerRuleScaffold(triggerName: string): string {
  const ruleName = `Emit${triggerName}`;
  return `\nrule ${ruleName} {\n    when: external_stimulus(${triggerName}(event))\n    ensures: TODO()\n}\n`;
}
