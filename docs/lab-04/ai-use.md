# Lab 4 — AI Use and Reflection

**LLM/agent used:** ChatGPT (specification support) and Claude Code (code review and verification)

## Selected key prompts (6–10)

| # | Prompt (summarised) | What I did with the result |
|---|---------------------|----------------------------|
| 1 | Review the Lab 4 requirements and identify the main differences from Lab 3, especially Actions Taken, dashboards, and regression. | I used the summary to check that my Sprint 4 specification focused only on the new requirements while preserving the previous labs. |
| 2 | Help me define clear business rules for Actions Taken, including assignment, status, follow-up requirements, and role restrictions. | I used the proposed rules as a checklist when reviewing my business rules and acceptance criteria. |
| 3 | Check whether my resolution rule is precise enough: a Ticket cannot be resolved while an Action Taken is still Planned or In Progress. | I clarified the rule so that it is enforced by the backend and also covers direct API calls, not only the UI. |
| 4 | Review the dashboard metrics and check whether each metric has a clear calculation, empty-state behavior, and drill-down destination. | I used the feedback to make the Requester and IT Staff dashboard requirements more testable and explicit. |
| 5 | Review the Lab 4 test plan and identify important missing edge cases for Actions Taken and the ticket workflow. | I added cases for inactive assignees, missing follow-up notes, stale updates, direct authorization checks, and the resolution gate. |
| 6 | Inspect the current implementation against the Lab 4 specification and list any mismatches without changing the code. | I used the list to manually review the affected files and confirm which items still needed correction or additional testing. |
| 7 | Run or review the existing Lab 1–3 regression tests and identify failures that could have been introduced by Lab 4 changes. | I used the results to verify that previous authentication, tickets, attachments, comments, IT Staff features, and user management still worked. |
| 8 | Check the authorization logic for Actions Taken and dashboards and identify cases where frontend restrictions are not also enforced by the backend. | I compared the findings with my authorization matrix and verified that protected operations were checked server-side. |
| 9 | Review the final Lab 4 tests and point out any requirement or acceptance criterion that does not have clear test evidence. | I used this to complete the traceability between acceptance criteria, test files, and the final regression evidence. |

## My Reflection

ChatGPT was most useful for reviewing and refining the specification, especially when I gave it specific Lab 4 rules instead of asking general questions. Claude Code was useful for inspecting the repository, checking tests, and comparing the implementation with the specification without generating the implementation for me. I rejected one suggestion that treated the Administrator like the Lab 3 read-only ticket role, because Lab 4 changes the authorization rules and allows the Administrator to perform IT Staff behavior.
