Lab 3 — AI Use and Reflection

AI tools used:

ChatGPT (GPT-5.6 Sol) as the specification agent, for requirement clarification, scope checking, acceptance criteria, and test-plan review.

Claude Code as the code/repository review agent, only to inspect the existing implementation, compare it with the Lab 3 specification, and run or review tests. I did not use it to generate or modify the application code.

Selected key prompts

#

Agent

Prompt (summarised)

What I did with the result

1

ChatGPT

Compare the Lab 3 handout with Lab 2 and list only the new requirements that must be added, without changing the existing ticket and attachment features.

I used the result as a checklist for the Lab 3 specification, especially authentication, the three roles, IT Staff workflows, Administrator management, and Lab 2 regression.

2

ChatGPT

From the Lab 3 handout, identify the responsibilities of Requester, IT Staff, and Administrator and highlight the permissions that must remain separated.

I used the summary to review my authorization matrix and make sure each role had only the permissions required by the handout.

3

ChatGPT

Review my authentication flow against the Lab 3 requirements: login, logout, inactive accounts, current user, and mandatory first-login password change. What cases are missing?

I used the feedback to add missing edge cases to the specification and test plan, especially inactive users and first-login password change restrictions.

4

ChatGPT

Review the distinction between Public Comments and Internal Notes and suggest security and UI cases that should be covered in the specification and tests.

I used the result to verify role visibility, empty-content validation, append-only behavior, and the need for clear visual separation between public and internal communication.

5

ChatGPT

Based only on the Lab 3 handout, list the Administrator User Management cases that should be tested, including invalid and safety cases.

I used the list to check coverage for duplicate emails, one-role assignment, activation/deactivation, initial-password reset, self-deactivation prevention, and protection of the last active Administrator.

6

Claude Code

Inspect the current Lab 3 repository and compare the implemented authentication and role-based access behavior with docs/lab-03/specification.md. Report mismatches only and do not modify any files.

I used the report to manually verify that the implementation matched the approved specification and to identify points that needed my own review.

7

Claude Code

Run the existing Lab 3 test suites and summarize any failing tests by area (authentication, authorization, staff queue, ticket detail, comments/notes, and user administration). Do not edit the code or tests.

I used the test summary as completion evidence and to identify which failures or regressions I needed to investigate myself.

8

Claude Code

Inspect the protected Lab 3 API routes and check whether authorization is enforced server-side rather than only by hidden or disabled UI controls. Report any suspicious route and explain why, without making changes.

I used the result as a security review checklist and manually checked the reported routes against the authorization rules in the specification.

9

ChatGPT

Check my final Lab 3 scope against the handout and identify anything that is explicitly out of scope.

I used the result to remove unnecessary ideas such as user deletion, multiple roles, email password reset, MFA, dashboards, and advanced account-management features.

My Reflection

For the specification agent, ChatGPT was most useful when I gave it one precise section of the Lab 3 handout and asked it to check my requirements, business rules, acceptance criteria, or test coverage. The quality of the answers improved when I explicitly asked it to stay within the Lab 3 scope and not invent additional features.

For the code agent, I used Claude Code as a review and verification tool rather than as a code generator. I asked it to inspect the repository, compare the existing implementation with the specification, and run or review the existing tests without changing files. This was useful for spotting possible mismatches or missing verification points, but I still checked the reported issues myself before deciding whether they were valid.

One limitation I noticed was that both agents could suggest behavior that sounded reasonable but was outside the assignment. I therefore rejected suggestions that were not supported by the Lab 3 handout and kept the final specification and implementation aligned with the required scope.
