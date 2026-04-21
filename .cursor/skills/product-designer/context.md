# Product Context

## Product Summary

`Noads` is a lightweight Chrome extension that blocks ads by removing specific DOM elements with CSS selectors. The product should feel simple, fast, and easy to trust.

## Target User Job

Help people remove distracting page elements with minimal setup so browsing feels cleaner and more focused.

## Design Principles

- Favor clarity and low friction over feature breadth.
- The popup should prioritize the current page first, because the primary user goal is to make the page they are viewing cleaner right now.
- Users should understand the state within a few seconds: whether Noads is active on this page, whether the site is paused, and what the next recommended action is.
- Prefer outcome-oriented UX over exposing implementation concepts too early; raw selector management is important, but it should feel secondary to the "clean this page" job.
- Keep every risky action reversible and visible, especially site-level pause or allowlist behavior.

## Product Constraints

- The product is a Chrome extension.
- The popup surface is compact, so information hierarchy must be strict and the default flow must stay short.

## Durable Trade-Offs

- Simplicity is more important than adding advanced controls too early.
- A smaller, understandable feature set is better than a powerful but confusing experience.
- The default experience should optimize for trust and comprehension, even if that means advanced power-user controls are one step deeper.
