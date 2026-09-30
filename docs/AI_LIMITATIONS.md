# Known AI limitations

- Fixture mode is scripted for a repeatable sports-club demonstration. It proves review and confirmation behavior, not language-model quality or general domain understanding.
- Live output varies by model and prompt. A suitable model with structured-output support must be available to the configured OpenAI account.
- The provider receives the project context needed for the active task and a bounded recent conversation, so old or omitted context may need to be restated.
- Structured schemas, project scoping and semantic checks reject malformed or fabricated IDs, but they cannot guarantee that a valid-looking recommendation is useful or factually correct.
- Output is repaired once after a validation failure. A second failure produces a safe retry state; the app does not apply partial content.
- Provider work has a 45-second HTTP timeout and a bounded orchestration timeout. Slow or unavailable service leaves manual tools usable.
- AI proposals never mutate backlog state on generation. A person must review and confirm each role, story, priority, prototype, refinement or grooming operation.
- Refinement is intentionally limited to the selected story. Cross-story impacts are text suggestions and require separate review.
- Fixture grooming recognizes exact normalized duplicate wording, not semantic duplicates. Live review can still miss, overstate or misclassify backlog problems.
- Mockups are low-fidelity validated component trees. They cannot execute scripts, arbitrary HTML, navigation or production application behavior.
- Acceptance-criterion validation catches deterministic structural issues and subjective phrases, but human review remains necessary for domain completeness.
- Client and project text is sent to OpenAI in live mode. Do not enter secrets or regulated data without an appropriate organizational privacy review.
