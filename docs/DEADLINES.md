# How Stewardbook counts deadlines

Stewardbook's deadline engine lives in [`src/lib/deadlines`](../src/lib/deadlines). It is plain TypeScript with no
dependencies and ~40 tests. This page explains the rules so a steward can check any date by hand.

> Stewardbook is a tracking tool, not legal advice. Your contract, past practice and any written agreements with the
> employer always win. When in doubt, file early.

## Counting from a trigger date

Every step starts from a **trigger date**: the incident (or the date the grievant learned of it) for the first step,
and the date the previous step finished for every later step. The trigger date is **day 0**; counting starts the next
day.

### Working days

Only working days are counted. A day is a working day when:

1. its weekday is in the contract's **work week** (Monday–Friday unless you change it), and
2. it is not a **contract holiday**.

Example — 10 working days from Monday, November 16, 2026, with Thanksgiving (Thursday, November 26) as a holiday:

| Day | Date      | Counted?     |
| --- | --------- | ------------ |
| 1–4 | Nov 17–20 | ✔            |
|     | Nov 21–22 | weekend      |
| 5–7 | Nov 23–25 | ✔            |
|     | Nov 26    | Thanksgiving |
| 8   | Nov 27    | ✔            |
|     | Nov 28–29 | weekend      |
| 9   | Nov 30    | ✔            |
| 10  | **Dec 1** | ✔ — due      |

If the contract also lists the day after Thanksgiving, the due date moves to **Wednesday, December 2**.

### Calendar days

Every day counts. If the last day lands on a weekend or holiday, most contracts move it to the next working day;
Stewardbook does this by default (**Work week → "Calendar-day deadlines … move to the next working day"**). Turn it off
if your contract says otherwise.

Example — 30 calendar days from Thursday, June 4, 2026 is Saturday, July 4. Rolled forward past the weekend, the
deadline is **Monday, July 6**.

### Zero-day limits

A limit of 0 working days means "the same working day" (moved to the next working day if the trigger is a weekend or
holiday).

## Holidays

Each contract has its own holiday list. A holiday can be:

| Kind               | Example                                                                       |
| ------------------ | ----------------------------------------------------------------------------- |
| Same date          | Independence Day — July 4                                                     |
| Weekday of month   | Thanksgiving — fourth Thursday of November; Memorial Day — last Monday of May |
| Offset from those  | Day after Thanksgiving — fourth Thursday of November + 1                      |
| Relative to Easter | Good Friday — Easter − 2                                                      |
| One specific date  | A one-off closure                                                             |

Fixed-date holidays have an **observance rule** for weekends:

| Rule                 | Saturday holiday | Sunday holiday |
| -------------------- | ---------------- | -------------- |
| Federal (default)    | Friday before    | Monday after   |
| Sunday → Monday only | not moved        | Monday after   |
| Weekend → Monday     | Monday after     | Monday after   |
| Not moved            | not moved        | not moved      |

Observed dates can cross a year boundary: New Year's Day 2022 fell on a Saturday and was observed on Friday,
December 31, 2021 — Stewardbook counts it in 2021.

The contract reader detects the observance rule from language like _"When a holiday falls on a Saturday, it shall be
observed on the preceding Friday."_ You can always change it per holiday.

## How a case moves through its steps

| What happened                     | Effect                                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mark done** on the running step | The step closes on that date; the next step's clock starts that day.                                                                                         |
| **No answer** (management steps)  | The step closes; the next clock starts on the **missed due date**, because most contracts let the union advance a grievance once the answer period runs out. |
| **Skip**                          | For contracts that send some grievances (e.g. discharges) straight to a later step.                                                                          |
| **Extension**                     | A date both sides agreed to replaces the computed deadline for that step.                                                                                    |
| **Change start date**             | Fixes the trigger if the clock really started on another day.                                                                                                |
| **Undo last**                     | Reopens the most recently finished step and clears the next one's clock.                                                                                     |

A step finished after its governing deadline is marked **late** with the number of working days, which is useful
evidence when management answers late.

Steps are copied onto each case when it opens, so later edits to the contract's steps don't rewrite open cases.
Holidays and the work week are read live from the contract, so fixing a missing holiday corrects every open case.

## "Today"

"Today" is the current date in the local's timezone (set during setup, changeable in Settings). The countdown shows:

- **working days left** — working days after today, up to and including the due date;
- a live clock to **11:59:59 pm on the due date** in the device's time;
- urgency: more than 5 working days (green), 3–5 (amber), 1–2 (orange), due today (red), overdue (dark red).

## Reading the contract

The reader ([`src/lib/contracts/extract.ts`](../src/lib/contracts/extract.ts)) is rules-based and explainable:

1. Split the text into **articles** using `ARTICLE n` headings (arabic or roman numerals, title on the same or next line).
2. Find the **procedure**: articles titled grievance, arbitration, dispute, complaint or adjustment.
3. Find the **days definition** (_"'days' means working days"_, _"All days referred to in this Article are calendar
   days"_) and, from it, the work week (_"excluding Saturdays, Sundays and holidays"_).
4. In each sentence, find **time limits** (`ten (10) working days`, `14 days`, `forty-five calendar days`), the **actor**
   (_"the Union shall…"_, _"the supervisor shall…"_, passive _"submitted to the Superintendent"_), the **action**
   (file, appeal, meet, answer, request arbitration) and the **step** (from `Step 1.` / `STEP ONE:` headings, or by
   counting union filings when there are no headings).
5. Read the **holiday article** against a catalog of common holidays and the observance language.

Anything uncertain is marked low or medium confidence with a note, and limits that apply to an arbitrator or that
the reader couldn't attribute are listed separately instead of being dropped.
