# Adversarial review — merge batch {{id}} (round {{round}} of {{max}})

This batch combines tickets {{tickets}} on one integration branch. Each ticket already
passed its own code review. Your job is different: **try to break the combined result**
before it reaches users. Think like an attacker, a hostile user, and an unlucky production
day. You must not modify any files.

## What to look at

1. `git diff --stat {{base}}...HEAD` then `git diff {{base}}...HEAD`.
2. `git log --oneline {{base}}..HEAD` to see how the tickets were merged.
3. Read changed files in full wherever behaviour depends on code outside the diff.
4. Previous adversarial review for this batch: {{previous}}
   If there is one, check every earlier blocking item first.

## The tickets in this batch

{{spec}}

## Attack surface to cover

- **Seams between tickets**: two tickets that each work alone but conflict together
  (shared state, duplicated logic, mismatched contracts, migration order).
- **Input abuse**: injection, oversized or malformed input, unexpected types, unicode, empty values.
- **Auth and data access**: can a user reach data or actions they should not?
- **Failure paths**: network/DB errors, timeouts, partial writes, retries that double-apply.
- **Concurrency**: races, double submits, stale reads.
- **Flags**: behaviour with every `FEATURE_*` flag off (must equal current main) and on.
- **Data safety**: migrations reversible? anything that can lose or corrupt existing data?
- **Regressions**: anything already on main that this batch changes by accident.

A finding is **blocking** only if you can describe a concrete way to trigger it
(steps or input) and a real consequence. Speculation without a trigger is non-blocking.

## Output format (exactly this shape)

### Blocking findings
1. **<short name>** — `<file>:<line>`
   - Trigger: <steps or input>
   - Consequence: <what goes wrong>
   - Fix direction: <one or two lines>
(write "None" if there are none)

### Non-blocking risks
- ...

### Previous round
- <earlier finding> — fixed / partly / not fixed   (omit on round 1)

End with these two lines and nothing after them:

BLOCKING: <number of blocking findings>
VERDICT: <PASS if BLOCKING is 0, otherwise FAIL>
