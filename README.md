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
- Chrome for rendering and Upwork page/profile fetching (Puppeteer downloads one)
- `gh` only when GitHub sync is added later
- a system serif font, or let `dossier` download a fallback (see below)

## Data layout

```text
~/.local/share/dossier/
  career.yml
  career.private.yml
  freelance.yml

~/.config/dossier/
  config.yml

~/.cache/dossier/
  opencode/.opencode/agents/   # runtime agent prompts (not global)
  freelance/profile-*.json     # cached public freelance profile
  github.json                  # synced GitHub/org repos
  local-projects.json          # scanned ~/projects
  fonts/                       # fallback serif, downloaded on demand

~/.local/state/dossier/logs/
  *.prompt.txt                 # --debug prompts
  *.opencode-output.jsonl      # raw model output on failures or --debug
```

Dossier agents are project-local to its runtime directory. OpenCode is invoked
with that directory as its working directory, so `dossier-*` agents do not
appear in your global OpenCode TUI.

Diagnostics never land in the output directory. Raw model output and debug
prompts go to the XDG state directory above (`DOSSIER_STATE_HOME` overrides it),
and the error message prints the exact path.

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
  open: true            # open the tailored PDF when finished

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

## Initialize

```bash
dossier init
```

This creates `career.yml`, `freelance.yml`, and `config.yml` from the example
templates. `career.private.yml` is optional; add it yourself for name, contact
details, and location, or import a JSON Resume.

Import an existing JSON Resume file:

```bash
dossier init --from ~/Documents/resume.json
dossier init --from ~/Documents/resume.json --force
```

The import maps `basics`, `work`, `projects`, `skills`, and `education` into
`career.yml`. Contact details and location go to `career.private.yml`. Existing
files are not replaced unless `--force` is passed.

Legacy `proposal.yml` and `upwork.yml` files are copied to `freelance.yml`
automatically when `freelance.yml` does not exist.

## Freelance defaults

`freelance.yml` holds proposal defaults:

```yaml
profile:
  url: "https://www.upwork.com/freelancers/~..."

rate:
  type: hourly
  amount: 85
  currency: USD

minHourlyRate: 85
availability: "20-30 hrs/week; UK overlap until 6pm GMT"
timeline: ""

proposal:
  targetWords: 180
  minWords: 120
  maxWords: 260
  maxChars: 5000
  includeRate: false
  includeAvailability: true

preferredSamples: []
```

CLI flags override these values. The public profile supplies identity,
location, rate, skills, and portfolio defaults when `profile.url` is set.

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
dossier tailor --generic
dossier tailor                 # no job source -> generic resume
dossier tailor job.md --no-render   # JSON + trace only
```

The PDF is rendered with `resumed` and the configured theme. It is measured in
print layout and automatically trimmed (highlights, projects, skills, summary)
until it fits on one page, then filled from unused fact-bank achievements when
it is too sparse. The PDF opens when the run finishes. Disable that with
`--no-open` or `--open=false`, or set `output.open: false` in `config.yml`.

On WSL the PDF is handed to the Windows default handler (`wslview`, then
PowerShell `Start-Process`, then `cmd /c start`). Shell aliases and functions,
such as a fish `open` wrapper, are not visible to spawned processes, so dossier
never relies on them.

Tailoring never fetches a freelance profile on its own. Identity, contact
details, and location come from `career.yml` and `career.private.yml`. Pass
`--profile <url>` only when you explicitly want to enrich the basics from a
public profile.

### PDF fonts

Themes ask for a specific font family. On a minimal Linux install (or a fresh
WSL image) fontconfig can resolve even `serif` to a symbol font, which makes
every PDF render as Greek/symbol glyphs. Dossier checks the rendered font and,
when it resolves to a symbol font, downloads a metric-compatible serif
(Tinos, OFL) into `~/.cache/dossier/fonts` once and uses it for the PDF.

```bash
dossier fonts              # show the system font and fallback status
dossier fonts --install    # download the fallback now
dossier fonts --force      # download it again
```

Installing a real serif font is preferable and keeps the theme's intended look:

```bash
sudo apt install fonts-liberation   # Debian/Ubuntu/WSL
```

Outputs default to the current directory:

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

Candidate ranking is keyword overlap against the job description. Structural
matches (name, description, topics, languages, local commits) are weighted much
more than README matches. A project needs at least one structural match to be
used as a candidate; README-only matches are shown by `score` but skipped,
because prose overlap is usually incidental.

`score` explains the ranking; it is retrieval, not selection. The first `--limit`
candidates are handed to the model, which chooses the two or three that actually
support the job's requirements. A high score alone does not mean a project is
relevant.

```bash
dossier score job.md
dossier score job.md --limit 20
```

Each line shows the total score followed by `strong:` (structural) and `readme:`
(prose-only) matches.

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
`--no-profile` ignores `profile.url` from `freelance.yml`.

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

Next improvements:

- richer project ranking and semantic matching
- more answer/tailor prompt iterations
- any site/publish workflow changes in the `json-resume` repo itself

`json-resume` is now site-only: published JSON, render/build, validate, watch,
and publish. Resume generation and career data live in dossier.

## Releasing

```bash
aube login --registry https://registry.npmjs.org/ --scope @rwendell
aube publish --access=public
```

Pushing a `v*` tag runs `.github/workflows/release.yml`, which publishes using
the `NPM_TOKEN` repository secret.
