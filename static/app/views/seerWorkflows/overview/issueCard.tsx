import styled from '@emotion/styled';

import {Tag} from '@sentry/scraps/badge';
import {LinkButton} from '@sentry/scraps/button';
import {Disclosure} from '@sentry/scraps/disclosure';
import {Container, Flex, Stack} from '@sentry/scraps/layout';
import {Link} from '@sentry/scraps/link';
import {Heading, Text} from '@sentry/scraps/text';
import {Tooltip} from '@sentry/scraps/tooltip';

import {ErrorLevel} from 'sentry/components/events/errorLevel';
import ProjectBadge from 'sentry/components/idBadge/projectBadge';
import {TimeSince} from 'sentry/components/timeSince';
import {
  IconChat,
  IconCheckmark,
  IconCommit,
  IconMerge,
  IconPullRequest,
  IconQuestion,
  IconShow,
} from 'sentry/icons';
import {t, tn} from 'sentry/locale';
import {formatAbbreviatedNumber} from 'sentry/utils/formatters';
import {SeerMarkdown} from 'sentry/views/seerExplorer/components/chat/shared';

import {ATTENTION_META, AttentionBadge, getAttentionReason} from './attentionBadge';
import {TriggerBadge} from './triggerBadge';
import type {NeedsYouAction, OverviewRow} from './types';

// Icon + label per parsed needs-you category, so the kind of human action is
// scannable across cards without reading the sentence.
const ACTION_TYPE_META: Record<
  NeedsYouAction,
  {Icon: typeof IconQuestion; label: string}
> = {
  decide: {Icon: IconQuestion, label: t('Decide')},
  verify: {Icon: IconCheckmark, label: t('Verify')},
  review: {Icon: IconShow, label: t('Review')},
  provide: {Icon: IconChat, label: t('Provide')},
};

// Card titles read as content, not navigation: inherit the bold primary text
// color instead of the global anchor accent, revealing linkness on hover.
// Styled because Link exposes no color control.
const TitleLink = styled(Link)`
  color: inherit;
  &:hover {
    color: inherit;
    text-decoration: underline;
  }
`;

// Buckets the raw 0–1 score into a scannable label; the 0.7 threshold matches
// isIssueQuickFixable (sentry/components/events/autofix/utils).
function FixabilityTag({score}: {score: number}) {
  const high = score > 0.7;
  const label = high
    ? t('High fixability')
    : score > 0.4
      ? t('Medium fixability')
      : t('Low fixability');
  return (
    <Tooltip title={t('Fixability score: %s', score.toFixed(2))}>
      <Tag variant={high ? 'success' : 'muted'}>{label}</Tag>
    </Tooltip>
  );
}

export function IssueCard({orgSlug, row}: {orgSlug: string; row: OverviewRow}) {
  const issueUrl = `/organizations/${orgSlug}/issues/${row.id}/`;
  // Deep-link into the issue page with the Seer drawer already open, so the
  // run itself is one click away (matches the issue details ?seerDrawer param).
  const runUrl = {pathname: issueUrl, query: {seerDrawer: 'true'}};
  const attention = getAttentionReason(row);
  // The body shows the run summary, plus a structured proposed-fix block when
  // (and only when) the run actually drafted code — the prompt returns an
  // empty answer otherwise, and empty answers never become entries.
  const summary = row.analysis.find(entry => entry.key === 'summary');
  const proposedFix = row.analysis.find(entry => entry.key === 'fix_summary');
  const detailEntries = row.analysis.filter(entry => entry.placement === 'details');

  const eventCountLabel =
    row.eventCount === 1
      ? t('1 event')
      : t('%s events', formatAbbreviatedNumber(row.eventCount));
  const userCountLabel =
    row.userCount === 1
      ? t('1 user')
      : t('%s users', formatAbbreviatedNumber(row.userCount));

  return (
    <Container background="primary" border="primary" radius="md" padding="lg">
      <Stack gap="md">
        {/* Header: title + change size + action */}
        <Flex justify="between" align="start" gap="md">
          <Flex gap="sm" align="center" minWidth="0" flex="1">
            <ErrorLevel level={row.level} />
            {/* The ellipsis Text is the shrinking flex item (overflow:hidden
                  resolves its min-width to 0); the Link must nest inside it or
                  the anchor refuses to shrink and the title overflows the card.
                  When Seer produced a plain-language headline it replaces the
                  raw issue title, which stays reachable via the tooltip and
                  the expanded details. */}
            <Text bold ellipsis>
              {row.headline ? (
                <Tooltip title={row.title}>
                  <TitleLink to={issueUrl}>{row.headline}</TitleLink>
                </Tooltip>
              ) : (
                <TitleLink to={issueUrl}>{row.title}</TitleLink>
              )}
            </Text>
          </Flex>
          <Flex gap="sm" align="center" flexShrink={0}>
            {/* No stage chip here: the action verb already encodes the stage
                  (Review PR ⇒ PR opened, Open PR ⇒ code drafted, …) and the
                  Outcome filter covers querying by it. One fact + one action. */}
            {row.patchStats && (
              <Tooltip title={t('Size of the drafted code change')} skipWrapper>
                {/* Contained like its Tag/button neighbors so the diff size
                      doesn't read as floating text */}
                <Container
                  border="muted"
                  radius="sm"
                  background="secondary"
                  padding="2xs sm"
                >
                  <Text size="xs" variant="muted" monospace wrap="nowrap">
                    {tn('%s file', '%s files', row.patchStats.files)}{' '}
                    <Text size="xs" variant="success">
                      +{row.patchStats.added}
                    </Text>{' '}
                    <Text size="xs" variant="danger">
                      −{row.patchStats.removed}
                    </Text>
                  </Text>
                </Container>
              </Tooltip>
            )}
            {row.statePending ? (
              <Text variant="muted">{'…'}</Text>
            ) : row.isProcessing ? (
              <Tag variant="info">{t('Running')}</Tag>
            ) : row.prMerged ? (
              <Tooltip title={t('The pull request for this fix was merged.')}>
                <Tag variant="success" icon={<IconMerge />}>
                  {t('Merged')}
                </Tag>
              </Tooltip>
            ) : attention === 'review_pr' && row.prUrl ? (
              <Tooltip
                title={
                  row.prNumber
                    ? t(
                        'Autofix opened pull request #%s. Review and merge it.',
                        row.prNumber
                      )
                    : ATTENTION_META.review_pr.description
                }
                skipWrapper
              >
                <LinkButton
                  size="zero"
                  variant="warning"
                  icon={<IconPullRequest />}
                  href={row.prUrl}
                  external
                >
                  {ATTENTION_META.review_pr.label}
                </LinkButton>
              </Tooltip>
            ) : attention ? (
              <AttentionBadge reason={attention} to={runUrl} />
            ) : (
              <Tooltip title={t('Open the Seer run for this issue.')} skipWrapper>
                <LinkButton size="zero" variant="secondary" to={runUrl}>
                  {t('View run')}
                </LinkButton>
              </Tooltip>
            )}
            {row.prUrl && attention !== 'review_pr' && (
              <LinkButton
                size="zero"
                variant="link"
                icon={<IconPullRequest />}
                href={row.prUrl}
                external
              >
                {row.prNumber ? `#${row.prNumber}` : t('PR')}
              </LinkButton>
            )}
          </Flex>
        </Flex>

        {/* The question autofix is blocked on, surfaced right on the card */}
        {row.pendingQuestion && (
          <Text size="sm" variant="accent">
            {t('Seer asked: %s', row.pendingQuestion)}
          </Text>
        )}

        {/* The body: a dense summary, kept to a readable measure */}
        {summary && (
          <Container maxWidth="90ch">
            <Text size="sm" density="comfortable" as="div">
              <SeerMarkdown raw={summary.answer} />
            </Text>
          </Container>
        )}

        {/* Structured proposed-fix block: what the drafted change is and why
            it fixes the root cause. Only rendered when code was drafted. */}
        {proposedFix && (
          <Container
            background="secondary"
            border="muted"
            radius="md"
            padding="sm md"
            maxWidth="90ch"
          >
            <Stack gap="xs">
              <Flex gap="xs" align="center">
                <Text variant="muted" aria-hidden>
                  <IconCommit size="xs" />
                </Text>
                <Text size="xs" bold uppercase variant="muted">
                  {proposedFix.label}
                </Text>
              </Flex>
              <Text size="sm" density="comfortable" as="div">
                <SeerMarkdown raw={proposedFix.answer} />
              </Text>
            </Stack>
          </Container>
        )}

        {/* Footer: the collapsed analysis on the left, project pinned in the
            card's bottom-right corner */}
        <Flex justify="between" align="start" gap="md" borderTop="muted" paddingTop="sm">
          <Container flex="1" minWidth="0">
            {detailEntries.length > 0 && (
              <Disclosure size="xs">
                <Disclosure.Title>{t('Full analysis')}</Disclosure.Title>
                <Disclosure.Content>
                  <Stack gap="md" maxWidth="90ch">
                    {/* The short id, raw issue title, and fixability live here
                        rather than the card face to keep it quiet */}
                    <Flex justify="between" align="center" gap="md">
                      <Text size="xs" variant="muted">
                        <Text size="xs" monospace>
                          {t('Issue %s', row.shortId)}
                        </Text>
                        {' · '}
                        {row.title}
                      </Text>
                      {typeof row.fixabilityScore === 'number' && (
                        <FixabilityTag score={row.fixabilityScore} />
                      )}
                    </Flex>
                    {detailEntries.map(entry => {
                      const action = entry.actionType
                        ? ACTION_TYPE_META[entry.actionType]
                        : null;
                      return (
                        <Stack key={entry.key} gap="xs">
                          <Flex gap="sm" align="center">
                            <Heading as="h4" size="xs">
                              {entry.label}
                            </Heading>
                            {action && (
                              <Tag variant="info" icon={<action.Icon />}>
                                {action.label}
                              </Tag>
                            )}
                          </Flex>
                          <Text size="sm" density="comfortable" as="div">
                            <SeerMarkdown raw={entry.answer} />
                          </Text>
                        </Stack>
                      );
                    })}
                  </Stack>
                </Disclosure.Content>
              </Disclosure>
            )}
          </Container>
          {/* Provenance + vitals read as one quiet metadata line */}
          <Flex gap="md" align="center" flexShrink={0}>
            {/* "Manual" is the default trigger and reads as noise on every
                card; only non-default triggers earn a badge */}
            {row.trigger !== 'manual' && (
              <TriggerBadge trigger={row.trigger} rawSource={row.rawSource} />
            )}
            <Flex gap="xs" align="center">
              <Tooltip
                title={
                  row.userCount > 0
                    ? t(
                        '%s events and %s affected users in the last 90 days',
                        row.eventCount.toLocaleString(),
                        row.userCount.toLocaleString()
                      )
                    : t('%s events in the last 90 days', row.eventCount.toLocaleString())
                }
              >
                <Text size="xs" variant="muted">
                  {eventCountLabel}
                  {row.userCount > 0 && ` · ${userCountLabel}`}
                </Text>
              </Tooltip>
              <Text size="xs" variant="muted" aria-hidden>
                {'·'}
              </Text>
              <Text size="xs" variant="muted" wrap="nowrap">
                <TimeSince
                  date={row.lastActivityAt}
                  prefix={t('updated')}
                  tooltipPrefix={t('Last activity on this Seer run')}
                />
              </Text>
            </Flex>
            <Tooltip title={t('Project')} skipWrapper>
              <ProjectBadge project={row.project} avatarSize={14} disableLink />
            </Tooltip>
          </Flex>
        </Flex>
      </Stack>
    </Container>
  );
}
