#!/usr/bin/env python3
"""Seed users, teams, participations and submissions into the test contest.

Runs inside the CMS dev container, after cmsImportContest. Uses the same
functions as cmsAddTeam / cmsAddUser / cmsAddParticipation / cmsAddSubmission,
called in one process so ~300 submissions take seconds instead of minutes.

Usage: python3 seed_data.py <contest_id> <solutions_dir> <start_epoch>
"""

import gevent.monkey
gevent.monkey.patch_all()  # noqa

import os
import random
import sys
import time

from cms.db import Admin, SessionGen
from cmscommon.crypto import hash_password
from cmscontrib.AddParticipation import add_participation
from cmscontrib.AddSubmission import add_submission
from cmscontrib.AddTeam import add_team
from cmscontrib.AddUser import add_user

N_USERS = 50
N_SUBMISSIONS = 300
IDLE_USERS = {"stu049", "stu050"}  # never submit: for "no submission" flags
TEAMS = ["BKK01", "BKK02", "CNX01", "KKN01", "HDY01"]

FIRST = ["Somchai", "Malee", "Anan", "Kanya", "Prasert", "Suda", "Niran",
         "Ploy", "Wichai", "Nok", "Arthit", "Mali", "Chai", "Fah", "Krit"]
LAST = ["Jaidee", "Srisuk", "Chaiyaporn", "Boonmee", "Wongsa", "Rattana",
        "Saetang", "Kongkaew", "Thongdee", "Panya"]

# (file, rough quality 0..1): better students pick better variants over time.
VARIANTS = {
    "sum": [("sum_ce.cpp", 0.0), ("sum_wrong.cpp", 0.1), ("sum_int.cpp", 0.5),
            ("sum_ok.py", 1.0), ("sum_ok.cpp", 1.0)],
    "max": [("max_ce.py", 0.0), ("max_first.cpp", 0.3), ("max_zero.py", 0.7),
            ("max_ok.py", 1.0), ("max_ok.cpp", 1.0)],
}


def add_readonly_admin():
    """cmsAddAdmin only creates full admins; Step 2 needs a read-only one."""
    with SessionGen() as session:
        if session.query(Admin).filter(Admin.username == "viewer").first():
            return
        session.add(Admin(username="viewer", name="Read-only viewer",
                          authentication=hash_password("viewer"),
                          permission_all=False, permission_messaging=False))
        session.commit()


def pick_variant(task, skill, attempt, rng):
    # Later attempts and higher skill push towards correct solutions.
    target = min(1.0, skill + 0.15 * attempt)
    options = VARIANTS[task]
    weights = [1.0 / (0.15 + abs(q - target)) for _, q in options]
    return rng.choices(options, weights)[0][0]


def main():
    contest_id, solutions_dir, start = \
        int(sys.argv[1]), sys.argv[2], int(sys.argv[3])
    rng = random.Random(42)

    add_readonly_admin()
    for code in TEAMS:
        add_team(code, "Team " + code)

    users = []
    for i in range(1, N_USERS + 1):
        username = "stu%03d" % i
        ok = add_user(rng.choice(FIRST), rng.choice(LAST), username,
                      "pass%03d" % i, "plaintext", False,
                      "%s@example.com" % username, "Asia/Bangkok", "en")
        ok = ok and add_participation(
            username, contest_id, None, 0, 0, None, "plaintext", False,
            TEAMS[(i - 1) % len(TEAMS)], False, False)
        if not ok:
            sys.exit("Failed to create %s (already seeded?)" % username)
        if username not in IDLE_USERS:
            users.append(username)

    skill = {u: rng.random() * 0.7 for u in users}
    attempts = {}
    now = int(time.time())
    stamps = sorted(rng.randint(start + 60, now - 60)
                    for _ in range(N_SUBMISSIONS))
    for n, ts in enumerate(stamps, 1):
        user = rng.choice(users)
        task = rng.choice(["sum", "max"])
        attempt = attempts.get((user, task), 0)
        attempts[(user, task)] = attempt + 1
        src = pick_variant(task, skill[user], attempt, rng)
        files = {"%s.%%l" % task: os.path.join(solutions_dir, src)}
        if not add_submission(contest_id, user, task, ts, files):
            sys.exit("Failed to add submission %d" % n)
        if n % 50 == 0:
            print("  %d/%d submissions" % (n, N_SUBMISSIONS))


if __name__ == "__main__":
    main()
