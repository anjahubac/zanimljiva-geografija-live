# Implementation review log

Date: 2026-10-07. Runtime implementation and automated review are complete on local branch `010-post-round-coach`; live, browser and human pair gates remain pending. The owner approved the existing specification and explicitly requested implementation by the Luna model. The workflow has exactly two model decisions. No push, deployment or pull request is authorized.

The implementation model is Luna; the parent agent reviews specification fidelity, producer/consumer compatibility and verification. The complete specification, impact matrix, canonical contracts, assignment, plan and tasks were supplied to Luna before code. Runtime work started after parent review corrected the initial plan's contract and path drift.

| Review finding | Decision and current disposition |
| --- | --- |
| Shared request refinement used Node-only `Buffer` | Use browser-safe UTF-8 counting. Corrected in source. |
| Terminal acknowledgement accepted nonterminal statuses and inconsistent success | Restricted to completed/stopped/failed with result/reason/counter and evidence checks. Direct socket malformed/stale acknowledgement regressions and full suite passed. |
| Tool output checks did not validate all derived facts | Compare against deterministic expected output, including all category facts, aggregates, verification, eligibility, ordering and source version. Corrected in source. |
| Unverified rounds incorrectly lost local letter/length advice | Gate only geography/category claims on verification. Recorded local letter and minimum-length reasons still support advice. Corrected in source. |
| Added localized strings had corrupted Unicode | Correct the new strings and add a Unicode regression. Corrected in source. |
| First orchestration draft counted successful outer decisions as provider attempts | Actual adapter invocations use a synchronous quota/counter gate; separate step/tool counters and one run ID remain. Guard and real Socket.IO quota regressions passed. |
| Initial promise races leaked timers and did not settle promptly on cancellation | Injected scheduling, independent abort races, cleanup and late-result suppression are in place. Deadline, late response, disconnect and TTL regressions passed. |
| Provider request schema contained loose nested objects | Send complete per-step structured-output schemas and test outbound Gemini/Groq HTTP payloads with fake transport. Corrected in source; live provider acceptance is not yet observed. |
| Quota fallback could bypass the one-recovery limit | Fallback consumes recovery and the selected model stays pinned between decisions. Guard regressions and full suite passed. |
| Error mapping and quota/counter placement still had edge cases | Timeout/refusal/invalid-output are classified, thrown adapters clean up, and charging happens immediately before invocation. Source review and full suite passed. |
| A 429 response was retried immediately | Added injected, abortable bounded backoff and checked the recovery allowance before waiting. The guard tests exercise a fitting Retry-After, excessive wait and exhausted recovery. Source review and full suite passed. |
| The composed service passed a full acknowledgement into a strict telemetry subset schema | Added explicit safe projection and composed-service regressions. Empty usage retains attempt metadata; token sums report only returned values. Source review and full suite passed. |
| Source-current checks compared an original snapshot to a Zod-parsed clone by reference | Compare the retained snapshot to its captured original reference and validate its detached projection separately. Real Socket.IO tests now complete through the guard, engine, tool and private acknowledgement for both friend seats. Source review and full suite passed. |
| The live smoke ledger accepted unvalidated JSON and concurrent processes could race its run cap | Added strict ledger validation, exclusive local locking and a real atomic attempt-quota gate. The run ledger reserves before provider work and fails closed. Live credentials remain absent; provider behavior has not been tested live. |
| Initial privacy assertion inspected only public event names | Capture actual public event payloads, submit own/opponent injection sentinels, and inspect received provider contexts. The revised assertion can detect leaked run/evidence content. |
| Client reducer/rendering tests did not exercise the acknowledgement boundary | Direct client socket timeout, abort, malformed/stale acknowledgement and rejected-input tests passed. |
| Completed acknowledgement evidence could contain contradictory cell facts | Added flag/point invariants and regressions with consistent aggregates and an unaffected recommendation, so only the contradictory cell causes rejection. Full suite passed. |
| An optional capability could throw after source disposal | Cancellation now takes priority in the store catch path; late-rejection and late-result lifecycle regressions passed. |
| Terminal UI lacked localized reasons and logs lacked validation outcomes | Added typed closed SR/EN reason text and at most two sanitized proposal records plus one tool outcome. Composed success/denial and client rendering regressions passed. |
| Final lint found three unused imports and two explicit-any captures | Removed unused imports and parsed typed fake HTTP captures with Zod; no lint rule was relaxed. Full verification then passed. |

The source uses the exact canonical reveal/results facts for its detached own-seat projection. Coaching does not rejudge answers or recompute canonical scoring. The legacy AI service remains a separate capability from coaching. The owner-approved limits remain two model decisions, one read-only tool execution, three actual provider attempts, one recovery/fallback and one shared 30-second deadline.

No real provider calls have been made during implementation. `.env` and process-level Gemini/Groq credentials were absent when readiness was checked; values were not read or printed. Live demo and pair-understanding/contribution evidence remain pending.

Interactive browser verification is unavailable in this session: the browser inventory returned `apps: []` and `browsers: []`; creating the documented in-app browser tab returned `Browser is not available: iab`. Socket.IO, client rendering and state tests can still run. This is an environment limitation, not a passed browser check.

Final root verification: `npm.cmd run verify` passed typecheck, lint, all **555 tests across 40 files**, and both production builds. `coach:fake-e2e` passed all four declared scenarios and refreshed sanitized trace/result artifacts after the final runtime edits. Both smoke-readiness paths exited successfully without provider calls. Document verification checked 21 Markdown files, 85 local links (zero broken), all 50 assignment sections and identical AGENTS/CLAUDE contents.

A review-only `core.autocrlf=false` whitespace invocation produced false CRLF findings. Repeating `git diff --check` using the repository's normal line-ending behavior passed; that check did not modify files.

The first staged whitespace check also covered new files and caught trailing-space Markdown hard breaks and one extra blank line at the end of a test. The hard breaks now use CommonMark backslashes; the extra blank line was removed. `git diff --cached --check` then passed. A staging attempt with a temporary `NUL` exclude-file override failed; ordinary `git add` succeeded without changing repository configuration. No runtime behavior changed in this cleanup.

Test outcomes and remaining gates are recorded in [the evidence document](../../docs/EVIDENCE_W05.md). This automated milestone is ready for the authorized local commit. It does not mean the live demo, interactive browser review or human pair requirements are complete.
