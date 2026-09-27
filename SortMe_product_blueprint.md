# SortMe — product and build blueprint

## Product promise

SortMe is a personal planning agent that turns a person's goals, commitments, energy, and interruptions into a realistic daily plan. It learns from what the person actually completes, then adjusts the next plan without treating a missed task as failure. The key interaction is: **tell SortMe what changed; see an explained, editable new schedule.**

## First user and first release

Start with one user type: a working professional or student balancing study, interviews, personal projects, and health habits. The founder, who uses an iPhone, is the first test account. Build the iOS and Android app together in React Native; a web dashboard can follow. The first release needs no mailbox, Instagram account, GitHub access, or automatic phone-usage access to be useful.

First-release capabilities:

1. Onboarding asks for timezone, sleep and wake range, recurring fixed commitments, travel time, goals, deadlines, preferred work blocks, breaks, meals, and notification preferences. Every answer is editable.
2. Capture tasks in plain language, with deadline, estimate, priority, minimum useful session length, and whether they can move. Let the user correct inferred fields before saving.
3. Generate a day plan with fixed events, sleep, meals, breaks, travel, focus blocks, and a buffer for surprises. Show the reason for each placement.
4. Reschedule on an interruption. Show what moved, what was shortened or deferred, deadline risk, and the reason. Allow one-tap accept, edit, or undo.
5. Start and stop focus sessions. Record actual time and the user's quick outcome (done, partly done, blocked). Increase session length gradually using observed comfort, not a blanket productivity score.
6. Morning check-in, an optional midday adjustment, and evening review. Use history to improve estimates and future plans.
7. Give a daily interview-prep question from user-selected notes and track attempts, answers, and topics needing practice. Support pasted notes and file upload first; Google Docs integration later.

## Core rescheduling example

Input: 18:00–19:00 interview preparation, 19:00–20:00 portfolio work, 20:00 dinner, 21:00–22:00 study. At 17:45, the user reports an internship assignment due tomorrow requiring two hours tonight.

The planner identifies the immovable commitments, checks the assignment deadline and available time, preserves dinner and sleep, and proposes 18:00–19:30 assignment, 19:30–20:00 dinner, 20:00–20:30 interview review, 20:30–21:00 assignment completion, 21:00–21:30 study, with portfolio work deferred. It warns if the assignment actually needs more time than the evening has. The user can edit and accept the revision. Store both plan versions and the reason for the change.

The planner must never quietly erase a task. It should explicitly mark it scheduled, deferred, delegated, completed, or at risk.

## Planning design

Use a deterministic scheduling service for time arithmetic and constraints. Use Gemini for extracting tasks, summarizing context, suggesting tradeoffs, explaining changes, and generating study questions. Require structured output, validate it on the server, and never allow an LLM response to write calendar events or change tasks directly.

Hard constraints: sleep window, fixed commitments, deadlines, minimum meal and break windows, user-marked protected time, timezone, and maximum available hours. Soft preferences: best focus time, task importance, energy, preferred session length, context switching, and buffer. Prioritize deadlines and user importance while limiting schedule churn. When no feasible plan exists, show which obligations conflict and ask the user to choose the tradeoff.

Each scheduling run returns: `planVersion`, `scheduledBlocks`, `unscheduledTasks`, `atRiskTasks`, `changesFromPrevious`, `explanations`, and `confidenceOrMissingInformation`. Never represent an uncertain estimate as a fixed fact.

## Integrations, in order

| Stage | Source | Purpose | User control and constraint |
| --- | --- | --- | --- |
| 1 | Manual entry, pasted notes, uploaded files | Establish the planning loop and interview practice | Works without connecting accounts. |
| 2 | Google Calendar | Read fixed events; optionally write accepted SortMe blocks to a separate calendar | Separate read and write consent; avoid modifying existing meetings. |
| 3 | Selected Google Docs via Drive Picker | Read opted-in interview and study notes; quote or link the source in answers | Prefer per-file `drive.file` access rather than broad Drive access. |
| 4 | GitHub | Pull selected issues, PRs, and deadlines into suggested tasks | Show source and require confirmation before creating tasks. |
| 5 | Gmail | Detect interviews, deadlines, and unanswered follow-ups | Gmail read scopes are restricted; public rollout may require verification and further review. Start with forwarded/pasted emails if needed. |
| Later | Android device usage | Show Instagram and gaming time as observed device usage | Requires explicit usage access in Android settings and a native module; do not claim access to Instagram's private usage data. |
| Research separately | iOS Screen Time features | Explore native focus controls and privacy-preserving device activity reports | Requires Apple's Family Controls entitlement and user authorization. Direct access to identifiable app and website usage data under `FamilyActivityData` is currently EU-only, so do not promise automatic per-app totals for the founder's iPhone in India. |

Connections are optional and revocable. An email or document is untrusted input: it may suggest a task, but cannot issue instructions to the agent or authorize actions. Save source IDs and concise extracted facts when possible; make raw content retention optional and short-lived.

## Suggested architecture

- **Mobile:** One Expo React Native + TypeScript app targeting iOS and Android from day one. Share onboarding, scheduling UI, focus sessions, notes, and account connections. Build and test both platforms continuously, starting with the founder's iPhone. Use platform-specific native modules only for later device usage features: Swift and Apple's Screen Time frameworks on iOS where permitted, Kotlin and `UsageStatsManager` on Android. Those modules require Expo development builds, since Expo Go cannot load arbitrary native code.
- **Backend:** Java 17 and Spring Boot (the founder's current stack), PostgreSQL with Flyway, scheduled workers for reminders and sync, Google OAuth on the server, and a Gemini adapter behind an `AiProvider` interface.
- **AI:** Put Gemini behind an `AiProvider` interface and check the billing route before selecting Google AI Studio's Gemini Developer API or Google Cloud's Vertex AI route. Google's current billing guidance excludes newer $300 Welcome credits from Gemini API/AI Studio usage; do not assume the purchased credits cover either route. Start with a low-cost model, structured output, bounded context, and a daily per-user budget. Keep model selection configurable.
- **Data:** `users`, `preferences`, `goals`, `tasks`, `recurring_commitments`, `calendar_events`, `plan_versions`, `plan_blocks`, `focus_sessions`, `check_ins`, `external_connections`, `external_source_refs`, `documents`, `study_questions`, `question_attempts`, `interview_events`, `suggestions`, and `audit_events`.
- **Security:** Encrypt OAuth refresh tokens at rest, restrict access per user, request minimum scopes, allow disconnect and account/data deletion, and show every external write before it runs. Keep precise notes about what data is read and why.

## Minimal API

`POST /onboarding`, `GET/PUT /preferences`, `POST/GET/PATCH /tasks`, `POST /plans/generate`, `POST /plans/{id}/replan`, `POST /plans/{id}/accept`, `GET /plans/today`, `POST /focus-sessions`, `POST /check-ins`, `POST /notes/import`, `POST /questions/generate`, `POST /questions/{id}/attempt`, and `GET/DELETE /connections/{provider}`.

The replan request includes an event such as `new_task`, `late_start`, `event_changed`, or `energy_changed` plus the current plan version. Reject or reconcile stale version updates so two devices cannot silently overwrite each other's plans.

## Delivery sequence and acceptance checks

1. **Planning prototype:** onboarding, task capture, deterministic planner, editable day view, revision history. Check: a new urgent task can enter the day without losing the old tasks; fixed appointments and sleep remain intact; impossible schedules surface a conflict.
2. **Adaptive loop:** focus timer, actual-vs-estimated time, check-ins, notifications, plan adjustment. Check: the plan changes after a user reports a delay or low energy and explains the tradeoff.
3. **Study coach:** selected notes, retrieval of relevant passages, daily questions, answer feedback. Check: question and feedback link to the underlying note, and the system says when the source has no answer.
4. **Connections:** Calendar, selected Docs, GitHub, and Gmail, then platform-specific device usage research, each behind a feature flag and separate permission. Check: revoking a connection stops sync; imported items have a source; no external write occurs without user approval. Ship iOS and Android builds at every stage, even when a particular optional device feature is only available on one platform.
5. **Pilot:** founder plus a small opt-in group. Measure accepted/rejected replans, tasks completed, schedule churn, daily active use, question attempts, permission revocations, model cost per active user, and user-reported usefulness. Do not use weight change or screen time alone as a success measure.

## Initial decisions and open choices

Default to **React Native for iOS and Android from the first release**, **the founder's iPhone as the first pilot device**, **personal productivity and study as the first use case**, and **manual capture plus Calendar and selected Docs before Gmail**. Let users manually set a distraction budget on either platform without promising unsupported screen-time access. Treat food, weight change, and other health goals initially as user-defined reminders and habits; avoid medical or nutritional prescriptions until the product has an appropriate evidence and safety design. Allow people to set their own healthy goals and skip weight tracking entirely.

Before implementation, refine the first pilot's primary user beyond the founder (students, job seekers, or working professionals) and check the exact type/expiry of the Google credits. These choices affect onboarding and billing. In the Cloud Billing console, check the credit name, eligible services, remaining balance, and expiry date before selecting the AI endpoint.
