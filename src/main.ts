import * as core from '@actions/core';
import { ESource } from './types';
import { shouldSkipBranch, compareFixVersions } from './utils';
import { getInputs } from './action-inputs';
import { GithubConnector } from './github-connector';
import { JiraConnector } from './jira-connector';

async function run(): Promise<void> {
  const { FAIL_WHEN_JIRA_ISSUE_NOT_FOUND, SKIP_TICKET_TITLE, COMPARE_FIX_VERSION, FIX_VERSION_REGEX } = getInputs();

  try {
    const { BRANCH_IGNORE_PATTERN } = getInputs();

    const githubConnector = new GithubConnector();
    const jiraConnector = new JiraConnector();

    if (!githubConnector.isPRAction) {
      console.log('This action meant to be run only on PRs');
      setOutputs(null, null);
      process.exit(0);
    }

    if (shouldSkipBranch(githubConnector.headBranch, BRANCH_IGNORE_PATTERN)) {
      setOutputs(null, null);
      process.exit(0);
    }

    const { key, source } = githubConnector.getIssueKeyFromTitle();

    const details = await jiraConnector.getTicketDetails(key);
    await githubConnector.updatePrDetails(details, SKIP_TICKET_TITLE);

    // Compare fix versions if COMPARE_FIX_VERSION is provided
    if (COMPARE_FIX_VERSION) {
      console.log(`Comparing fix version: expected ${COMPARE_FIX_VERSION}`);
      const { matches, jiraVersion, extractedVersion } = compareFixVersions(COMPARE_FIX_VERSION, details.fixVersions, FIX_VERSION_REGEX || undefined);

      if (!matches) {
        const errorMessage = jiraVersion
          ? `Version mismatch: Expected version \`${COMPARE_FIX_VERSION}\` but JIRA ticket has fix version \`${jiraVersion}\`${
              extractedVersion ? ` (extracted: ${extractedVersion})` : ''
            }.`
          : `Version mismatch: Expected version \`${COMPARE_FIX_VERSION}\` but JIRA ticket has no fix version set.`;

        // Log detailed error information
        console.error('⚠️  Fix Version Mismatch');
        console.error(errorMessage);
        console.error(`Expected: ${COMPARE_FIX_VERSION}`);
        console.error(`JIRA Fix Version: ${jiraVersion || 'Not set'}`);

        // Fail the action
        core.setFailed(errorMessage);
        setOutputs(key, source);
        process.exit(1);
      } else {
        console.log(`✓ Fix version matches: ${COMPARE_FIX_VERSION}`);
      }
    }

    setOutputs(key, source);
  } catch (error) {
    console.log('Failed to add JIRA description to PR.');
    core.error(error.message);
    setOutputs(null, null);
    if (FAIL_WHEN_JIRA_ISSUE_NOT_FOUND) {
      core.setFailed(error.message);
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

function setOutputs(key: string | null, source: ESource | null): void {
  var isFound = key !== null;
  core.setOutput('jira-issue-key', key);
  core.setOutput('jira-issue-found', isFound);
  core.setOutput('jira-issue-source', source || 'null');
}

run();
