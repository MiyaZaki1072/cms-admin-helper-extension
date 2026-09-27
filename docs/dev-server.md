# Local CMS v1.5 dev server

A local CMS v1.5 with seeded test data, used to develop and test the extension.

| What | Where |
| --- | --- |
| Admin site (AWS) | http://localhost:8889 |
| Contestant site (CWS) | http://localhost:8888 |
| Full admin | `admin` / `admin` |
| Read-only admin | `viewer` / `viewer` |
| Contestants | `stu001`…`stu050` / `pass001`…`pass050` |

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (on Windows with the WSL 2 backend), running.
- Git Bash (Windows) or any bash (macOS/Linux) for the scripts.

## 1. Get CMS v1.5

From the repo root:

```bash
git clone --depth 1 --branch v1.5 --recurse-submodules --shallow-submodules \
  -c core.autocrlf=false https://github.com/cms-dev/cms.git cms-server
```

`--recurse-submodules` fetches `isolate` (the sandbox), which the Docker build compiles. `core.autocrlf=false` keeps LF line endings so the scripts run inside the Linux container.

`cms-server/` is gitignored. Its `docker-compose.dev.yml` runs Postgres (`devdb`) and a CMS container (`devcms`) with ports 8888, 8889 and 8890. The database is stored in `cms-server/.dev/postgres-data`.

## 2. Seed test data (once)

```bash
scripts/seed.sh
```

The first run builds the CMS Docker image, which takes about 10–15 minutes. The script then runs [`scripts/seed/inside.sh`](../scripts/seed/inside.sh) in the container, which:

1. Creates the `cmsdb` database and runs `cmsInitDB` (first time only).
2. Runs `cmsAddAdmin admin -p admin` to create a full-access admin.
3. Imports **Test Contest** (`name: test`, timezone `Asia/Bangkok`) with `cmsImportContest -L italy_yaml -i -S`. The contest runs from 2 hours before seeding to 3 hours after, so it is live while you work.
   - Task `sum` (A plus B) and task `max` (Largest Number), each with 5 testcases worth 20 points.
   - Languages: C++17 / g++ and Python 3 / CPython.
4. Runs [`scripts/seed/seed_data.py`](../scripts/seed/seed_data.py), which calls the same functions as `cmsAddTeam`, `cmsAddUser`, `cmsAddParticipation` and `cmsAddSubmission`:
   - 5 teams: `BKK01`, `BKK02`, `CNX01`, `KKN01`, `HDY01`.
   - 50 users (`stu001`–`stu050`, timezone Asia/Bangkok) in the contest, 10 per team.
   - 300 submissions spread across 48 users. `stu049` and `stu050` never submit. The data is the same on every run (random seed 42).
   - A read-only admin `viewer` (no *all* or *messaging* permission). `cmsAddAdmin` can only create full admins, so the script adds this one directly.
5. Runs [`scripts/seed/seed_extras.py`](../scripts/seed/seed_extras.py), which adds what the tests and HTML fixtures need:
   questions (one answered, one with HTML in it), an announcement, a private message, a user outside the contest (`guest01`),
   a participation with every field set (`stu050`), a contest-only plaintext password (`stu049`), and two empty contests,
   `practice` and `practice2`, that the bulk-import tests write to.

Submissions use the sample solutions in [`scripts/seed/solutions/`](../scripts/seed/solutions/), which cover every outcome:

| File | Expected score |
| --- | --- |
| `sum_ok.cpp`, `sum_ok.py`, `max_ok.cpp`, `max_ok.py` | 100 |
| `max_zero.py` (wrong on all-negative input) | 80 |
| `sum_int.cpp` (int overflow) | 60 |
| `max_first.cpp` (prints the first number) | 40 |
| `sum_wrong.cpp` | 0 |
| `sum_ce.cpp`, `max_ce.py` | Compilation failed |

## 3. Start the servers

```bash
scripts/dev-server.sh
```

This starts `cmsLogService` and `cmsResourceService -a ALL`, which in turn starts AWS, CWS, the evaluation service, the scoring service and a worker. Submissions show *Evaluating…* first and get their scores within a minute or two. Stop everything with Ctrl+C.

To get a bash prompt in the container instead (for running any `cmsXxx` tool by hand):

```bash
scripts/dev-server.sh shell
```

## Check

Log in to http://localhost:8889 as `admin`. Then:

- Under **Contests**, *Test Contest* is listed.
- On its **Users** page, 50 users are listed.
- On its **Submissions** page, 300 submissions are listed, 50 per page.

## Reset

To wipe the database and seed again:

```bash
scripts/dev-server.sh shell
# inside the container:
dropdb -h devdb -U postgres cmsdb
exit
scripts/seed.sh
```

## Troubleshooting

- **Submissions stay in *Evaluating…*:** the worker uses `isolate`, which needs cgroups. On Docker Desktop, check that the WSL 2 backend is on. The worker logs are in `cms-server/.dev/home/log/`.
- **`scripts/*.sh: bad interpreter` or `\r` errors:** the files have CRLF line endings. `.gitattributes` forces LF; run `git add --renormalize .` and check out again.
- **Build fails at `make -C isolate isolate`:** the `isolate` submodule is empty. Run `git -C cms-server submodule update --init --depth 1`.
- **Port already in use:** stop any other container that uses 8888, 8889 or 8890.
