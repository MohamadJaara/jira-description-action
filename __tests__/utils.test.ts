import { HIDDEN_MARKER_END, HIDDEN_MARKER_START, WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS } from '../src/constants';
import { JIRADetails } from '../src/types';
import {
  getJIRAIssueKeyByDefaultRegexp,
  getJIRAIssueKeysByCustomRegexp,
  getPRDescription,
  shouldSkipBranch,
  buildPRDescription,
  extractVersionFromString,
  compareFixVersions,
} from '../src/utils';

jest.spyOn(console, 'log').mockImplementation(); // avoid actual console.log in test output

describe('shouldSkipBranch()', () => {
  it('should recognize bot PRs', () => {
    expect(shouldSkipBranch('dependabot/npm_and_yarn/types/react-dom-16.9.6')).toBe(true);
    expect(shouldSkipBranch('feature/add-dependabot-config')).toBe(false);
  });

  it('should handle custom ignore patterns', () => {
    expect(shouldSkipBranch('bar', '^bar')).toBeTruthy();
    expect(shouldSkipBranch('foobar', '^bar')).toBeFalsy();

    expect(shouldSkipBranch('bar', '[0-9]{2}')).toBeFalsy();
    expect(shouldSkipBranch('bar', '')).toBeFalsy();
    expect(shouldSkipBranch('f00', '[0-9]{2}')).toBeTruthy();

    const customBranchRegex = '^(production-release|master|release/v\\d+)$';

    expect(shouldSkipBranch('production-release', customBranchRegex)).toBeTruthy();
    expect(shouldSkipBranch('master', customBranchRegex)).toBeTruthy();
    expect(shouldSkipBranch('release/v77', customBranchRegex)).toBeTruthy();

    expect(shouldSkipBranch('release/very-important-feature', customBranchRegex)).toBeFalsy();
    expect(shouldSkipBranch('')).toBeFalsy();
  });
});

describe('getJIRAIssueKeys()', () => {
  it('gets jira key from different strings', () => {
    expect(getJIRAIssueKeyByDefaultRegexp('fix/login-protocol-es-43')).toEqual('ES-43');
    expect(getJIRAIssueKeyByDefaultRegexp('fix/login-protocol-ES-43')).toEqual('ES-43');
    expect(getJIRAIssueKeyByDefaultRegexp('[ES-43, ES-15] Feature description')).toEqual('ES-43');

    expect(getJIRAIssueKeyByDefaultRegexp('feature/missingKey')).toEqual(null);
    expect(getJIRAIssueKeyByDefaultRegexp('')).toEqual(null);
  });
});

describe('getJIRAIssueKeysByCustomRegexp() gets jira keys from different strings', () => {
  it('with project name', () => {
    expect(getJIRAIssueKeysByCustomRegexp('law-18,345', '^LAW-??(\\d+)', 'LAW')).toEqual('LAW-18');
    //expect(getJIRAIssueKeysByCustomRegexp('fix/login-protocol-es-43', '^\\d+', 'QQ')).toEqual(null);
    //expect(getJIRAIssueKeysByCustomRegexp('43-login-protocol', '^\\d+', 'QQ')).toEqual('QQ-43');
  });

  it('without project name', () => {
    expect(getJIRAIssueKeysByCustomRegexp('18,345', '\\d+')).toEqual('18');
    expect(getJIRAIssueKeysByCustomRegexp('fix/login-protocol-es-43', 'es-\\d+')).toEqual('ES-43');
  });

  it('with grouped value in regexp', () => {
    expect(getJIRAIssueKeysByCustomRegexp('fix/login-protocol-es-43', '(es-\\d+)$')).toEqual('ES-43');
    expect(getJIRAIssueKeysByCustomRegexp('fix/login-20-in-14', '-(IN-\\d+)')).toEqual('IN-14');
    expect(getJIRAIssueKeysByCustomRegexp('fix/login-20-in-14', 'in-(\\d+)', 'PRJ')).toEqual('PRJ-20');
  });
});

describe('getPRDescription()', () => {
  it('should prepend issue info with hidden markers to old PR body', () => {
    const oldPRBody = 'old PR description body';
    const issueInfo = 'new info about jira task';
    const description = getPRDescription(oldPRBody, issueInfo);

    expect(description).toEqual(`${WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS}
${HIDDEN_MARKER_START}
${issueInfo}
${HIDDEN_MARKER_END}
${oldPRBody}`);
  });

  it('should replace issue info', () => {
    const oldPRBodyInformation = 'old PR description body';
    const oldPRBody = `${HIDDEN_MARKER_START}Here is some old issue information${HIDDEN_MARKER_END}${oldPRBodyInformation}`;
    const issueInfo = 'new info about jira task';

    const description = getPRDescription(oldPRBody, issueInfo);

    expect(description).toEqual(`${WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS}
${HIDDEN_MARKER_START}
${issueInfo}
${HIDDEN_MARKER_END}
${oldPRBodyInformation}`);
  });

  it('does not duplicate WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS in the body when run multiple times', () => {
    const oldPRBodyInformation = 'old PR description body';
    const oldPRBody = `${HIDDEN_MARKER_START}Here is some old issue information${HIDDEN_MARKER_END}${oldPRBodyInformation}`;
    const issueInfo = 'new info about jira task';

    const firstDescription = getPRDescription(oldPRBody, issueInfo);
    const secondDescription = getPRDescription(firstDescription, issueInfo);

    expect(secondDescription).toEqual(`${WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS}
${HIDDEN_MARKER_START}
${issueInfo}
${HIDDEN_MARKER_END}
${oldPRBodyInformation}`);
  });

  it('respects the location of HIDDEN_MARKER_START and HIDDEN_MARKER_END when they already exist in the pull request body', () => {
    const issueInfo = 'new info about jira task';
    const oldPRDescription = `this is text above the markers
${WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS}
${HIDDEN_MARKER_START}
${issueInfo}
${HIDDEN_MARKER_END}
this is text below the markers`;
    const description = getPRDescription(oldPRDescription, issueInfo);
    expect(description).toEqual(oldPRDescription);
  });

  it('should work with plain link when skip-ticket-title is enabled', () => {
    const oldPRBody = 'old PR description body';
    const plainLink = 'https://example.com/browse/ABC-123';
    const description = getPRDescription(oldPRBody, plainLink);

    expect(description).toEqual(`${WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS}
${HIDDEN_MARKER_START}
${plainLink}
${HIDDEN_MARKER_END}
${oldPRBody}`);
  });

  it('should replace HTML table with plain link when updating from formatted to skip mode', () => {
    const oldPRBodyInformation = 'old PR description body';
    const oldFormattedTable = '<table><tbody><tr><td>formatted content</td></tr></tbody></table>';
    const oldPRBody = `${HIDDEN_MARKER_START}${oldFormattedTable}${HIDDEN_MARKER_END}${oldPRBodyInformation}`;
    const plainLink = 'https://example.com/browse/ABC-123';

    const description = getPRDescription(oldPRBody, plainLink);

    expect(description).toEqual(`${WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS}
${HIDDEN_MARKER_START}
${plainLink}
${HIDDEN_MARKER_END}
${oldPRBodyInformation}`);
    expect(description).not.toContain('<table>');
    expect(description).not.toContain('formatted content');
  });
});

describe('buildPRDescription()', () => {
  const details: JIRADetails = {
    key: 'ABC-123',
    summary: 'Sample summary',
    url: 'example.com/ABC-123',
    type: {
      name: 'story',
      icon: 'icon.png',
    },
    project: {
      name: 'name',
      url: 'url',
      key: 'key',
    },
  };

  it('should return description HTML from the JIRA details', () => {
    expect(buildPRDescription(details)).toEqual(`<table><tbody><tr><td>
  <a href="example.com/ABC-123" title="ABC-123" target="_blank"><img alt="story" src="icon.png" /> ABC-123</a>
  Sample summary
</td></tr></tbody></table>`);
  });

  it('should return description HTML when skipTitle is false', () => {
    expect(buildPRDescription(details, false)).toEqual(`<table><tbody><tr><td>
  <a href="example.com/ABC-123" title="ABC-123" target="_blank"><img alt="story" src="icon.png" /> ABC-123</a>
  Sample summary
</td></tr></tbody></table>`);
  });

  it('should return only the URL when skipTitle is true', () => {
    expect(buildPRDescription(details, true)).toEqual('example.com/ABC-123');
  });

  it('should return plain link without formatted table when skipTitle is enabled', () => {
    const result = buildPRDescription(details, true);

    // Should not contain HTML table elements
    expect(result).not.toContain('<table>');
    expect(result).not.toContain('<tbody>');
    expect(result).not.toContain('<tr>');
    expect(result).not.toContain('<td>');
    expect(result).not.toContain('<a');
    expect(result).not.toContain('<img');

    // Should not contain summary
    expect(result).not.toContain('Sample summary');

    // Should only be the URL (plain string, no formatting)
    expect(result).toBe('example.com/ABC-123');

    // Verify it's a simple string with no HTML
    expect(result).toMatch(/^[^<>]+$/);
  });
});

describe('extractVersionFromString()', () => {
  it('should extract version from plain version string', () => {
    expect(extractVersionFromString('4.17.0')).toEqual('4.17.0');
    expect(extractVersionFromString('1.2.3')).toEqual('1.2.3');
    expect(extractVersionFromString('10.0.1')).toEqual('10.0.1');
  });

  it('should extract version with "v" prefix', () => {
    expect(extractVersionFromString('v4.17.0')).toEqual('4.17.0');
    expect(extractVersionFromString('v1.2.3')).toEqual('1.2.3');
    expect(extractVersionFromString('V4.17.0')).toEqual('4.17.0');
  });

  it('should extract version from string with prefix like "android"', () => {
    expect(extractVersionFromString('android 4.17.0')).toEqual('4.17.0');
    expect(extractVersionFromString('ios 2.3.1')).toEqual('2.3.1');
    expect(extractVersionFromString('web-1.0.0')).toEqual('1.0.0');
    expect(extractVersionFromString('backend_3.5.2')).toEqual('3.5.2');
  });

  it('should extract version with build metadata', () => {
    expect(extractVersionFromString('4.17.0-beta')).toEqual('4.17.0-beta');
    expect(extractVersionFromString('1.2.3+build.123')).toEqual('1.2.3+build.123');
    expect(extractVersionFromString('2.0.0-rc.1')).toEqual('2.0.0-rc.1');
    expect(extractVersionFromString('android 4.17.0-alpha')).toEqual('4.17.0-alpha');
  });

  it('should extract two-part versions', () => {
    expect(extractVersionFromString('4.17')).toEqual('4.17');
    expect(extractVersionFromString('android 2.5')).toEqual('2.5');
  });

  it('should return null for strings without version', () => {
    expect(extractVersionFromString('no version here')).toEqual(null);
    expect(extractVersionFromString('android')).toEqual(null);
    expect(extractVersionFromString('')).toEqual(null);
    expect(extractVersionFromString('test-branch-name')).toEqual(null);
  });

  it('should extract first version if multiple are present', () => {
    expect(extractVersionFromString('version 1.2.3 and 4.5.6')).toEqual('1.2.3');
  });
});

describe('compareFixVersions() - Direct comparison without regex', () => {
  it('should match exact version strings when no regex provided', () => {
    const jiraFixVersions = [{ name: '4.17.0', id: '1' }];
    const result = compareFixVersions('4.17.0', jiraFixVersions);

    expect(result.matches).toBe(true);
    expect(result.extractedVersion).toEqual('4.17.0');
    expect(result.jiraVersion).toEqual('4.17.0');
  });

  it('should NOT match when JIRA has "android 4.17.0" and expected is "4.17.0" (no regex)', () => {
    const jiraFixVersions = [{ name: 'android 4.17.0', id: '1' }];
    const result = compareFixVersions('4.17.0', jiraFixVersions);

    expect(result.matches).toBe(false);
    expect(result.extractedVersion).toEqual('android 4.17.0');
    expect(result.jiraVersion).toEqual('android 4.17.0');
  });

  it('should match when JIRA and expected are exactly the same (with prefix)', () => {
    const jiraFixVersions = [{ name: 'android 4.17.0', id: '1' }];
    const result = compareFixVersions('android 4.17.0', jiraFixVersions);

    expect(result.matches).toBe(true);
    expect(result.extractedVersion).toEqual('android 4.17.0');
    expect(result.jiraVersion).toEqual('android 4.17.0');
  });

  it('should NOT match "v4.17.0" with "4.17.0" when no regex', () => {
    const jiraFixVersions = [{ name: 'v4.17.0', id: '1' }];
    const result = compareFixVersions('4.17.0', jiraFixVersions);

    expect(result.matches).toBe(false);
    expect(result.extractedVersion).toEqual('v4.17.0');
  });

  it('should match when both have exact same prefix', () => {
    const jiraFixVersions = [{ name: 'v4.17.0', id: '1' }];
    const result = compareFixVersions('v4.17.0', jiraFixVersions);

    expect(result.matches).toBe(true);
    expect(result.extractedVersion).toEqual('v4.17.0');
  });

  it('should NOT match with different platform prefixes when no regex', () => {
    expect(compareFixVersions('2.3.1', [{ name: 'ios 2.3.1', id: '1' }]).matches).toBe(false);
    expect(compareFixVersions('1.0.0', [{ name: 'web-1.0.0', id: '1' }]).matches).toBe(false);
    expect(compareFixVersions('3.5.2', [{ name: 'backend_3.5.2', id: '1' }]).matches).toBe(false);
  });

  it('should match when version is in multiple fix versions list', () => {
    const jiraFixVersions = [
      { name: '4.16.0', id: '1' },
      { name: '4.17.0', id: '2' },
      { name: '4.18.0', id: '3' },
    ];
    const result = compareFixVersions('4.17.0', jiraFixVersions);

    expect(result.matches).toBe(true);
    expect(result.extractedVersion).toEqual('4.17.0');
    expect(result.jiraVersion).toEqual('4.16.0, 4.17.0, 4.18.0');
  });

  it('should not match when versions differ', () => {
    const jiraFixVersions = [{ name: '4.18.0', id: '1' }];
    const result = compareFixVersions('4.17.0', jiraFixVersions);

    expect(result.matches).toBe(false);
    expect(result.extractedVersion).toEqual('4.18.0');
    expect(result.jiraVersion).toEqual('4.18.0');
  });

  it('should not match when JIRA has no fix versions', () => {
    const result = compareFixVersions('4.17.0', []);

    expect(result.matches).toBe(false);
    expect(result.extractedVersion).toEqual(null);
    expect(result.jiraVersion).toEqual(null);
  });

  it('should not match when JIRA fix versions is undefined', () => {
    const result = compareFixVersions('4.17.0', undefined);

    expect(result.matches).toBe(false);
    expect(result.extractedVersion).toEqual(null);
    expect(result.jiraVersion).toEqual(null);
  });
});

describe('compareFixVersions() - With default regex', () => {
  const defaultRegex = '(?:^|[\\s\\-_])(v?\\d+\\.\\d+(?:\\.\\d+)?(?:[\\-\\+][\\w\\.\\-]*)?)';

  it('should match when JIRA has "android 4.17.0" and expected is "4.17.0" with default regex', () => {
    const jiraFixVersions = [{ name: 'android 4.17.0', id: '1' }];
    const result = compareFixVersions('4.17.0', jiraFixVersions, defaultRegex);

    expect(result.matches).toBe(true);
    expect(result.extractedVersion).toEqual('4.17.0');
    expect(result.jiraVersion).toEqual('android 4.17.0');
  });

  it('should match version with "v" prefix using default regex', () => {
    const jiraFixVersions = [{ name: 'v4.17.0', id: '1' }];
    const result = compareFixVersions('4.17.0', jiraFixVersions, defaultRegex);

    expect(result.matches).toBe(true);
    expect(result.extractedVersion).toEqual('4.17.0');
  });

  it('should match with different platform prefixes using default regex', () => {
    expect(compareFixVersions('2.3.1', [{ name: 'ios 2.3.1', id: '1' }], defaultRegex).matches).toBe(true);
    expect(compareFixVersions('1.0.0', [{ name: 'web-1.0.0', id: '1' }], defaultRegex).matches).toBe(true);
    expect(compareFixVersions('3.5.2', [{ name: 'backend_3.5.2', id: '1' }], defaultRegex).matches).toBe(true);
  });

  it('should not match when versions differ', () => {
    const jiraFixVersions = [{ name: 'android 4.18.0', id: '1' }];
    const result = compareFixVersions('4.17.0', jiraFixVersions, defaultRegex);

    expect(result.matches).toBe(false);
    expect(result.extractedVersion).toEqual('4.18.0');
    expect(result.jiraVersion).toEqual('android 4.18.0');
  });

  it('should handle multiple fix versions and find match', () => {
    const jiraFixVersions = [
      { name: 'android 4.16.0', id: '1' },
      { name: 'android 4.17.0', id: '2' },
      { name: 'android 4.18.0', id: '3' },
    ];
    const result = compareFixVersions('4.17.0', jiraFixVersions, defaultRegex);

    expect(result.matches).toBe(true);
    expect(result.extractedVersion).toEqual('4.17.0');
    expect(result.jiraVersion).toEqual('android 4.16.0, android 4.17.0, android 4.18.0');
  });

  it('should not match when version not in multiple fix versions', () => {
    const jiraFixVersions = [
      { name: 'android 4.16.0', id: '1' },
      { name: 'android 4.18.0', id: '2' },
    ];
    const result = compareFixVersions('4.17.0', jiraFixVersions, defaultRegex);

    expect(result.matches).toBe(false);
    expect(result.jiraVersion).toEqual('android 4.16.0, android 4.18.0');
  });

  it('should handle JIRA fix version without valid version number', () => {
    const jiraFixVersions = [{ name: 'Next Release', id: '1' }];
    const result = compareFixVersions('4.17.0', jiraFixVersions, defaultRegex);

    expect(result.matches).toBe(false);
    expect(result.extractedVersion).toEqual(null);
    expect(result.jiraVersion).toEqual('Next Release');
  });

  it('should match two-part versions', () => {
    const jiraFixVersions = [{ name: 'android 4.17', id: '1' }];
    const result = compareFixVersions('4.17', jiraFixVersions, defaultRegex);

    expect(result.matches).toBe(true);
    expect(result.extractedVersion).toEqual('4.17');
  });

  it('should match versions with build metadata', () => {
    const jiraFixVersions = [{ name: 'android 4.17.0-beta', id: '1' }];
    const result = compareFixVersions('4.17.0-beta', jiraFixVersions, defaultRegex);

    expect(result.matches).toBe(true);
    expect(result.extractedVersion).toEqual('4.17.0-beta');
  });
});

describe('extractVersionFromString() with custom regex', () => {
  it('should use default regex when no custom regex provided', () => {
    expect(extractVersionFromString('android 4.17.0')).toEqual('4.17.0');
    expect(extractVersionFromString('v4.17.0')).toEqual('4.17.0');
  });

  it('should use custom regex to extract version differently', () => {
    // Custom regex that only captures the version number after "Release-"
    const customRegex = 'Release-(\\d+\\.\\d+\\.\\d+)';

    expect(extractVersionFromString('Release-4.17.0', customRegex)).toEqual('4.17.0');
    expect(extractVersionFromString('Release-1.2.3', customRegex)).toEqual('1.2.3');

    // Should not match without "Release-" prefix
    expect(extractVersionFromString('android 4.17.0', customRegex)).toEqual(null);
  });

  it('should support custom regex for different version patterns', () => {
    // Custom regex for versions like "v4.17"
    const customRegex = 'v(\\d+\\.\\d+)';

    expect(extractVersionFromString('v4.17', customRegex)).toEqual('4.17');
    expect(extractVersionFromString('v1.5', customRegex)).toEqual('1.5');
  });

  it('should handle custom regex with different prefixes', () => {
    // Custom regex for "APP_VERSION_X.Y.Z" format
    const customRegex = 'APP_VERSION_(\\d+\\.\\d+\\.\\d+)';

    expect(extractVersionFromString('APP_VERSION_4.17.0', customRegex)).toEqual('4.17.0');
    expect(extractVersionFromString('APP_VERSION_2.3.1', customRegex)).toEqual('2.3.1');
  });

  it('should return null with custom regex when pattern does not match', () => {
    const customRegex = 'Release-(\\d+\\.\\d+\\.\\d+)';

    expect(extractVersionFromString('android 4.17.0', customRegex)).toEqual(null);
    expect(extractVersionFromString('4.17.0', customRegex)).toEqual(null);
  });
});

describe('compareFixVersions() with custom regex', () => {
  it('should use custom regex to match versions', () => {
    const customRegex = 'Release-(\\d+\\.\\d+\\.\\d+)';
    const jiraFixVersions = [{ name: 'Release-4.17.0', id: '1' }];

    const result = compareFixVersions('4.17.0', jiraFixVersions, customRegex);

    expect(result.matches).toBe(true);
    expect(result.extractedVersion).toEqual('4.17.0');
  });

  it('should fail to match with custom regex when pattern differs', () => {
    const customRegex = 'Release-(\\d+\\.\\d+\\.\\d+)';
    const jiraFixVersions = [{ name: 'android 4.17.0', id: '1' }];

    const result = compareFixVersions('4.17.0', jiraFixVersions, customRegex);

    expect(result.matches).toBe(false);
    expect(result.extractedVersion).toEqual(null);
  });

  it('should use direct comparison when no custom regex provided', () => {
    const jiraFixVersions = [{ name: '4.17.0', id: '1' }];

    const result = compareFixVersions('4.17.0', jiraFixVersions);

    expect(result.matches).toBe(true);
    expect(result.extractedVersion).toEqual('4.17.0');
  });

  it('should NOT match "android 4.17.0" with "4.17.0" when no regex provided', () => {
    const jiraFixVersions = [{ name: 'android 4.17.0', id: '1' }];

    const result = compareFixVersions('4.17.0', jiraFixVersions);

    expect(result.matches).toBe(false);
    expect(result.extractedVersion).toEqual('android 4.17.0');
  });

  it('should match with custom regex for multiple fix versions', () => {
    const customRegex = 'v(\\d+\\.\\d+)';
    const jiraFixVersions = [
      { name: 'v4.16', id: '1' },
      { name: 'v4.17', id: '2' },
    ];

    const result = compareFixVersions('4.17', jiraFixVersions, customRegex);

    expect(result.matches).toBe(true);
    expect(result.extractedVersion).toEqual('4.17');
  });

  it('should handle custom regex with special JIRA naming conventions', () => {
    // Custom regex for "Sprint 123 - 4.17.0" format
    const customRegex = 'Sprint \\d+ - (\\d+\\.\\d+\\.\\d+)';
    const jiraFixVersions = [{ name: 'Sprint 42 - 4.17.0', id: '1' }];

    const result = compareFixVersions('4.17.0', jiraFixVersions, customRegex);

    expect(result.matches).toBe(true);
    expect(result.extractedVersion).toEqual('4.17.0');
  });
});
