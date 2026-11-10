import type { Resume, TailoredDraft, Trace } from './types.js';

/**
 * Catch the common failure where a resume bullet has no trace receipt before
 * running the full verifier.
 */
export function hasTraceCoverage(resume: Resume, trace: Trace): boolean {
  if (!resume || typeof resume !== 'object') return false;
  if (!trace || typeof trace !== 'object') return false;

  const bulletPaths = new Set(
    (Array.isArray(trace.bullets) ? trace.bullets : [])
      .map((entry) => entry?.path)
      .filter(Boolean),
  );
  const projectNames = new Set(
    (Array.isArray(trace.projects) ? trace.projects : [])
      .map((entry) => entry?.name)
      .filter(Boolean),
  );

  for (const [workIndex, work] of (resume.work ?? []).entries()) {
    const highlights = Array.isArray(work.highlights) ? work.highlights : [];
    for (
      let highlightIndex = 0;
      highlightIndex < highlights.length;
      highlightIndex += 1
    ) {
      if (
        !bulletPaths.has(
          `work[${workIndex}].highlights[${highlightIndex}]`,
        )
      ) {
        return false;
      }
    }
  }

  for (const [projectIndex, project] of (resume.projects ?? []).entries()) {
    if (!projectNames.has(project.name ?? '')) return false;
    const highlights = Array.isArray(project.highlights)
      ? project.highlights
      : [];
    for (
      let highlightIndex = 0;
      highlightIndex < highlights.length;
      highlightIndex += 1
    ) {
      if (
        !bulletPaths.has(
          `projects[${projectIndex}].highlights[${highlightIndex}]`,
        )
      ) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Some drafts list project evidence at the project level but omit the
 * per-highlight trace bullets. Fill those in from the project trace when the
 * evidence count makes the mapping unambiguous; otherwise attach the project's
 * evidence list to each missing highlight. Returns true when anything changed.
 */
export function fillProjectBulletTrace(draft: TailoredDraft): boolean {
  let changed = false;
  const bullets = Array.isArray(draft.trace.bullets)
    ? draft.trace.bullets
    : [];
  const paths = new Set(bullets.map((entry) => entry.path));
  const projectTrace = new Map(
    (draft.trace.projects ?? []).map((entry) => [entry.name, entry]),
  );

  for (const [projectIndex, project] of (draft.resume.projects ?? []).entries()) {
    const traceProject = projectTrace.get(project.name ?? '');
    if (!traceProject) continue;
    const evidence = Array.isArray(traceProject.evidence)
      ? traceProject.evidence
      : [];
    const highlights = Array.isArray(project.highlights)
      ? project.highlights
      : [];

    for (
      let highlightIndex = 0;
      highlightIndex < highlights.length;
      highlightIndex += 1
    ) {
      const path = `projects[${projectIndex}].highlights[${highlightIndex}]`;
      if (paths.has(path)) continue;

      const chosen =
        evidence.length === highlights.length
          ? [evidence[highlightIndex]!]
          : evidence;
      if (chosen.length === 0) continue;

      bullets.push({
        path,
        evidence: chosen,
        source: traceProject.source ?? 'career',
      });
      paths.add(path);
      changed = true;
    }
  }

  draft.trace.bullets = bullets;
  return changed;
}
