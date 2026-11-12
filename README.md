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
  logs/                        # diagnostics, see below
  tailor/<slug>/               # scratch HTML used for PDF measurement
  last-job.json                # most recent job, reused by `dossier answer`
  precursors/resume-*.json     # JSON Resume each PDF was rendered from
  traces/resume-*.trace.json   # evidence trace for each tailored resume
```

Dossier agents are project-local to its runtime directory. OpenCode is invoked
with that directory as its working directory, so `dossier-*` agents do not
appear in your global OpenCode TUI.

Intermediate files never land in the output directory:

```text
<cache>/logs/*.prompt.txt           # --debug prompts
<cache>/logs/*.opencode-output.jsonl # raw model output on failures or --debug
<cache>/tailor/<slug>/measure.html  # layout measurement scratch file
```

They follow the cache location and are removed by `dossier clean`. The error
message prints the exact path.

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
dossier tailor job.md --no-render   # skip the PDF; write the JSON to the cache
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

The PDF is the deliverable:

```text
./resume-<slug>.pdf
```

The JSON Resume and its evidence trace are precursors, not deliverables, so they
are kept in the cache:

```text
<cache>/precursors/resume-<slug>.json
<cache>/traces/resume-<slug>.trace.json
```

`dossier verify` and the proposal/answer reuse logic find both by resume
filename. `dossier clean` removes them with the rest of the cache.

## Sync project metadata

Project candidates come from GitHub/org repos and local `~/projects` checkouts.
Sync them into the cache:

```bash
dossier sync          # same as `sync all`
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
dossier answer -q 'Why is this role a good fit?'        # uses the last job
dossier answer 'Why is this role a good fit?'           # same, positional
dossier answer job.md -q 'Why is this role a good fit?' # explicit job
dossier answer job.md -q question.txt --hint 'Emphasize the Kafka work'
```

With no job argument, `answer` reuses the most recent job from `dossier tailor`
or `dossier proposal` (`<cache>/last-job.json`). If that file is missing, it
reconstructs the job from the newest tailored resume in the precursor cache. With one positional and no
`-q`, the positional is treated as the question. A positional that is a URL or
an existing file is treated as the job source, so a question is required then.

Answers are written to `./answer-<slug>.<question>.md` and `.json`, and copied
to the clipboard by default.

Outputs default to the current directory:

```text
./proposal-<slug>.md   # proposal text only, paste-ready
./proposal-<slug>.json # job, profile, answers, claims, evidence, gaps, fit
```

Use `--out ~/Documents/proposals` to write elsewhere and `--name` to keep
variants.

If a tailored resume for the same slug exists in the precursor cache (with its
trace), `proposal` and `answer` use it as the primary framing automatically.

Public Upwork `/jobs/...` URLs use the headless Chrome fallback. Saved-jobs
modal URLs (`/nx/search/jobs/saved/details/...`) and search URLs need your
logged-in session and are rejected. If Upwork shows a Cloudflare check, save the
job text to a file and pass that instead.

Only `proposal` reads a public profile, and only from `profile.url` in
`freelance.yml` or an explicit `--profile`. The profile is cached indefinitely
because scraping Upwork is fragile; `--refresh` fetches it again. `tailor` and
`answer` never fetch one unless you pass `--profile` yourself.

## Verify and clean

```bash
dossier verify ./resume-acme.json
dossier verify ./resume-acme.pdf
dossier clean
```

`verify` checks JSON Resume schema, trace coverage, evidence ids, dates, numbers,
excluded skills, and the PDF page count. It resolves the cached JSON Resume and
trace from `<cache>/precursors` and `<cache>/traces`, so a PDF alone is enough.
`clean` removes the regenerable cache.

## Onboard a new device

```bash
# 1. Tools: aube, Node 20+, opencode (authenticated), gh (gh auth login)
aube add -g @rwendell/dossier
dossier --version
dossier paths
```

Settings and data are managed separately:

```text
chezmoi              -> ~/.config/dossier/config.yml   (theme, provider, cache)
secret gist          -> ~/.local/share/dossier/career.yml
                        ~/.local/share/dossier/career.private.yml
                        ~/.local/share/dossier/freelance.yml
```

```bash
chezmoi apply                            # ~/.config/dossier/config.yml
gh auth login
CAREER_PRIVATE_GIST_ID=<id> dossier pull-private --all
```

`pull-private` resolves the secret gist (`--gist`, the env var, or discovery by
`career.private.yml`) and restores the YAML data files it contains:

```text
career.private.yml -> ~/.local/share/dossier/
career.yml         -> ~/.local/share/dossier/
freelance.yml      -> ~/.local/share/dossier/
```

Only `.yml` files are pulled; notes or READMEs in the gist are ignored. Without
`--all` it pulls just the PII overlay. Changed local files are backed up under
`<cache>/pull-private/` before being replaced.

`config.yml` is intentionally not in the gist: it is tracked by chezmoi, so the
gist and chezmoi never fight over the same file. Re-add it after local edits:

```bash
chezmoi add ~/.config/dossier/config.yml
```

Keep the gist ID out of this repository: a secret gist is readable by anyone
who has the URL. Set `CAREER_PRIVATE_GIST_ID` in your shell instead.

Without a gist, rebuild from scratch:

```bash
dossier init                                  # example templates
dossier init --from ~/Documents/resume.json   # import a JSON Resume
```

Then fill in `freelance.yml` and run:

```bash
dossier sync            # GitHub/org repos + local ~/projects
dossier fonts --install # only if the system has no serif font
dossier doctor          # everything should be ok
```

Bring the site repo over separately:

```bash
git clone git@github.com:rwendell/json-resume.git
cd json-resume
aube ci
aube exec --no-install -- puppeteer browsers install chrome
aube run validate -- all
aube run build
```

Publish a tailored resume from the precursor cache:

```bash
aube run publish -- ~/.cache/dossier/precursors/resume-<slug>.json --name my-resume
```

Secrets to recreate on a new device or repo:

| Secret | Where | Used for |
| --- | --- | --- |
| `gh auth login` | device | gist sync, GitHub repo sync |
| `opencode auth` | device | model calls |
| `NPM_TOKEN` | dossier repo secret | `v*` tag releases |
| `GIST_TOKEN` | json-resume repo secret | mirroring published JSON to the gist |

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
