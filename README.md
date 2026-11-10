# dossier

Grounded resume and Upwork proposal generation from a local career dossier.

`dossier` is the generation app. The published resume site stays in a separate
`json-resume` checkout. Your data lives in XDG directories, not in either repo,
and generated files default to the current working directory.

## Install

```bash
aube add -g @rwendell/dossier
```

Aube links the `dossier` binary into `~/.local/share/aube/bin`; make sure that
directory is on your `PATH`.

Or run from source:

```bash
aube install
aube run dev -- --help
```

Requirements:

- Node.js 20+
- `opencode` on `PATH` for model calls
- Chrome for Upwork page/profile fetching (Puppeteer downloads one)
- `gh` only when GitHub sync is added later

## Data layout

```text
~/.local/share/dossier/
  career.yml
  career.private.yml
  proposal.yml

~/.config/dossier/
  config.yml

~/.cache/dossier/
  opencode/.opencode/agents/   # runtime agent prompts
  upwork/profile-*.json        # cached public profile
  github.json                  # synced GitHub/org repos
  local-projects.json          # scanned ~/projects

~/.config/opencode/agents/
  dossier-proposer.md          # installed global agent prompt
```

Cache location is mode-aware:

- running from a source checkout: `<repo>/.cache`
- running from an installed/published package: `~/.cache/dossier`
- `config.yml` `cache.mode`/`cache.dir`
- global `--cache-mode`, `--cache-dir`, `--dev`, `--release`
- `DOSSIER_CACHE_HOME` / `DOSSIER_CACHE_MODE` / `DOSSIER_DEV` overrides
- `dossier paths` prints the resolved mode, cache source, and cache path

Machine config:

```yaml
# ~/.config/dossier/config.yml
output:
  dir: ""               # empty = current directory

cache:
  mode: auto            # auto | dev | release
  dir: ""               # optional explicit path; overrides mode

theme: jsonresume-theme-straightforward
provider: auto
editor: ""
```

Global cache flags work on every command:

```bash
dossier --cache-mode dev proposal job.md
dossier --cache-mode release proposal job.md
dossier --cache-dir /tmp/dossier-cache proposal job.md
dossier --dev proposal job.md
dossier --release proposal job.md
```

Precedence: `--cache-dir` / `--cache-mode` / `--dev` / `--release` → `config.yml`
→ `DOSSIER_CACHE_*` / `DOSSIER_DEV` → auto detection.

Publishing is intentionally not a dossier command. Generated JSON is written to
the current directory; copy it into the `json-resume` checkout and let that repo
build, validate, and publish.

## Initialize or migrate

Create empty templates:

```bash
dossier init
```

`career.private.yml` is optional and is not created by `init`; create it
yourself for name, contact details, and location, or migrate one with
`--from`.

Migrate from an existing `json-resume` checkout:

```bash
dossier init --from ~/projects/json-resume
```

This copies `data/career.yml`, `data/career.private.yml`, and `data/upwork.yml`
to the XDG data directory, renaming `upwork.yml` to `proposal.yml`. Existing
files are kept unless `--force` is passed.

## Pull the private overlay

Keep `career.private.yml` in a secret GitHub gist and pull it down on another
machine:

```bash
dossier pull-private
dossier pull-private --gist <id|url>
CAREER_PRIVATE_GIST_ID=<id> dossier pull-private
```

Resolution order: `--gist`, `CAREER_PRIVATE_GIST_ID`, then auto-discovery of a
secret gist containing `career.private.yml`. Public gists are refused unless
`--allow-public` is passed. A changed local file is backed up under
`<cache>/pull-private/`.

## Tailor a resume

```bash
dossier tailor 'https://www.upwork.com/jobs/...'
dossier tailor job.md --out ~/Documents/resumes
dossier tailor job.md --no-render   # JSON + trace only
```

The PDF is rendered with `resumed` and the configured theme. It is measured in
print layout and automatically trimmed (highlights, projects, skills, summary)
until it fits on one page, then filled from unused fact-bank achievements when
it is too sparse. Outputs default to the current directory:

```text
./resume-<slug>.json
./resume-<slug>.trace.json
./resume-<slug>.pdf
```

## Sync project metadata

Project candidates come from GitHub/org repos and local `~/projects` checkouts.
Sync them into the cache:

```bash
dossier sync github   # requires gh auth login
dossier sync local    # scans ~/projects
dossier sync all
```

`sync github` lists your personal repos and org repos you have contributed to,
then rescans local projects unless `--skip-local` is passed. `sync local`
records READMEs, manifests, languages, local commit subjects, and remote URLs.

`dossier` and `json-resume` are excluded from local scanning by default so the
tooling does not rank itself as a portfolio project. Add them to
`local.include` in `career.yml` if you want them included.

Candidate ranking is keyword overlap against the job description. Metadata
matches (name, description, topics, languages, local commits) are weighted more
than README matches, and only projects with at least one match are selected.
Inspect the ranking without calling a model:

```bash
dossier score job.md
dossier score job.md --limit 20
```

`proposal`, `answer`, and `tailor` automatically use cached candidates when
present. Run a sync after adding repositories or changing READMEs.

## Write a proposal

```bash
dossier proposal 'https://www.upwork.com/jobs/...'
dossier proposal job.md --rate 85 --availability "20 hrs/week, UK overlap"
dossier proposal job.md -q "How would you approach the first two weeks?"
dossier proposal job.md --profile 'https://www.upwork.com/freelancers/~...'
```

## Answer an application question

```bash
dossier answer job.md -q 'Why is this role a good fit?'
dossier answer job.md -q question.txt --hint 'Emphasize the Kafka work'
```

Answers are written to `./answer-<slug>.<question>.md` and `.json`, and copied
to the clipboard by default.

Outputs default to the current directory:

```text
./proposal-<slug>.md   # proposal text only, paste-ready
./proposal-<slug>.json # job, profile, answers, claims, evidence, gaps, fit
```

Use `--out ~/Documents/proposals` to write elsewhere and `--name` to keep
variants.

If `resume-<slug>.json` and `resume-<slug>.trace.json` are present in the
output directory (for example, from `dossier tailor`), `proposal` and `answer`
use them as the primary framing automatically.

Public Upwork `/jobs/...` URLs use the headless Chrome fallback. Saved-jobs
modal URLs (`/nx/search/jobs/saved/details/...`) and search URLs need your
logged-in session and are rejected. If Upwork shows a Cloudflare check, save the
job text to a file and pass that instead.

The public profile is cached for 24 hours; `--refresh` fetches it again.
`--no-profile` ignores `profile.url` from `proposal.yml`.

## Verify and clean

```bash
dossier verify ./resume-acme.json
dossier verify ./resume-acme.pdf
dossier clean
```

`verify` checks JSON Resume schema, trace coverage, evidence ids, dates, numbers,
excluded skills, and the PDF page count. `clean` removes the regenerable cache.

## Inspect paths and health

```bash
dossier paths
dossier doctor
```

`paths` prints the resolved data/config/cache/output paths. `doctor` checks
Node, `opencode`, Chrome, the data files, and installed agent prompts.

## Current scope

v0.1 implements:

- XDG data/config/cache paths
- `init` with migration from the old repo
- `paths`
- `doctor`
- `proposal` with Upwork job/profile fetching, LLM provider fallback, evidence
  verification, clipboard copy, and CWD/`--out` output
- `answer` for application and interview questions, with the same grounding and
  verification
- `tailor` with JSON Resume output, `resumed` PDF rendering, one-page trimming,
  sparse-page filling, and trace verification
- `verify` for a generated JSON/trace/PDF
- `sync github` / `sync local` project metadata
- keyword candidate ranking used by proposal/answer/tailor
- automatic reuse of a matching tailored resume/trace in proposal/answer
- `score` to explain candidate ranking
- `pull-private` for the secret PII gist
- `clean` for the regenerable cache

Next milestones:

- further resume/publish workflows in the `json-resume` repo itself
- trimming the old Node generation app out of `json-resume` once parity is
  confirmed

The old Node app in `json-resume` remains the reference implementation until
the TypeScript version reaches parity.
