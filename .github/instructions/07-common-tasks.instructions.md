---
description: "Repeatable playbooks for scoring, room lifecycle, socket events, UI, answer data, documentation, and deployment preparation."
applyTo: "**/*"
---

# Common Tasks Instructions

## Add or change a gameplay/scoring rule

1. Confirm the rule in `docs/GAME_SPEC.md` and update the spec first if the product decision changed.
2. Update the pure domain function and its input/output contract.
3. Add rule-table success and edge tests.
4. Update server orchestration and result schema if the public result changes.
5. Update UI labels, `Plan.md`, eval expectations, and README where applicable.
6. Run unit tests, integration tests, typecheck, lint, and build.

Never implement a canonical scoring rule only in the client.

## Add or change a Socket.IO event

1. Define or update strict payload, acknowledgement, and server-event schemas in `src/contracts`.
2. Identify authority, authentication-by-socket, allowed phases, timing guard, and mutation semantics.
3. Implement orchestration behavior separately from transport parsing.
4. Build a recipient-specific projection; do not broadcast internal room state.
5. Add happy-path, malformed, stale, wrong-room, wrong-phase, and no-mutation-on-rejection tests as applicable.
6. Update the client adapter, protocol documentation, and evidence scenario if relevant.

## Change the room lifecycle

1. Draw the before/after phases and guarded transitions.
2. Identify concurrent triggers and require idempotency.
3. Update timers and cleanup paths.
4. Prove invalid transitions do not mutate state.
5. Test both-finish, deadline, duplicate event, disconnect, and stale-round behavior.
6. Check that no new phase leaks hidden answers.

## Change answer normalization or validation

1. Keep raw display value separate from normalized comparison value.
2. Update the documented Unicode, whitespace, case, script, and starting-letter policy.
3. Add examples that should compare equal and examples that must remain different.
4. Re-run every scoring test because equality affects 5-versus-10 points.
5. Document dictionary coverage and unknown-answer behavior honestly.

## Add a supported letter or answer-bank entry

1. Use the existing typed data format and category allowlist.
2. Validate that every configured category has intentional coverage for the new letter.
3. Add spelling/normalization fixtures.
4. Do not enable a random letter merely because one answer exists.
5. Have the other developer review geography content separately from code correctness.

## Change the client UI

1. Use parsed server projections as the source of truth.
2. Preserve lobby/countdown/answering/locked/waiting/reveal/results and error states.
3. Keep socket handling out of presentational components.
4. Confirm the opponent's answer data is absent, not merely hidden with CSS.
5. Run the production build and manually test two isolated clients.

## Update Week 3 documents

1. Keep claims tied to actual prompts, context, code state, commands, output, screenshots, and dates.
2. Update the most specific document first.
3. Do not retroactively rewrite baseline expectations to match final behavior.
4. Do not include private reasoning, secrets, tokens, private URLs, or opponent hidden-answer payloads.
5. Record both developers' implementation and review contributions.

## Prepare deployment

1. Prove a local built server can serve the SPA, `/healthz`, and Socket.IO from one origin.
2. Confirm the selected host supports long-lived WebSocket upgrades.
3. Run one instance only while rooms are in memory.
4. Configure environment values in the host, never in committed files.
5. Complete a two-computer production round and capture safe evidence.

## Local commit handoff

Inspect `git diff --check`, `git diff`, and `git status --short`. Stage only task-scoped files, create a descriptive local commit only when requested, report its hash, and leave remotes untouched unless the user separately authorizes a push.
