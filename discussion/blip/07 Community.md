# The FastBlips Community

*Expanded from the original notes: a forum built into
the site, and postings on Reddit and elsewhere.*

## 1. Why a community matters for FastBlips

FastBlips' value grows with the number of BLIPs people can find, run and
copy. A community supplies example programs, answers beginners' questions,
reports bugs and suggests built-ins and widgets.

The first audience is **learners**, so the community is built around
getting help, sharing small programs and being encouraged — beginner
questions are the main traffic, not an afterthought. Many learners are
school students, which shapes accounts and moderation (§2 and Open points).

## 2. A forum built into the site

**Built in, not bolted on.** The forum lives on fastblips.com, uses the same
accounts, and understands BLIPs:

- **Runnable posts** — a post can embed a BLIP (`?run=<name>` in an inline
  frame) or a code block with a *Run* button that runs it in the page.
- **Open a copy** — any shared program opens in the IDE as the reader's own
  copy ("remix"), with a link back to the original.
- **Error help** — the IDE's error panel offers "Ask the forum", posting
  the code, the error and the line, so questions arrive complete.
- **Linked from apps** — every app page links to its discussion thread.

**Suggested sections.** Announcements · Getting started · Crumb (Basic) ·
MiniPy (Python) · Widgets and the Designer · Show and tell · Ideas and
feature requests · Bugs.

**Build or adopt?**

| Option | For | Against |
|---|---|---|
| Write the forum as a FastBlips app | Proves the framework; the best demo there is | Needs app storage, accounts, moderation tools first |
| Host an existing forum (e.g. Discourse) with single sign-on | Mature moderation, email, search, spam control | Separate software to run; embedding BLIPs needs a plugin |
| GitHub Discussions on the runtime repo | Free; fits the open-source runtime | Developer-only audience; not on the site |

A reasonable path: start with an adopted forum or GitHub Discussions, and
rebuild it as a BLIP later as a showcase.

**Moderation.** Anyone can publish runnable code, so: report button,
hide/unlist a BLIP, rate limits for new accounts, and clear rules on what
apps may do with `Fetch`. Because learners include young people: a
code of conduct written for beginners, no public email addresses or
direct messages by default, and quick removal of personal information.

**Classes.** A teacher can create a class group: a private forum section
and gallery for their students, with the teacher as moderator.

## 3. A gallery

Alongside the forum, a gallery of published BLIPs: screenshot or live
thumbnail, title, author, language, runs, "Open a copy". Featured apps,
newest, most copied. It is the place forum posts and outside postings
point to.

## 4. Postings on Reddit and elsewhere

**Where.** Communities whose readers match the goals:

| Audience | Places |
|---|---|
| **Learning to program (first)** | r/learnprogramming, r/learnpython, r/AskProgramming, beginner Discord servers |
| Teachers (reach learners through them) | Teacher forums, CS-education groups and mailing lists |
| Basic / retro / VB nostalgia | r/visualbasic, r/retrocomputing, BASIC-dialect forums |
| Python | r/Python, Python Discord |
| Web and side projects | r/webdev, r/SideProject, r/javascript |
| Languages and VMs | r/ProgrammingLanguages, Lobsters |
| General launch | Hacker News (*Show HN*), Product Hunt, dev.to |

**How.** Each community has its own rules on self-promotion — read them
first. What works best is a post about something interesting, with a link
that runs instantly. For learners, lead with what they can make:
- "Build a phone app in 20 lines of Basic" — with a runnable `?run=` link
  and a tutorial.
- "Your first game in the browser: no install, works on your phone."
- "From Basic to Python: the same app in both" — the two-language story
  as a learning path.

Later, for developers and contributors:
- "A Basic and a Python subset sharing one bytecode VM in the browser" —
  for language and VM readers (the *02 BLIP definition* material).
- "Pause any program at any instruction: cooperative multitasking in one
  browser tab" — for web developers.

**Other channels.** Short videos (a program written and running in under a
minute), a blog or changelog on the site, a mailing list for releases, and
a Discord or similar for live help.

## 5. Order of work

1. Gallery and "Open a copy" (needs owners/versions — *04 Applications*).
2. Forum (adopted) with BLIP embedding; link from IDE errors and app pages.
3. Showcase apps and a short getting-started tutorial — required before
   any posting, since learners need somewhere to start.
4. First postings in learner communities, then through teachers.
5. Open-source the runtime; GitHub Discussions for contributors; then
   Show HN / r/ProgrammingLanguages for the VM story.

## Open points

- Accounts: email, GitHub or Google sign-in — and can a student join a
  teacher's class without an email address?
- Who moderates, and what is acceptable for public apps?
