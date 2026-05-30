# AgentRank — Team Docs

Start here. These docs are the single source of truth for who does what and where the project stands.

| Doc | What it's for |
|---|---|
| [STATUS.md](./STATUS.md) | **Where we are right now** — what's done, what's not, build state, branches |
| [PLAN.md](./PLAN.md) | **The general plan** — team map, sequenced timeline, decision gate, cut order |
| [roles/lane1-lighthouse.md](./roles/lane1-lighthouse.md) | **Member 1** — Lighthouse static scorer (the x-axis) |
| [roles/lane2-harness.md](./roles/lane2-harness.md) | **Member 2** — Gemini agent harness (the y-axis) |
| [roles/lane3-frontend.md](./roles/lane3-frontend.md) | **Member 3** — frontend, deploy, demo (+ owns Firebase setup) |
| [roles/cohort-data.md](./roles/cohort-data.md) | **Member 4** — cohort manual pass + scoring integrity |
| [FUTURE.md](./FUTURE.md) | **Improvements to implement** — weekend-stretch → post-hackathon → vision |

## The 30-second version

Google's Lighthouse 13.3 shipped an "Agentic Browsing" audit but refused to prove it predicts anything. **We build the leaderboard and run the experiment**: rank ~30 named sites by how often a fixed Gemini agent completes a fixed task, with the Lighthouse score as a covariate. The headline is a scatter of **Lighthouse score (x) vs. measured agent success (y)** — does the rubric actually predict real agent behavior?

## Team map

| Member | Lane | Branch | Owns |
|---|---|---|---|
| 1 | Lighthouse scorer | `lighthouse` | `scripts/lane1-lighthouse.ts`, the `lighthouse` collection |
| 2 | Agent harness | `harness` | `scripts/lane2-agent.py`, the `runs` collection |
| 3 | Frontend + deploy | `frontend` | `app/**`, deploy, **+ the shared Firebase project** |
| 4 | Cohort + scoring | `cohort-data` | `scripts/cohort.json`, `PREREG.md` |

## Ground rules

- **Never cut:** the correlation chart · pre-registered substring scoring · Lighthouse score spread.
- **Frozen contract:** `lib/types.ts` — do not change without team sign-off.
- The frontend builds against fake data today, so Lane 3 is never blocked by Lanes 1/2.
