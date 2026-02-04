import {
  BOT_BRANCH_PATTERNS,
  DEFAULT_BRANCH_PATTERNS,
  DEFAULT_FIX_VERSION_REGEX,
  HIDDEN_MARKER_END,
  HIDDEN_MARKER_START,
  JIRA_REGEX_MATCHER,
  WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS,
} from './constants';
import { JIRADetails } from './types';

const getJIRAIssueKey = (input: string, regexp: RegExp = JIRA_REGEX_MATCHER): string | null => {
  const matches = regexp.exec(input);
  return matches ? matches[matches.length - 1] : null;
};

export const getJIRAIssueKeyByDefaultRegexp = (input: string): string | null => {
  const key = getJIRAIssueKey(input, new RegExp(JIRA_REGEX_MATCHER));
  return key ? key.toUpperCase() : null;
};

export const getJIRAIssueKeysByCustomRegexp = (input: string, numberRegexp: string, projectKey?: string): string | null => {
  const customRegexp = new RegExp(numberRegexp, 'gi');

  const ticketNumber = getJIRAIssueKey(input, customRegexp);
  if (!ticketNumber) {
    return null;
  }
  const key = projectKey ? `${projectKey}-${ticketNumber}` : ticketNumber;
  return key.toUpperCase();
};

export const shouldSkipBranch = (branch: string, additionalIgnorePattern?: string): boolean => {
  if (BOT_BRANCH_PATTERNS.some((pattern) => pattern.test(branch))) {
    console.log(`You look like a bot 🤖 so we're letting you off the hook!`);
    return true;
  }

  if (DEFAULT_BRANCH_PATTERNS.some((pattern) => pattern.test(branch))) {
    console.log(`Ignoring check for default branch ${branch}`);
    return true;
  }

  const ignorePattern = new RegExp(additionalIgnorePattern || '');
  if (!!additionalIgnorePattern && ignorePattern.test(branch)) {
    console.log(`branch '${branch}' ignored as it matches the ignore pattern '${additionalIgnorePattern}' provided in skip-branches`);
    return true;
  }

  return false;
};

const escapeRegexp = (str: string): string => {
  return str.replace(/[\\^$.|?*+(<>)[{]/g, '\\$&');
};

export const getPRDescription = (oldBody: string, details: string): string => {
  const hiddenMarkerStartRg = escapeRegexp(HIDDEN_MARKER_START);
  const hiddenMarkerEndRg = escapeRegexp(HIDDEN_MARKER_END);
  const warningMsgRg = escapeRegexp(WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS);

  const replaceDetailsRg = new RegExp(`${hiddenMarkerStartRg}([\\s\\S]+)${hiddenMarkerEndRg}[\\s]?`, 'igm');
  const replaceWarningMessageRg = new RegExp(`${warningMsgRg}[\\s]?`, 'igm');
  const jiraDetailsMessage = `${WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS}
${HIDDEN_MARKER_START}
${details}
${HIDDEN_MARKER_END}
`;
  if (replaceDetailsRg.test(oldBody)) {
    return (oldBody ?? '').replace(replaceWarningMessageRg, '').replace(replaceDetailsRg, jiraDetailsMessage);
  }
  return jiraDetailsMessage + oldBody;
};

export const buildPRDescription = (details: JIRADetails, skipTitle: boolean = false) => {
  // If skipTitle is true, return only the plain link
  if (skipTitle) {
    return details.url;
  }

  // Otherwise, return the formatted table with all details
  const displayKey = details.key.toUpperCase();
  return `<table><tbody><tr><td>
  <a href="${details.url}" title="${displayKey}" target="_blank"><img alt="${details.type.name}" src="${details.type.icon}" /> ${displayKey}</a>
  ${details.summary}
</td></tr></tbody></table>`;
};

/**
 * Extracts version number from a string using regex
 * Supports formats like "android 4.17.0", "4.17.0", "v4.17.0", etc.
 * @param versionString - The string containing the version
 * @param customRegex - Optional custom regex pattern (uses default if not provided)
 * @returns Extracted version or null if not found
 */
export const extractVersionFromString = (versionString: string, customRegex?: string): string | null => {
  // Use custom regex or default pattern
  const regexPattern = customRegex || DEFAULT_FIX_VERSION_REGEX;
  const versionRegex = new RegExp(regexPattern, 'i');
  const matches = versionRegex.exec(versionString);

  if (matches && matches[1]) {
    // Remove 'v' prefix if present
    return matches[1].replace(/^v/i, '');
  }

  return null;
};

/**
 * Compares two version strings
 * @param expectedVersion - The expected version from the repository
 * @param jiraFixVersions - Array of fix versions from JIRA ticket
 * @param customRegex - Optional custom regex pattern for version extraction. If not provided, compares directly without extraction.
 * @param wildcardFixVersions - Optional list of JIRA fix versions that should always be treated as a match.
 * @returns Object with match status and extracted JIRA version
 */
export const compareFixVersions = (
  expectedVersion: string,
  jiraFixVersions?: Array<{ name: string; id: string }>,
  customRegex?: string,
  wildcardFixVersions?: string[]
): { matches: boolean; jiraVersion: string | null; extractedVersion: string | null } => {
  if (!jiraFixVersions || jiraFixVersions.length === 0) {
    console.log('No fix versions found in JIRA ticket');
    return { matches: false, jiraVersion: null, extractedVersion: null };
  }

  // Get the first fix version (or combine if multiple)
  const jiraVersionString = jiraFixVersions.map((v) => v.name).join(', ');
  console.log(`JIRA fix version(s): ${jiraVersionString}`);

  const normalizeFixVersion = (value: string): string => value.trim().toLowerCase();
  const wildcardSet = new Set((wildcardFixVersions || []).map(normalizeFixVersion).filter(Boolean));

  if (wildcardSet.size > 0) {
    for (const fixVersion of jiraFixVersions) {
      if (wildcardSet.has(normalizeFixVersion(fixVersion.name))) {
        console.log(`✓ Wildcard fix version matched: ${fixVersion.name}`);
        return { matches: true, jiraVersion: jiraVersionString, extractedVersion: fixVersion.name };
      }
    }
  }

  // If no custom regex provided, compare as-is (direct string comparison)
  if (!customRegex) {
    console.log('No custom regex provided, comparing versions directly (as-is)');
    for (const fixVersion of jiraFixVersions) {
      console.log(`Comparing "${fixVersion.name}" === "${expectedVersion}"`);

      if (fixVersion.name === expectedVersion) {
        console.log(`✓ Direct match found: ${fixVersion.name} === ${expectedVersion}`);
        return { matches: true, jiraVersion: jiraVersionString, extractedVersion: fixVersion.name };
      }
    }

    console.log(`✗ No direct match: Expected ${expectedVersion}, found ${jiraVersionString} in JIRA`);
    return { matches: false, jiraVersion: jiraVersionString, extractedVersion: jiraFixVersions[0].name };
  }

  // Custom regex provided, extract and compare
  console.log(`Using custom regex pattern: ${customRegex}`);

  // Try to extract version from each fix version in JIRA
  for (const fixVersion of jiraFixVersions) {
    const extractedVersion = extractVersionFromString(fixVersion.name, customRegex);
    console.log(`Extracted version from "${fixVersion.name}": ${extractedVersion}`);

    if (extractedVersion && extractedVersion === expectedVersion) {
      console.log(`✓ Version match found: ${extractedVersion} === ${expectedVersion}`);
      return { matches: true, jiraVersion: jiraVersionString, extractedVersion };
    }
  }

  // Check if any extraction was successful
  const firstExtracted = extractVersionFromString(jiraFixVersions[0].name, customRegex);
  console.log(`✗ Version mismatch: Expected ${expectedVersion}, found ${firstExtracted || 'no version'} in JIRA`);

  return { matches: false, jiraVersion: jiraVersionString, extractedVersion: firstExtracted };
};
