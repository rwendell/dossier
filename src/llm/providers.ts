import {
  parseOpencodeOutput,
  parseOpencodeStats,
  runOpencode,
  type OpencodeStats,
} from './opencode.js';

export const DEFAULT_OPENCODE_MODEL =
  'opencode/deepseek-v4.1-flash-free#high';
export const DEFAULT_GO_MODEL = 'opencode-go/deepseek-v4.1-flash#high';
export const DEFAULT_OPENROUTER_MODEL =
  'openrouter/deepseek/deepseek-v4.1-flash-1017#high';
export const DEFAULT_OPENROUTER_FALLBACK_MODEL =
  'openrouter/anthropic/claude-haiku-5.5#low';
export const DEFAULT_OPENROUTER_TIMEOUT_MS = 120_000;

export type ProviderName = 'auto' | 'opencode' | 'go' | 'openrouter';

const PROVIDER_LABELS: Record<Exclude<ProviderName, 'auto'>, string> = {
  opencode: 'OpenCode',
  go: 'OpenCode Go',
  openrouter: 'OpenRouter',
};

const PROVIDER_ALIASES = new Map<string, ProviderName>([
  ['auto', 'auto'],
  ['opencode', 'opencode'],
  ['default', 'opencode'],
  ['free', 'opencode'],
  ['go', 'go'],
  ['opencode-go', 'go'],
  ['openrouter', 'openrouter'],
  ['or', 'openrouter'],
]);

export interface ProviderTarget {
  name: Exclude<ProviderName, 'auto'>;
  label: string;
  model: string | null;
  timeout?: number;
}

export interface LlmAttempt {
  index: number;
  total: number;
  target: ProviderTarget;
  label: string;
  timeout: number;
  reason?: string;
  status?: number | null;
  stderr?: string;
  raw?: string;
  stats?: OpencodeStats | null;
}

export interface RunAgentResult {
  output: Record<string, unknown>;
  provider: ProviderTarget;
  model: string | null;
  raw: string;
  stats: OpencodeStats | null;
  attempts: LlmAttempt[];
}

export interface RunAgentOptions {
  prompt: string;
  agent: string;
  title?: string;
  timeout?: number;
  cwd: string;
  provider?: string;
  model?: string;
  accept?: (value: Record<string, unknown>) => boolean;
  onAttempt?: (event: {
    phase: 'start' | 'failed' | 'succeeded';
    index: number;
    total: number;
    target: ProviderTarget;
    label: string;
    timeout: number;
    reason?: string;
    stats?: OpencodeStats | null;
  }) => void;
}

export class LlmError extends Error {
  attempts: LlmAttempt[];
  raw: string;

  constructor(attempts: LlmAttempt[], raw: string) {
    super(formatFailure(attempts));
    this.name = 'LlmError';
    this.attempts = attempts;
    this.raw = raw;
  }
}

export function resolveProviderChain({
  provider,
  model,
}: {
  provider?: string;
  model?: string;
} = {}): ProviderTarget[] {
  const requested = normalizeProvider(
    provider ||
      process.env.DOSSIER_LLM_PROVIDER ||
      process.env.RESUME_LLM_PROVIDER ||
      'auto',
  );

  if (requested === 'auto') {
    if (model) return [createTarget('opencode', model)];

    return [
      ...openRouterChain(),
      createTarget(
        'go',
        process.env.OPENCODE_GO_MODEL
          ? normalizeModelForProvider('go', process.env.OPENCODE_GO_MODEL)
          : DEFAULT_GO_MODEL,
      ),
      createTarget(
        'opencode',
        process.env.OPENCODE_MODEL || DEFAULT_OPENCODE_MODEL,
      ),
    ];
  }

  if (requested === 'openrouter' && !model) {
    return openRouterChain();
  }

  const targetModel = model
    ? normalizeModelForProvider(requested, model)
    : defaultModelForProvider(requested);
  return [createTarget(requested, targetModel)];
}

function openRouterChain(): ProviderTarget[] {
  const primaryModel = process.env.OPENROUTER_MODEL
    ? normalizeModelForProvider('openrouter', process.env.OPENROUTER_MODEL)
    : DEFAULT_OPENROUTER_MODEL;
  const fallbackModel = process.env.OPENROUTER_FALLBACK_MODEL
    ? normalizeModelForProvider(
        'openrouter',
        process.env.OPENROUTER_FALLBACK_MODEL,
      )
    : DEFAULT_OPENROUTER_FALLBACK_MODEL;

  const primary = createTarget('openrouter', primaryModel, {
    timeout: DEFAULT_OPENROUTER_TIMEOUT_MS,
  });
  const fallback = createTarget('openrouter', fallbackModel);
  return primary.model === fallback.model ? [primary] : [primary, fallback];
}

export function runAgent({
  prompt,
  agent,
  title,
  timeout = 10 * 60 * 1000,
  cwd,
  provider,
  model,
  accept,
  onAttempt,
}: RunAgentOptions): RunAgentResult {
  const chain = resolveProviderChain({ provider, model });
  const attempts: LlmAttempt[] = [];
  let lastRaw = '';

  for (const [index, target] of chain.entries()) {
    const targetTimeout = target.timeout ?? timeout;
    const label = target.model
      ? `${target.label} (${target.model})`
      : `${target.label} (default model)`;
    const context = {
      index,
      total: chain.length,
      target,
      label,
      timeout: targetTimeout,
    };

    onAttempt?.({ ...context, phase: 'start' });

    const result = runOpencode({
      prompt,
      agent,
      model: target.model,
      title,
      timeout: targetTimeout,
      cwd,
    });
    const raw = typeof result.stdout === 'string' ? result.stdout : '';
    if (raw) lastRaw = raw;
    const stderr = typeof result.stderr === 'string' ? result.stderr : '';

    if (result.error) {
      const timedOut =
        (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT' ||
        /timed out|ETIMEDOUT/i.test(result.error.message ?? '');
      const reason = timedOut
        ? `timed out after ${Math.round(targetTimeout / 1000)}s`
        : truncate(result.error.message, 1200);
      attempts.push({ ...context, reason, status: result.status, stderr });
      onAttempt?.({ ...context, phase: 'failed', reason });
      continue;
    }

    if (result.status !== 0) {
      const detail = truncate(stderr.trim(), 1200);
      const reason = `exited with status ${result.status}${detail ? `: ${detail}` : ''}`;
      attempts.push({
        ...context,
        reason,
        status: result.status,
        stderr,
        raw,
      });
      onAttempt?.({ ...context, phase: 'failed', reason });
      continue;
    }

    const output = parseOpencodeOutput(raw);
    if (!output) {
      const reason = 'did not return a JSON object';
      attempts.push({ ...context, reason, status: 0, stderr, raw });
      onAttempt?.({ ...context, phase: 'failed', reason });
      continue;
    }

    if (accept && !accept(output)) {
      const reason = 'returned JSON that does not match the expected shape';
      attempts.push({ ...context, reason, status: 0, stderr, raw });
      onAttempt?.({ ...context, phase: 'failed', reason });
      continue;
    }

    const stats = parseOpencodeStats(raw);
    onAttempt?.({ ...context, phase: 'succeeded', stats });
    return {
      output,
      provider: target,
      model: target.model,
      raw,
      stats,
      attempts,
    };
  }

  throw new LlmError(attempts, lastRaw);
}

function normalizeProvider(value: string): ProviderName {
  const key = String(value ?? '').trim().toLowerCase();
  const provider = PROVIDER_ALIASES.get(key);
  if (!provider) {
    throw new Error(
      `Unknown provider "${value}". Use auto, opencode, go, or openrouter.`,
    );
  }
  return provider;
}

function defaultModelForProvider(
  provider: Exclude<ProviderName, 'auto'>,
): string {
  if (provider === 'opencode') {
    return process.env.OPENCODE_MODEL || DEFAULT_OPENCODE_MODEL;
  }
  if (provider === 'go') {
    return process.env.OPENCODE_GO_MODEL
      ? normalizeModelForProvider('go', process.env.OPENCODE_GO_MODEL)
      : DEFAULT_GO_MODEL;
  }
  return process.env.OPENROUTER_MODEL
    ? normalizeModelForProvider('openrouter', process.env.OPENROUTER_MODEL)
    : DEFAULT_OPENROUTER_MODEL;
}

function normalizeModelForProvider(
  provider: Exclude<ProviderName, 'auto'>,
  model: string,
): string {
  const value = String(model).trim();
  if (provider === 'go' && !value.includes('/')) {
    return `opencode-go/${value}`;
  }
  if (provider === 'openrouter' && !value.startsWith('openrouter/')) {
    return `openrouter/${value}`;
  }
  return value;
}

function createTarget(
  name: Exclude<ProviderName, 'auto'>,
  model: string,
  { timeout }: { timeout?: number } = {},
): ProviderTarget {
  const inferred: Exclude<ProviderName, 'auto'> = model.startsWith(
    'opencode-go/',
  )
    ? 'go'
    : model.startsWith('openrouter/')
      ? 'openrouter'
      : name;
  return {
    name,
    label: PROVIDER_LABELS[inferred],
    model: model || null,
    timeout,
  };
}

function formatFailure(attempts: LlmAttempt[]): string {
  const lines = [
    attempts.length === 1
      ? 'Model request failed.'
      : 'All model providers failed.',
  ];
  attempts.forEach((attempt, index) => {
    lines.push(`  ${index + 1}. ${attempt.label}: ${attempt.reason}`);
  });
  lines.push(
    'Pass --provider opencode|go|openrouter to force one, or set DOSSIER_LLM_PROVIDER.',
  );
  return lines.join('\n');
}

function truncate(value: unknown, length: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}
