import {t} from 'sentry/locale';

import type {AnswerPlacement} from './types';

interface RunQuestionConfig {
  key: string;
  // Clean UI heading — the raw prompt text never renders.
  label: string;
  placement: AnswerPlacement;
  // The prompt sent to the runs endpoint as a `question` param. Answered per
  // run over its full history by Seer's agent_question one-shot; editing the
  // text invalidates that (run, question) cache entry, so fresh answers show
  // on the next load. Prompts are universal and self-adapt to the run's stage;
  // "return an empty string" lets the UI skip sections that don't apply.
  prompt: string;
}

// The five one-shot questions the overview asks about each run (the endpoint
// caps user questions at 5). Order matters: answers come back positionally.
export const RUN_QUESTIONS: RunQuestionConfig[] = [
  {
    key: 'root_cause',
    label: t('Root cause'),
    placement: 'details',
    prompt:
      'Answer in two parts separated by a single pipe character. First a ' +
      'headline: at most 14 words of plain language describing what is broken ' +
      'and where, the way a good bug-report title would — no error class names ' +
      'unless essential, no markdown or code formatting, no pipe characters in ' +
      'it. ' +
      'Then the pipe. Then the root cause: what actually breaks and why, in ' +
      'one or two short sentences (at most 40 words), naming the responsible ' +
      'function, commit, or configuration — inline code is allowed in this ' +
      'part, but no headers, bullets, or code blocks. If the run did not ' +
      'establish a root cause, still give the headline, then the pipe, then ' +
      'one sentence on why it could not (e.g. could not reproduce, missing ' +
      'context).',
  },
  {
    key: 'summary',
    // The face renders this bare — it is the card body, not a labeled section.
    label: t('Summary'),
    placement: 'face',
    prompt:
      'One sentence of at most 25 words (a semicolon is fine): the failure ' +
      "mechanism, then the run's concrete outcome — what the opened PR or " +
      'drafted fix changes and where, or the issue-specific reason the run ' +
      'skipped or stopped early. Name files and identifiers, not activities: ' +
      'never content-free phrases like "this run produced a diagnosis" or ' +
      '"implemented code changes". No first person, no filler. Inline code ' +
      'allowed; no headers, bullets, or code blocks.',
  },
  {
    key: 'needs_you',
    label: t('Needs you'),
    placement: 'details',
    prompt:
      'Start your answer with exactly one of DECIDE|, VERIFY|, REVIEW|, or ' +
      'PROVIDE| (the category in capitals, then a pipe), followed by one ' +
      'imperative sentence of at most 16 words stating what the human must do ' +
      'to move this run forward. Pick DECIDE for a policy or design choice, ' +
      'VERIFY for confirming a behavior or assumption, REVIEW for reviewing ' +
      'code or a pull request, PROVIDE for supplying missing information. Be ' +
      'specific about what to look at or choose, not a generic action, and do ' +
      'not start the sentence with the category word itself. If the run is ' +
      'still working or nothing is needed from a human, return an empty ' +
      'string. No markdown formatting other than inline code.',
  },
  {
    key: 'fix_summary',
    label: t('Proposed fix'),
    placement: 'face',
    prompt:
      'If this run drafted code changes or opened a pull request, describe in ' +
      'at most two sentences (max 45 words) what the changes are and why they ' +
      'fix the root cause — name the files or functions touched and the ' +
      'behavior change. Describe the change itself, never the author: no ' +
      'first person ("I modified…") and no narration like "the solution ' +
      'modifies" — e.g. "Adds an early return in `captureMcpShutdownSummary` ' +
      'so info-level shutdowns no longer create issues." If the run did not ' +
      'produce code changes, return an empty string. Inline code allowed for ' +
      'file or function names; no markdown headers, bullets, or code blocks.',
  },
  {
    key: 'reviewer_notes',
    label: t('What to double-check'),
    placement: 'details',
    prompt:
      'List the specific things a reviewer should double-check before trusting ' +
      "or merging this run's fix: risks, untested paths, or assumptions the run " +
      'made. At most three short markdown bullet points, each under 20 words. ' +
      'If the run produced no fix to review, return an empty string.',
  },
];

export const RUN_QUESTION_PROMPTS = RUN_QUESTIONS.map(question => question.prompt);
