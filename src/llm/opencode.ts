import { spawnSync } from 'node:child_process';

const MAX_BUFFER = 100 * 1024 * 1024;

export interface RunOpencodeOptions {
  prompt: string;
  agent: string;
  model?: string | null;
  title?: string;
  timeout: number;
  cwd: string;
}

export interface OpencodeStats {
  cost: number;
  input: number;
  output: number;
  reasoning: number;
}

export function runOpencode({
  prompt,
  agent,
  model,
  title,
  timeout,
  cwd,
}: RunOpencodeOptions): ReturnType<typeof spawnSync> {
  const args = ['run', '--agent', agent, '--format', 'json'];
  if (title) args.push('--title', title);
  if (model) args.push('--model', model);
  args.push(prompt);

  return spawnSync('opencode', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    timeout,
  });
}

export function parseOpencodeStats(stdout: string): OpencodeStats | null {
  let stats: OpencodeStats | null = null;
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as {
        type?: string;
        part?: {
          cost?: number;
          tokens?: {
            input?: number;
            output?: number;
            reasoning?: number;
          };
        };
      };
      if (event.type !== 'step_finish' || !event.part) continue;
      stats ??= { cost: 0, input: 0, output: 0, reasoning: 0 };
      stats.cost += Number(event.part.cost) || 0;
      stats.input += Number(event.part.tokens?.input) || 0;
      stats.output += Number(event.part.tokens?.output) || 0;
      stats.reasoning += Number(event.part.tokens?.reasoning) || 0;
    } catch {
      // Ignore non-JSON log lines.
    }
  }
  return stats;
}

export function parseOpencodeOutput(
  stdout: string,
): Record<string, unknown> | null {
  const texts: string[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as {
        type?: string;
        part?: { text?: string };
      };
      if (event.type === 'text' && event.part?.text) {
        texts.push(event.part.text);
      }
    } catch {
      // Ignore non-JSON log lines.
    }
  }

  const candidates = [...texts.reverse(), stdout];
  for (const text of candidates) {
    const parsed = extractJson(text);
    if (parsed) return parsed;
  }
  return null;
}

export function extractJson(
  text: string,
): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1]!) as unknown;
      if (isPlainObject(parsed)) return parsed;
    } catch {
      // Fall through to brace scanning.
    }
  }

  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let end = start; end < text.length; end += 1) {
      const char = text[end]!;
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
            if (isPlainObject(parsed)) return parsed;
          } catch {
            // Keep scanning.
          }
          break;
        }
      }
    }
  }

  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
