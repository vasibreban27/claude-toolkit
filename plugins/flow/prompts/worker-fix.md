This is a fix assignment from the verify step, not a plan task. The finding below is your task; use the finding id {{finding_id}} wherever a task id is expected (the `Task:` line and `REPORT_JSON`).
Plan (for context only): {{plan_path}}. The files named in the finding are the files you own; this overrides the plan's `Owns`.

Finding {{finding_id}}:
{{finding}}

Fix exactly this finding and add a regression test for it, unless one already exists. Do not fix other findings or refactor around it.
Other workers may be fixing other findings in other files at the same time: judge your checks by your own files and list errors elsewhere in Notes.
Stage and commit only your own files, by explicit path. Never push, merge or switch branches.
Finish with the report format from your instructions: the `Task:` line, a `STOP:` line if you are not done, and the final `REPORT_JSON:` line.
