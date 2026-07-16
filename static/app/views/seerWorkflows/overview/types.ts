import type {Level} from 'sentry/types/event';
import type {PlatformKey} from 'sentry/types/platform';

// The cumulative pipeline stages an autofix run has produced, in order.
export type AutofixOutcome = 'root_cause' | 'solution' | 'code_changes' | 'pr_opened';

// Terminal-ish run status buckets the overview cares about, mapped from
// ExplorerAutofixState.status. A run that is still 'processing' is reported
// as COMPLETED here with `isProcessing` set on the row instead.
export type AutofixRunStatus = 'COMPLETED' | 'ERROR' | 'NEED_MORE_INFORMATION';

// How the run was started, mapped from SeerRun.source (see
// mapRunSourceToTrigger in ./triggerBadge). Sources without a mapping render
// a fallback badge with the raw source text.
export type AutofixTrigger =
  | 'manual'
  | 'issue_summary'
  | 'alert'
  | 'post_process'
  | 'night_shift';

export type AttentionReason =
  | 'awaiting_input'
  | 'solution_ready'
  | 'code_changes_ready'
  | 'review_pr'
  | 'errored';

// Where an answered run question renders on the card: on the face (always
// visible) or inside the collapsed "Full analysis" disclosure.
export type AnswerPlacement = 'face' | 'details';

// One answered run question joined to its question config (see ./runQuestions)
// — the label renders, never the raw prompt.
export interface RunAnalysisEntry {
  answer: string;
  key: string;
  label: string;
  placement: AnswerPlacement;
}

// One changed file within the run's drafted diff.
interface PatchFile {
  added: number;
  // Prefixed with "repo:" only when the diff spans more than one repository.
  path: string;
  removed: number;
}

// Aggregate stats over the run's merged file patches.
export interface PatchStats {
  added: number;
  // Per-file breakdown, sorted by churn (added+removed) descending.
  fileList: PatchFile[];
  files: number;
  removed: number;
}

// One issue + its latest autofix run, flattened for the overview cards.
// Built from real data by ./buildOverviewRows.
export interface OverviewRow {
  analysis: RunAnalysisEntry[];
  autofixRunStatus: AutofixRunStatus;
  eventCount: number;
  id: string;
  // Most recent activity on the run (state update, trigger, or issue-level
  // last-trigger timestamp) — drives sorting and the period filter.
  lastActivityAt: string;
  lastSeen: string;
  level: Level;
  outcomes: AutofixOutcome[];
  project: {slug: string; platform?: PlatformKey};
  shortId: string;
  // Whether the per-issue autofix state request is still in flight.
  statePending: boolean;
  title: string;
  userCount: number;
  fixabilityScore?: number | null;
  // Plain-language title from the run's root-cause answer (see runQuestions);
  // absent when there's no run/answer or the headline failed to parse — the
  // card falls back to the raw issue title.
  headline?: string;
  // True while the run is still processing; suppresses attention actions.
  isProcessing?: boolean;
  patchStats?: PatchStats;
  // The question autofix paused on, when status is NEED_MORE_INFORMATION and
  // the pending input payload carries readable text.
  pendingQuestion?: string;
  // Whether a linked PR has merged, from the runs endpoint's pullRequests
  // field. undefined = the deployed API doesn't return merge state yet
  // (tri-state on purpose: unknown must not read as "not merged").
  prMerged?: boolean;
  prNumber?: number;
  prUrl?: string;
  // Raw SeerRun.source, shown by the fallback trigger badge when it doesn't
  // map onto AutofixTrigger.
  rawSource?: string | null;
  trigger?: AutofixTrigger | null;
}
