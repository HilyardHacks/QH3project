import type { Run, FailureMode } from "@/lib/types";
import { FAILURE_MODE_META } from "@/lib/failure-modes";

// Move 12 — one trial rendered as a native <details> accordion (zero client JS). Server-safe:
// no "use client", no hooks, no event handlers. parseTranscript runs on the server so the raw
// transcript JSON never ships to the browser. Parsed view-types are co-located here so the
// frozen data contract in lib/types.ts stays untouched.

// The agent's per-step action (a subset of the harness's JSON; all fields optional/defensive).
interface StepAction {
  action?: string;
  selector?: string;
  text?: string;
  direction?: string;
  url?: string;
  answer?: string;
  reasoning?: string;
}

interface ParsedStep {
  step?: number;
  url?: string;
  action?: StepAction;
  error?: string; // harness error step: { step: 0, error: "..." }
}

type ParsedTranscript =
  | { kind: "empty" } // no transcript (FAKE runs) or empty array
  | { kind: "error"; message: string } // malformed / non-array JSON
  | { kind: "steps"; steps: ParsedStep[] };

// TOTAL — never throws. Tolerates: undefined (FAKE), "" , "[]", malformed JSON, and a
// parsed-but-non-array value. Everything downstream can assume a well-formed result.
export function parseTranscript(raw?: string): ParsedTranscript {
  if (!raw || !raw.trim()) return { kind: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "error", message: "Transcript could not be parsed." };
  }
  if (!Array.isArray(parsed)) return { kind: "error", message: "Transcript could not be parsed." };
  if (parsed.length === 0) return { kind: "empty" };
  return { kind: "steps", steps: parsed as ParsedStep[] };
}

function FailureBadge({ mode }: { mode: FailureMode }) {
  if (mode === "success") {
    return (
      <span className="text-xs text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5 whitespace-nowrap">
        ✓ success
      </span>
    );
  }
  const meta = FAILURE_MODE_META[mode];
  return (
    <span className="text-xs text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 whitespace-nowrap">
      {meta ? `${meta.emoji} ${meta.label}` : mode}
    </span>
  );
}

const ACTION_COLORS: Record<string, string> = {
  click: "bg-sky-100 text-sky-700",
  type: "bg-violet-100 text-violet-700",
  scroll: "bg-slate-100 text-slate-600",
  navigate: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
};

function ActionChip({ verb }: { verb?: string }) {
  const cls = (verb && ACTION_COLORS[verb]) || "bg-slate-100 text-slate-500";
  return (
    <span className={`text-[11px] font-mono rounded px-1.5 py-0.5 whitespace-nowrap ${cls}`}>
      {verb ?? "?"}
    </span>
  );
}

function StepRow({ step, index }: { step: ParsedStep; index: number }) {
  // Positional number (idx+1) — never the raw `step` field (0-based loop vs 1-based scripted/error).
  const n = index + 1;
  const numCell = (
    <span className="w-5 shrink-0 pt-0.5 text-right font-mono text-[10px] tabular-nums text-slate-300">
      {n}
    </span>
  );

  // Harness error step: { step: 0, error: "..." }
  if (step.error) {
    return (
      <li className="flex gap-2 items-start py-1.5">
        {numCell}
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium text-red-600">⚠ harness error</span>
          <p className="text-xs text-red-500 break-all">{step.error}</p>
        </div>
      </li>
    );
  }

  const action = step.action ?? {};

  // Gemini API/parse failure sentinel — NOT a real action verb, NOT a seventh failure mode.
  if (action.action === "__error__") {
    return (
      <li className="flex gap-2 items-start py-1.5">
        {numCell}
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium text-red-600">⚠ Gemini call failed</span>
          {action.reasoning ? <p className="text-xs text-red-500 break-all">{action.reasoning}</p> : null}
        </div>
      </li>
    );
  }

  const target = action.selector ?? action.url ?? action.text ?? "";
  return (
    <li className="flex gap-2 items-start py-1.5">
      {numCell}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <ActionChip verb={action.action} />
          {target ? (
            <code className="text-[11px] font-mono text-slate-500 break-all">{target}</code>
          ) : null}
        </div>
        {action.reasoning ? (
          <p className="mt-0.5 text-xs text-slate-500 break-words">{action.reasoning}</p>
        ) : null}
        {step.url ? <p className="mt-0.5 text-[10px] text-slate-300 break-all">{step.url}</p> : null}
      </div>
    </li>
  );
}

function TranscriptBody({ parsed, success }: { parsed: ParsedTranscript; success: boolean }) {
  if (parsed.kind === "empty") {
    return <p className="py-2 text-xs text-slate-400">No transcript recorded for this trial.</p>;
  }
  if (parsed.kind === "error") {
    return <p className="py-2 text-xs text-amber-600">{parsed.message}</p>;
  }

  // The agent's final/extracted answer (from the last `done` step), annotated matched/not-matched
  // PURELY from run.success — never by comparing against the expected key (no double-leak), and a
  // BLOCKED/wrong_extraction done step never renders as a triumphant green block.
  const doneStep = [...parsed.steps].reverse().find((s) => s.action?.action === "done");
  const finalAnswer = doneStep?.action?.answer;

  return (
    <div>
      <ol className="divide-y divide-slate-100">
        {parsed.steps.map((s, i) => (
          <StepRow key={i} step={s} index={i} />
        ))}
      </ol>
      {finalAnswer !== undefined ? (
        <div
          className={`mt-3 rounded-lg border p-3 ${
            success ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
          }`}
        >
          <p className={`mb-1 text-xs font-medium ${success ? "text-emerald-700" : "text-red-600"}`}>
            {success ? "✓ Final answer (matched)" : "✗ Final answer (did not match)"}
          </p>
          <p className="break-words font-mono text-sm text-slate-700">{finalAnswer || "—"}</p>
        </div>
      ) : null}
    </div>
  );
}

export default function TrialAccordion({ run }: { run: Run }) {
  const parsed = parseTranscript(run.transcript);
  return (
    <details className="group border-b border-slate-100 last:border-0">
      <summary className="flex cursor-pointer select-none list-none items-center gap-3 px-4 py-3 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="text-xs text-slate-300 transition-transform group-open:rotate-90">▸</span>
        <span className="w-14 shrink-0 text-sm text-slate-500">Trial {run.trial_number}</span>
        <span className={`text-sm font-medium ${run.success ? "text-emerald-600" : "text-red-500"}`}>
          {run.success ? "✓" : "✗"}
        </span>
        <FailureBadge mode={run.failure_mode} />
        <span className="ml-auto flex items-center gap-4 text-xs tabular-nums text-slate-400">
          <span>{run.step_count} steps</span>
          <span>{run.duration_seconds}s</span>
        </span>
      </summary>
      <div className="border-t border-slate-100 bg-slate-50/40 px-4 pb-4 pt-2">
        <TranscriptBody parsed={parsed} success={run.success} />
      </div>
    </details>
  );
}
