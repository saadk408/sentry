import {
  type ExplorerAutofixState,
  getAutofixArtifactFromSection,
  getOrderedAutofixSections,
  isCodeChangesArtifact,
  isCodeChangesSection,
} from 'sentry/components/events/autofix/useExplorerAutofix';
import type {
  AutofixIssue,
  RunQuestion,
} from 'sentry/views/autofixIssuesDemo/useAutofixIssues';

import {RUN_QUESTIONS} from './runQuestions';
import {mapRunSourceToTrigger} from './triggerBadge';
import type {
  AutofixOutcome,
  AutofixRunStatus,
  NeedsYouAction,
  OverviewRow,
  PatchStats,
  RunAnalysisEntry,
} from './types';

const OUTCOME_ORDER: AutofixOutcome[] = [
  'root_cause',
  'solution',
  'code_changes',
  'pr_opened',
];

/**
 * Every pipeline stage the run has produced so far, in stage order.
 *
 * Cumulative (unlike deriveAutofixPhase's single furthest phase) because the
 * attention logic tests stage membership: "code changes but no PR" is a
 * different action than "PR opened".
 */
export function deriveAutofixOutcomes(
  runState: ExplorerAutofixState | null
): AutofixOutcome[] {
  const reached = new Set<AutofixOutcome>();
  for (const section of getOrderedAutofixSections(runState)) {
    switch (section.step) {
      case 'root_cause':
        reached.add('root_cause');
        break;
      case 'solution':
        reached.add('solution');
        break;
      case 'code_changes':
      case 'coding_agents':
        reached.add('code_changes');
        break;
      case 'pull_request':
        reached.add('pr_opened');
        break;
      default:
        break;
    }
  }
  return OUTCOME_ORDER.filter(outcome => reached.has(outcome));
}

function deriveRunStatus(state: ExplorerAutofixState | null): AutofixRunStatus {
  switch (state?.status) {
    case 'awaiting_user_input':
      return 'NEED_MORE_INFORMATION';
    case 'error':
      return 'ERROR';
    default:
      return 'COMPLETED';
  }
}

function extractPatchStats(state: ExplorerAutofixState | null): PatchStats | undefined {
  const section = getOrderedAutofixSections(state).find(isCodeChangesSection);
  if (!section) {
    return undefined;
  }
  const artifact = getAutofixArtifactFromSection(section);
  if (!isCodeChangesArtifact(artifact)) {
    return undefined;
  }
  return {
    files: artifact.length,
    added: artifact.reduce((sum, filePatch) => sum + filePatch.patch.added, 0),
    removed: artifact.reduce((sum, filePatch) => sum + filePatch.patch.removed, 0),
  };
}

function extractPr(
  state: ExplorerAutofixState | null
): Pick<OverviewRow, 'prNumber' | 'prUrl'> {
  const pr = Object.values(state?.repo_pr_states ?? {}).find(
    repoPr => repoPr.pr_creation_status === 'completed' && repoPr.pr_url
  );
  return pr ? {prUrl: pr.pr_url ?? undefined, prNumber: pr.pr_number ?? undefined} : {};
}

// The pending-input payload is untyped (Record<string, unknown>); pull out the
// question text if a conventional key holds a string.
function extractPendingQuestion(state: ExplorerAutofixState | null): string | undefined {
  if (state?.status !== 'awaiting_user_input') {
    return undefined;
  }
  const data = state.pending_user_input?.data ?? {};
  for (const key of ['question', 'text', 'message']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return undefined;
}

/**
 * Join the run's answered questions back to their question configs.
 *
 * Matches primarily on the echoed question text (the endpoint echoes prompts
 * back for user-supplied questions), falling back to position — answers are
 * returned in question order. Empty answers mean "not applicable" (the prompts
 * ask for an empty string) and are dropped.
 */
// The needs_you prompt asks for a "CATEGORY|sentence" answer; tolerate leading
// markdown emphasis the model might add around the category.
const NEEDS_YOU_PREFIX = /^[\s*_]*(DECIDE|VERIFY|REVIEW|PROVIDE)[\s*_]*\|\s*(.+)$/s;

function parseNeedsYou(answer: string): {answer: string; actionType?: NeedsYouAction} {
  const match = answer.match(NEEDS_YOU_PREFIX);
  if (!match) {
    // Fallback: render the whole answer as plain text with the generic label.
    return {answer};
  }
  return {
    actionType: match[1]!.toLowerCase() as NeedsYouAction,
    answer: match[2]!,
  };
}

// A headline longer than this means the model ignored the 14-word instruction
// (or the pipe landed somewhere unintended) — treat it as a parse failure.
const MAX_HEADLINE_LENGTH = 140;

// The root_cause prompt asks for "headline|root cause". Split on the first
// pipe; strip stray emphasis/quote characters the model might wrap it in.
function parseRootCause(answer: string): {answer: string; headline?: string} {
  const pipeIndex = answer.indexOf('|');
  if (pipeIndex === -1) {
    return {answer};
  }
  const headline = answer
    .slice(0, pipeIndex)
    .trim()
    .replace(/^["'*_]+|["'*_]+$/g, '');
  const rootCause = answer.slice(pipeIndex + 1).trim();
  if (!headline || headline.length > MAX_HEADLINE_LENGTH || !rootCause) {
    return {answer};
  }
  return {answer: rootCause, headline};
}

function buildAnalysis(outputs: RunQuestion[] | undefined): {
  entries: RunAnalysisEntry[];
  headline?: string;
} {
  if (!outputs?.length) {
    return {entries: []};
  }
  const byPrompt = new Map(RUN_QUESTIONS.map(question => [question.prompt, question]));
  const entries: RunAnalysisEntry[] = [];
  let headline: string | undefined;
  outputs.forEach((output, index) => {
    const config =
      (output.question ? byPrompt.get(output.question) : undefined) ??
      RUN_QUESTIONS[index];
    if (!config || !output.answer) {
      return;
    }
    let parsed: {answer: string; actionType?: NeedsYouAction} = {
      answer: output.answer,
    };
    if (config.key === 'needs_you') {
      parsed = parseNeedsYou(output.answer);
    } else if (config.key === 'root_cause') {
      const rootCause = parseRootCause(output.answer);
      headline = rootCause.headline;
      parsed = {answer: rootCause.answer};
    }
    entries.push({
      key: config.key,
      label: config.label,
      placement: config.placement,
      ...parsed,
    });
  });
  return {entries, headline};
}

export function buildOverviewRow(issue: AutofixIssue): OverviewRow {
  const state = issue.autofixState;
  const eventCount = Number(issue.count);
  const {entries: analysis, headline} = buildAnalysis(issue.run?.outputs);

  return {
    headline,
    id: issue.id,
    shortId: issue.shortId,
    title: issue.title,
    level: issue.level,
    project: issue.project,
    eventCount: Number.isFinite(eventCount) ? eventCount : 0,
    userCount: issue.userCount,
    lastSeen: issue.lastSeen,
    fixabilityScore: issue.seerFixabilityScore,
    lastActivityAt:
      state?.updated_at ??
      issue.run?.lastTriggeredAt ??
      issue.seerAutofixLastTriggered ??
      issue.lastSeen,
    autofixRunStatus: deriveRunStatus(state),
    // Tri-state: undefined when the API doesn't expose PR state (yet).
    prMerged: issue.run?.pullRequests
      ? issue.run.pullRequests.some(pr => pr.state === 'merged')
      : undefined,
    isProcessing: state?.status === 'processing',
    statePending: issue.autofixPhasePending,
    outcomes: deriveAutofixOutcomes(state),
    trigger: mapRunSourceToTrigger(issue.run?.source ?? null),
    rawSource: issue.run?.source ?? null,
    analysis,
    patchStats: extractPatchStats(state),
    pendingQuestion: extractPendingQuestion(state),
    ...extractPr(state),
  };
}

export function buildOverviewRows(issues: AutofixIssue[]): OverviewRow[] {
  return issues.map(buildOverviewRow);
}
