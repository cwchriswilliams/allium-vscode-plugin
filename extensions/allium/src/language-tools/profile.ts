export type AlliumProfile =
  | "custom"
  | "strict-authoring"
  | "legacy-migration"
  | "doc-writing";

export function resolveDiagnosticsModeForProfile(
  profile: AlliumProfile,
  configuredMode: "strict" | "relaxed",
): "strict" | "relaxed" {
  if (profile === "strict-authoring") {
    return "strict";
  }
  if (profile === "legacy-migration" || profile === "doc-writing") {
    return "relaxed";
  }
  return configuredMode;
}
