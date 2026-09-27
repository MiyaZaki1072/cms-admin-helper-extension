#!/usr/bin/env python3
"""Add the extra data the HTML fixtures need, on top of seed_data.py.

Questions (one answered), an announcement, a private message, a user who is
not in the contest, one participation with every optional field set, and
two empty contests ('practice', 'practice2') for bulk-import tests.
Safe to run again: each part is skipped if it already exists.

Usage: python3 seed_extras.py <contest_id>
"""

import gevent.monkey
gevent.monkey.patch_all()  # noqa

import ipaddress
import sys
from datetime import datetime, timedelta

from cms.db import (Admin, Announcement, Contest, Message, Participation,
                    Question, SessionGen, Team, User)
from cmscommon.crypto import hash_password


EMPTY_CONTESTS = [("practice", "Practice Contest"), ("practice2", "Practice Contest 2")]


def add_empty_contests():
    """Contests with no users, for testing bulk import without touching 'test'."""
    with SessionGen() as session:
        for name, description in EMPTY_CONTESTS:
            if session.query(Contest).filter(Contest.name == name).first():
                continue
            session.add(Contest(name=name, description=description,
                                timezone="Asia/Bangkok",
                                languages=["C++17 / g++", "Python 3 / CPython"]))
        session.commit()


def main():
    contest_id = int(sys.argv[1])
    add_empty_contests()
    now = datetime.utcnow()
    with SessionGen() as session:
        if session.query(User).filter(User.username == "guest01").first():
            print("Extras already seeded.")
            return
        contest = Contest.get_from_id(contest_id, session)
        admin = session.query(Admin).filter(Admin.username == "admin").one()

        def participation(username):
            return session.query(Participation).join(User)\
                .filter(User.username == username)\
                .filter(Participation.contest == contest).one()

        # Not in any contest: shows up in "add user to contest".
        session.add(User(first_name="Guest", last_name="Account",
                         username="guest01",
                         password=hash_password("guest01", "plaintext"),
                         timezone="Asia/Bangkok"))

        # Every optional participation field set, with a bcrypt password.
        p = participation("stu050")
        p.ip = [ipaddress.ip_network("10.0.0.50"),
                ipaddress.ip_network("192.168.1.0/24")]
        p.delay_time = timedelta(seconds=300)
        p.extra_time = timedelta(seconds=600)
        p.hidden = True
        p.unrestricted = True
        p.password = hash_password("contest-pass", "bcrypt")
        p.starting_time = now - timedelta(hours=1)
        p.team = session.query(Team).filter(Team.code == "HDY01").one()

        # Contest-only plaintext password.
        participation("stu049").password = \
            hash_password("plain-049", "plaintext")

        session.add(Question(now - timedelta(minutes=50),
                             "Task sum: input size",
                             "Can A and B be negative?",
                             participation=participation("stu001")))
        answered = Question(now - timedelta(minutes=40),
                            "Task max: output format",
                            "Should I print a newline at the end?",
                            participation=participation("stu002"))
        answered.reply_timestamp = now - timedelta(minutes=35)
        answered.reply_subject = "Answered in task description"
        answered.reply_text = "Either is fine."
        session.add(answered)
        session.add(Question(now - timedelta(minutes=5),
                             "<b>Tag</b> & \"quotes\"",
                             "Checks that the helper escapes <script>x</script>.",
                             participation=participation("stu003")))

        session.add(Announcement(now - timedelta(minutes=30),
                                 "Task B clarification",
                                 "N is at most 100.",
                                 contest=contest, admin=admin))
        session.add(Message(now - timedelta(minutes=20),
                            "Your seat",
                            "Please move to seat 12.",
                            participation=participation("stu001"),
                            admin=admin))
        session.commit()
    print("Extras seeded.")


if __name__ == "__main__":
    main()
