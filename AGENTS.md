# AGENTS.md

Guidance for human and AI agents working on this codebase.

The goals are:

* High-quality, maintainable, professional code
* Strong, meaningful tests (quality over quantity)
* Safe, predictable collaboration between humans and LLMs

> **Important:** The `README.md` is the initial guide to the key concepts in the app.
> Always read or skim `README.md` at the **start of every session**.

## 1. Coding principles

* **Clarity over cleverness**: prefer simple, readable solutions.
* **Minimal, focused changes**: make the smallest change that solves the problem well.
* **Consistency with existing patterns**: match naming, structure, and design already used in the repo.
* **Preserve existing behavior unless explicitly changing it**.
* **Respect architecture**: extend existing abstractions rather than invent new ones.
* **Error handling**: follow established error-handling conventions; avoid silent failures.
* **Dependencies**: avoid adding new libraries unless absolutely necessary and justified.

---

## 2. Testing principles

The application must be **well tested**. We value **meaningful, behavior-focused tests**, not raw coverage numbers.

* **Unit tests**: all non-trivial logic (utilities, domain rules, data transformations) must have high-quality unit tests.
* **React Testing Library (RTL) tests**: UI components must be tested through RTL, verifying behaviour from the user's perspective rather than implementation details.
* **Integration tests**: use integration tests where components, services, or layers interact — particularly around data flows, API boundaries, and the database abstraction layer.
* Test key paths, edge cases, and important error conditions.
* Avoid breaking real behaviour just to satisfy tests.
* Prefer realistic tests that reflect actual usage.
* Follow established testing conventions in the repository.
* When adding new features, create or update tests in a way that protects important logic.

---

## 3. LLM editing rules for code and tests

When modifying code or tests:

* Make targeted, minimal changes.
* Preserve formatting and style.
* Avoid refactoring unless explicitly asked.
* Do not modify large unrelated regions of code.
* After completing any new feature, update the Allium specs in `docs/project/specs/` so they reflect the current system behaviour before finishing the work.

### Tests

* Prioritize meaningful coverage: critical branches, behaviors, and edge cases.
* Avoid brittle tests tied to internal implementation details.
* Do not degrade real behavior to satisfy tests.
* Fix incorrect tests where appropriate.

## 4. Security, privacy, and sensitive data

* Never commit or write secrets, tokens, passwords, or user data.
* When in doubt, anonymize.
* Any suspected sensitive data must be replaced with `[REDACTED]`.

## 5. Sources of truth

* **Allium language semantics and syntax:** https://juxt.github.io/allium/language (authoritative for any language-level behaviour in this repository)
* **Architecture & key concepts:** `README.md` (read at the start of each session)
