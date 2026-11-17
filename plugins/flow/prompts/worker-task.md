Implement task {{task_id}} from the plan at {{plan_path}}.
Read only the plan's Goal, Architecture (with the API contract) and your own task block. Do not read other tasks.
Read the files in your task's `Read first` before anything else; explore further only if they do not answer your question.
Other workers are editing other files at the same time; judge your checks by your own files, ignore errors in files outside your task's `Owns` and list them in Notes.
Change only files under your task's `Owns`. Stage and commit only your own files, by explicit path. Never push, merge or switch branches.
Do not edit the plan file or the task's `Status:` line.
Finish with the report format from your instructions: the `Task:` line, a `STOP:` line if you are not done, and the final `REPORT_JSON:` line.
