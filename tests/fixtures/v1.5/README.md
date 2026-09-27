# CMS v1.5 AWS fixtures

Raw pages from a local CMS v1.5 AdminWebServer seeded with `scripts/seed.sh`
(see `docs/dev-server.md`). Regenerate with `pnpm fixtures`.

Logged in as `admin` (full access) unless the file name starts with `readonly-`
(logged in as `viewer`, no permissions). Times on the pages are UTC.

| File | Page | What it shows |
| --- | --- | --- |
| `login.html` | `/login` | Login form, not logged in |
| `overview.html` | `/` | Home page (full admin) |
| `contests.html` | `/contests` | Contest list |
| `contest.html` | `/contest/1` | Contest settings form |
| `contest-users.html` | `/contest/1/users` | Users in the contest, plus "add user" select |
| `contest-submissions-p0.html` | `/contest/1/submissions?page=0` | Submissions, newest first, page 1 |
| `contest-submissions-p1.html` | `/contest/1/submissions?page=1` | Submissions page 2 |
| `contest-tasks.html` | `/contest/1/tasks` | Tasks in the contest |
| `contest-ranking.html` | `/contest/1/ranking` | Ranking table |
| `contest-ranking.csv` | `/contest/1/ranking/csv` | Ranking CSV export |
| `contest-questions.html` | `/contest/1/questions` | Questions (one answered, one with HTML in it) |
| `contest-announcements.html` | `/contest/1/announcements` | Announcements |
| `participation-stu001.html` | `/contest/1/user/1/edit` | Participation with defaults; has a question and a message |
| `participation-stu049.html` | `/contest/1/user/49/edit` | Participation with a plaintext contest password, no submissions |
| `participation-stu050.html` | `/contest/1/user/50/edit` | Participation with every field set (bcrypt password, IPs, times, hidden, unrestricted) |
| `submission-scored.html` | `/submission/300` | A scored submission |
| `submission-compile-failed.html` | `/submission/297` | A submission that failed to compile |
| `task.html` | `/task/2` | Task page |
| `users.html` | `/users` | All users |
| `user.html` | `/user/1` | User page (stu001) |
| `users-add.html` | `/users/add` | Create user form |
| `teams.html` | `/teams` | Team list |
| `team.html` | `/team/1` | Team page |
| `teams-add.html` | `/teams/add` | Create team form |
| `admins.html` | `/admins` | Admin list with permissions |
| `rpc-submissions-status.json` | `/rpc/AdminWebServer/0/submissions_status` | RPC reply |
| `rpc-queue-status.json` | `/rpc/EvaluationService/0/queue_status` | RPC reply |
| `rpc-workers-status.json` | `/rpc/EvaluationService/0/workers_status` | RPC reply |
| `notifications.json` | `/notifications` | Notifications (JSON, not HTML) |
| `readonly-overview.html` | `/` | Home page as a read-only admin |
| `readonly-contest-users.html` | `/contest/1/users` | Contest users as a read-only admin |
| `readonly-participation-stu001.html` | `/contest/1/user/1/edit` | Participation page as a read-only admin |
| `readonly-admins.html` | `/admins` | Admin list as a read-only admin |
