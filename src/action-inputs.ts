import * as core from '@actions/core';
import { ESource, IActionInputs } from './types';

export const getInputs = (): IActionInputs => {
  const JIRA_TOKEN: string = core.getInput('jira-token', { required: true });
  const JIRA_BASE_URL: string = core.getInput('jira-base-url', { required: true });
  const GITHUB_TOKEN: string = core.getInput('github-token', { required: true });
  const BRANCH_IGNORE_PATTERN: string = core.getInput('skip-branches', { required: false }) || '';
  const CUSTOM_ISSUE_NUMBER_REGEXP = core.getInput('custom-issue-number-regexp', { required: false });
  const JIRA_PROJECT_KEY = core.getInput('jira-project-key', { required: false });
  const FAIL_WHEN_JIRA_ISSUE_NOT_FOUND = core.getInput('fail-when-jira-issue-not-found', { required: false }) === 'true' || false;
  const SKIP_TICKET_TITLE = core.getInput('skip-ticket-title', { required: false }) === 'true' || false;
  const COMPARE_FIX_VERSION = core.getInput('compare-fix-version', { required: false }) || '';
  const FIX_VERSION_REGEX = core.getInput('fix-version-regex', { required: false }) || '';
  const FIX_VERSION_WILDCARDS_RAW = core.getInput('fix-version-wildcards', { required: false }) || '';
  const FIX_VERSION_WILDCARDS = FIX_VERSION_WILDCARDS_RAW.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const WHAT_TO_USE: ESource = (core.getInput('use', { required: false }) as ESource) || ESource.prTitle;
  return {
    JIRA_TOKEN,
    GITHUB_TOKEN,
    WHAT_TO_USE,
    BRANCH_IGNORE_PATTERN,
    JIRA_PROJECT_KEY,
    CUSTOM_ISSUE_NUMBER_REGEXP,
    FAIL_WHEN_JIRA_ISSUE_NOT_FOUND,
    SKIP_TICKET_TITLE,
    COMPARE_FIX_VERSION,
    FIX_VERSION_REGEX,
    FIX_VERSION_WILDCARDS,
    JIRA_BASE_URL: JIRA_BASE_URL.endsWith('/') ? JIRA_BASE_URL.replace(/\/$/, '') : JIRA_BASE_URL,
  };
};
