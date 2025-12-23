import React, { useState, useEffect } from 'react';
import { GitPullRequest, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import GitHubAPI from './services/githubApi';

const ReleaseComparison = () => {
  const [availableReleases, setAvailableReleases] = useState([]);
  const [releaseSummary, setReleaseSummary] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [modalData, setModalData] = useState(null);
  const [jiraReleaseTickets, setJiraReleaseTickets] = useState({});
  const [jiraReleaseSummaries, setJiraReleaseSummaries] = useState({});
  const [selectedEngineerFilter, setSelectedEngineerFilter] = useState({});
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    fetchAvailableReleases();
    loadJiraReleaseTickets();
  }, []);

  useEffect(() => {
    if (Object.keys(availableReleases).length > 0 && releaseSummary.length === 0) {
      fetchReleaseSummary();
    }
  }, [availableReleases]);

  const getCachedData = (cacheKey) => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      const now = Date.now();
      const TEN_MINUTES = 10 * 60 * 1000;

      if (now - timestamp < TEN_MINUTES) {
        console.log('[Cache] Using cached data (age:', Math.round((now - timestamp) / 1000), 'seconds)');
        return data;
      }

      localStorage.removeItem(cacheKey);
      return null;
    } catch (error) {
      console.error('[Cache] Error reading cache:', error);
      return null;
    }
  };

  const setCachedData = (cacheKey, data) => {
    try {
      const cacheEntry = { data, timestamp: Date.now() };
      localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
    } catch (error) {
      console.error('[Cache] Error writing cache:', error);
    }
  };

  const loadJiraReleaseTickets = async () => {
    console.log('[JIRA] Loading release tickets...');
    try {
      const response = await fetch('/jira-release-tickets.json');
      if (!response.ok) {
        console.log('[JIRA] No jira-release-tickets.json found. Run: npm run fetch-jira');
        return;
      }
      const data = await response.json();
      setJiraReleaseTickets(data.releases || {});
      setJiraReleaseSummaries(data.summaries || {});
      console.log(`[JIRA] Loaded tickets for ${Object.keys(data.releases || {}).length} releases`);
      console.log(`[JIRA] Total tickets: ${data.totalTickets}`);
      if (data.lastUpdated) {
        console.log(`[JIRA] Release tickets last updated: ${data.lastUpdated}`);
      }
    } catch (error) {
      console.error('[JIRA] Error loading jira-release-tickets.json:', error);
    }
  };

  const fetchAvailableReleases = async () => {
    console.log('[Release] Fetching available releases...');

    const cacheKey = `available_releases_${import.meta.env.VITE_GITHUB_ORG}`;
    const cachedData = getCachedData(cacheKey);

    if (cachedData) {
      console.log('[Release] Using cached releases data');
      setAvailableReleases(cachedData.releasesMap);
      return;
    }

    try {
      const token = import.meta.env.VITE_GITHUB_TOKEN;
      const org = import.meta.env.VITE_GITHUB_ORG;
      const repos = import.meta.env.VITE_GITHUB_REPOS?.split(',').filter(Boolean);

      if (!token || !org || !repos) {
        throw new Error('Missing GitHub configuration.');
      }

      const githubApi = new GitHubAPI(token, org);
      const releasesMap = {};

      for (const repo of repos) {
        const releases = await githubApi.getReleaseBranches(repo);
        releasesMap[repo] = releases;
      }

      setAvailableReleases(releasesMap);

      setCachedData(cacheKey, { releasesMap });
      console.log('[Release] Cached releases data');
    } catch (err) {
      console.error('[Release] Error fetching available releases:', err);
    }
  };

  const detectDbMigration = (commits) => {
    const migrationPatterns = [
      /alembic/i,
      /migration.*\.py$/i,
      /data.*migration/i,
      /\.sql$/i,
      /db\/migrate/i,
      /schema.*change/i,
    ];

    const migrationsFound = [];

    commits.forEach(commit => {
      const hasDataMigration = migrationPatterns.some(pattern =>
        pattern.test(commit.message)
      );

      if (hasDataMigration && commit.pr) {
        migrationsFound.push({
          message: commit.message,
          pr: commit.pr,
        });
      }
    });

    return migrationsFound.length > 0 ? migrationsFound : null;
  };

  const categorizeCommitByPrefix = (message) => {
    const lowerMessage = message.toLowerCase();

    // Check for common prefixes
    if (lowerMessage.startsWith('feat:') || lowerMessage.startsWith('feature:')) return 'feat';
    if (lowerMessage.startsWith('fix:')) return 'fix';
    if (lowerMessage.startsWith('chore:')) return 'chore';
    if (lowerMessage.startsWith('docs:')) return 'docs';
    if (lowerMessage.startsWith('refactor:')) return 'refactor';
    if (lowerMessage.startsWith('test:')) return 'test';
    if (lowerMessage.startsWith('style:')) return 'style';
    if (lowerMessage.startsWith('perf:')) return 'perf';
    if (lowerMessage.startsWith('ci:')) return 'ci';
    if (lowerMessage.startsWith('build:')) return 'build';

    return 'other';
  };

  const getCommitTypeStats = (commits) => {
    const typeCounts = {
      feat: 0,
      fix: 0,
      chore: 0,
      docs: 0,
      refactor: 0,
      test: 0,
      style: 0,
      perf: 0,
      ci: 0,
      build: 0,
      other: 0,
    };

    commits.forEach(commit => {
      const type = categorizeCommitByPrefix(commit.message);
      typeCounts[type]++;
    });

    // Convert to array format for recharts and filter out zero counts and "other"
    return Object.entries(typeCounts)
      .filter(([type, count]) => count > 0 && type !== 'other')
      .map(([type, count]) => ({
        name: type.charAt(0).toUpperCase() + type.slice(1),
        value: count,
        type: type,
      }))
      .sort((a, b) => b.value - a.value);
  };

  const renderMessageWithJiraLinks = (message) => {
    const jiraUrl = import.meta.env.VITE_JIRA_URL;
    if (!jiraUrl) {
      return message;
    }

    // Match JIRA ticket patterns like DEV-1234, ENG-456, PROD-789
    const jiraPattern = /([A-Z]+-\d+)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = jiraPattern.exec(message)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(message.substring(lastIndex, match.index));
      }

      // Add the JIRA ticket as a clickable span (not a link to avoid nested <a> tags)
      const ticket = match[1];
      const ticketUrl = `${jiraUrl.replace(/\/$/, '')}/browse/${ticket}`;
      parts.push(
        <span
          key={`${ticket}-${match.index}`}
          className="text-blue-600 hover:text-blue-800 font-medium cursor-pointer underline"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            window.open(ticketUrl, '_blank');
          }}
        >
          {ticket}
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < message.length) {
      parts.push(message.substring(lastIndex));
    }

    return parts.length > 0 ? parts : message;
  };

  const fetchReleaseSummary = async () => {
    console.log('[Release] Fetching release summary...');

    const cacheKey = `release_summary_${import.meta.env.VITE_GITHUB_ORG}`;
    const cachedData = getCachedData(cacheKey);

    if (cachedData) {
      console.log('[Release] Using cached summary data');
      setReleaseSummary(cachedData);
      return;
    }

    setLoadingSummary(true);
    try {
      const token = import.meta.env.VITE_GITHUB_TOKEN;
      const org = import.meta.env.VITE_GITHUB_ORG;

      if (!token || !org) {
        throw new Error('Missing GitHub configuration.');
      }

      const githubApi = new GitHubAPI(token, org);

      const repoMapping = {
        'credo-ui': 'credoai/ui',
        'credo-backend': 'credoai/server',
        'credoai-integration-service': 'credoai/integration',
        'credoai-gaia': 'credoai/gaia',
      };

      // First, find all unique release comparisons across all repos
      const allComparisons = new Set();
      for (const [repoKey] of Object.entries(repoMapping)) {
        const releases = availableReleases[repoKey] || [];

        for (let i = 0; i < releases.length - 1 && i < 2; i++) {
          const head = releases[i];
          const base = releases[i + 1];

          const headVersion = parseInt(head.version.split('.')[0]);
          const baseVersion = parseInt(base.version.split('.')[0]);

          if (headVersion > baseVersion && headVersion - baseVersion === 1) {
            const compKey = `v${headVersion} ← v${baseVersion}`;
            allComparisons.add(compKey);
          }
        }
      }

      console.log('[Release] All unique comparisons:', Array.from(allComparisons));

      // Now for each comparison, check all repos
      const summaryData = [];

      for (const compKey of allComparisons) {
        const [headV, baseV] = compKey.split(' ← ').map(v => v.replace('v', ''));

        for (const [repoKey, repoPath] of Object.entries(repoMapping)) {
          const releases = availableReleases[repoKey] || [];

          // Check if this repo has both releases
          const headRelease = releases.find(r => r.version.split('.')[0] === headV);
          const baseRelease = releases.find(r => r.version.split('.')[0] === baseV);

          if (headRelease && baseRelease) {
            // Repo has both releases, fetch comparison
            try {
              const comparison = await githubApi.compareReleaseBranches(
                repoKey,
                baseRelease.name,
                headRelease.name
              );

              const commits = comparison.commits || [];

              const dbMigrations = repoKey === 'credo-backend'
                ? detectDbMigration(commits)
                : null;

              summaryData.push({
                app: repoKey,
                path: repoPath,
                dbMigrations: dbMigrations,
                hasChanges: commits.length > 0,
                changeCount: commits.length,
                currentRelease: compKey,
                headRelease: `v${headV}`,
                baseRelease: `v${baseV}`,
                commits: commits,
              });
            } catch (err) {
              console.warn(`[Release] Could not fetch comparison for ${repoKey} (${compKey}):`, err);
              summaryData.push({
                app: repoKey,
                path: repoPath,
                dbMigrations: null,
                hasChanges: null,
                changeCount: 0,
                currentRelease: compKey,
                headRelease: `v${headV}`,
                baseRelease: `v${baseV}`,
                commits: [],
              });
            }
          } else {
            // Repo doesn't have both releases
            const hasHead = !!headRelease;
            const hasBase = !!baseRelease;
            const status = !hasHead && !hasBase ? 'No releases' :
                          !hasHead ? `Only has v${baseV}` :
                          !hasBase ? `Only has v${headV}` : '';

            console.log(`[Release] ${repoKey} for ${compKey}: ${status}`);

            summaryData.push({
              app: repoKey,
              path: repoPath,
              dbMigrations: null,
              hasChanges: null,
              changeCount: 0,
              currentRelease: compKey,
              headRelease: `v${headV}`,
              baseRelease: `v${baseV}`,
              commits: [],
              missingReleases: status,
            });
          }
        }
      }

      console.log('[Release] Setting release summary with', summaryData.length, 'items');
      setReleaseSummary(summaryData);

      setCachedData(cacheKey, summaryData);
      console.log('[Release] Cached summary data');
    } catch (err) {
      console.error('[Release] Error fetching release summary:', err);
    } finally {
      setLoadingSummary(false);
    }
  };

  return (
    <div className={`min-h-screen p-8 ${darkMode ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' : 'bg-gradient-to-br from-gray-50 to-blue-50'}`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className={`text-4xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Release Comparisons</h1>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm ${
                  darkMode
                    ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                }`}
              >
                {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
              </button>
              <a
                href="https://grafana.prod-uswe2.credoai.net/d/b706faef-e10b-4f71-ac65-dfsdfsfwsf43q234/credoai-workloads"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span>CredoAI Workflows</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
          <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
            {releaseSummary.length > 0 ? (
              (() => {
                // Get unique release comparisons
                const uniqueReleases = [...new Set(releaseSummary
                  .filter(item => item.headRelease && item.baseRelease && item.headRelease !== 'N/A')
                  .map(item => `${item.headRelease}←${item.baseRelease}`)
                )];
                return uniqueReleases.length > 0
                  ? `Compare releases across all repositories (${uniqueReleases.join(' and ')})`
                  : 'Compare releases across all repositories';
              })()
            ) : (
              'Compare releases across all repositories'
            )}
          </p>
        </div>

        {/* Debug Info */}
        <div className={`rounded-lg p-4 mb-6 ${darkMode ? 'bg-yellow-900/20 border border-yellow-700/30' : 'bg-yellow-50 border border-yellow-200'}`}>
          <h3 className={`text-sm font-semibold mb-2 ${darkMode ? 'text-yellow-300' : 'text-yellow-800'}`}>Debug Info:</h3>
          <div className={`text-xs space-y-1 ${darkMode ? 'text-yellow-200' : 'text-yellow-700'}`}>
            <p>Available releases: {Object.keys(availableReleases).length} repos</p>
            <p>Release summary: {releaseSummary.length} items</p>
            <p>Loading summary: {loadingSummary ? 'Yes' : 'No'}</p>
            {releaseSummary.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer font-semibold">Show raw summary data</summary>
                <pre className={`mt-2 text-xs p-2 rounded overflow-auto max-h-40 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                  {JSON.stringify(releaseSummary, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>


        {/* Loading State */}
        {loadingSummary && releaseSummary.length === 0 && (
          <div className={`rounded-lg shadow-xl p-6 mb-6 ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 className={`w-10 h-10 animate-spin mx-auto mb-3 ${darkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>Loading release status overview...</p>
                <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Analyzing releases across all repositories</p>
              </div>
            </div>
          </div>
        )}

        {/* Release Summary Tables - Grouped by Release */}
        {releaseSummary.length > 0 && (() => {
          // Group by release comparison
          const groupedByRelease = {};
          releaseSummary.forEach(item => {
            // Handle old cached data that doesn't have headRelease/baseRelease
            let headRelease = item.headRelease;
            let baseRelease = item.baseRelease;

            if (!headRelease && !baseRelease && item.currentRelease && item.currentRelease !== 'N/A') {
              // Parse from currentRelease: "v24 ← v23"
              const parts = item.currentRelease.split(' ← ');
              if (parts.length === 2) {
                headRelease = parts[0];
                baseRelease = parts[1];
                // Update the item
                item.headRelease = headRelease;
                item.baseRelease = baseRelease;
              }
            }

            const key = `${headRelease || 'N/A'} ← ${baseRelease || 'N/A'}`;
            if (!groupedByRelease[key]) {
              groupedByRelease[key] = [];
            }
            groupedByRelease[key].push(item);
          });

          return Object.entries(groupedByRelease).map(([releaseKey, items]) => {
            // Get JIRA summary for this release (once per release, not per repo)
            const headVersion = items[0]?.headRelease || 'N/A';
            const allTickets = [];
            let combinedSummary = { byType: {}, byStatus: {} };

            // Find all fix versions that start with this release version
            Object.keys(jiraReleaseTickets).forEach(fixVersion => {
              if (fixVersion.startsWith(headVersion) || fixVersion === headVersion) {
                allTickets.push(...jiraReleaseTickets[fixVersion]);

                // Combine summaries
                const summary = jiraReleaseSummaries[fixVersion];
                if (summary) {
                  Object.entries(summary.byType).forEach(([type, count]) => {
                    combinedSummary.byType[type] = (combinedSummary.byType[type] || 0) + count;
                  });
                  Object.entries(summary.byStatus).forEach(([status, count]) => {
                    combinedSummary.byStatus[status] = (combinedSummary.byStatus[status] || 0) + count;
                  });
                }
              }
            });

            // Find tickets with no commits (alerts)
            const allCommitMessages = items.flatMap(item =>
              (item.commits || []).map(commit => commit.message)
            ).join(' ');

            const ticketsWithNoCommits = allTickets.filter(ticket => {
              // Check if this ticket key appears anywhere in the commit messages
              return !allCommitMessages.includes(ticket.key);
            });

            // Sort tickets: Bugs first (by priority), then Stories, then Tasks, then others
            const priorityOrder = { 'Highest': 0, 'High': 1, 'Medium': 2, 'Low': 3, 'Lowest': 4, 'None': 5 };
            const typeOrder = { 'Bug': 0, 'Story': 1, 'Task': 2, 'Epic': 3 };

            const sortedTickets = [...allTickets].sort((a, b) => {
              // First sort by type
              const typeA = typeOrder[a.issueType] ?? 99;
              const typeB = typeOrder[b.issueType] ?? 99;
              if (typeA !== typeB) return typeA - typeB;

              // Then sort by priority within the same type
              const priorityA = priorityOrder[a.priority] ?? 99;
              const priorityB = priorityOrder[b.priority] ?? 99;
              return priorityA - priorityB;
            });

            // Create breakdown data for charts
            const bugsByPriority = {};
            const ticketsByEngineer = {};
            let storyCount = 0;
            let taskCount = 0;
            let epicCount = 0;

            allTickets.forEach(ticket => {
              // Count by type
              if (ticket.issueType === 'Bug') {
                const priority = ticket.priority || 'None';
                bugsByPriority[priority] = (bugsByPriority[priority] || 0) + 1;
              } else if (ticket.issueType === 'Story') {
                storyCount++;
              } else if (ticket.issueType === 'Task') {
                taskCount++;
              } else if (ticket.issueType === 'Epic') {
                epicCount++;
              }

              // Count by engineer
              const engineer = ticket.assignee || 'Unassigned';
              ticketsByEngineer[engineer] = (ticketsByEngineer[engineer] || 0) + 1;
            });

            const chartData = [
              ...Object.entries(bugsByPriority).map(([priority, count]) => ({
                name: `${priority} Priority Bugs`,
                value: count,
                color: priority === 'Highest' ? '#7f1d1d' :
                       priority === 'High' ? '#dc2626' :
                       priority === 'Medium' ? '#f59e0b' :
                       priority === 'Low' ? '#fbbf24' :
                       '#ef4444'
              })),
              ...(storyCount > 0 ? [{ name: 'Stories', value: storyCount, color: '#3b82f6' }] : []),
              ...(taskCount > 0 ? [{ name: 'Tasks', value: taskCount, color: '#10b981' }] : []),
              ...(epicCount > 0 ? [{ name: 'Epics', value: epicCount, color: '#8b5cf6' }] : [])
            ];

            // Engineer breakdown data
            const engineerColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];
            const engineerChartData = Object.entries(ticketsByEngineer)
              .sort(([,a], [,b]) => b - a)
              .map(([engineer, count], index) => ({
                name: engineer,
                value: count,
                color: engineerColors[index % engineerColors.length]
              }));

            return (
            <div key={releaseKey} className={`rounded-lg shadow-xl p-6 mb-6 ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Release {headVersion}</h2>
                  {allTickets.length > 0 && (
                    <div className="space-y-2 mt-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setModalData({
                            app: 'All Repos',
                            path: releaseKey,
                            release: releaseKey,
                            commits: [],
                            changeCount: 0,
                            jiraTickets: allTickets,
                          })}
                          className="text-sm text-purple-400 hover:text-purple-300 font-semibold underline cursor-pointer"
                        >
                          {allTickets.length} JIRA ticket{allTickets.length !== 1 ? 's' : ''}
                        </button>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(combinedSummary.byType).map(([type, count]) => (
                            <span
                              key={type}
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                darkMode
                                  ? type === 'Bug' ? 'bg-red-900/50 text-red-300' :
                                    type === 'Story' ? 'bg-blue-900/50 text-blue-300' :
                                    type === 'Epic' ? 'bg-purple-900/50 text-purple-300' :
                                    type === 'Task' ? 'bg-green-900/50 text-green-300' :
                                    'bg-gray-700 text-gray-300'
                                  : type === 'Bug' ? 'bg-red-100 text-red-700' :
                                    type === 'Story' ? 'bg-blue-100 text-blue-700' :
                                    type === 'Epic' ? 'bg-purple-100 text-purple-700' :
                                    type === 'Task' ? 'bg-green-100 text-green-700' :
                                    'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {count} {type}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={fetchReleaseSummary}
                  disabled={loadingSummary}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors disabled:cursor-not-allowed flex items-center gap-2 ${
                    darkMode
                      ? 'bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:bg-gray-800'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:bg-gray-50'
                  }`}
                >
                  {loadingSummary ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    '↻ Refresh'
                  )}
                </button>
              </div>

              {/* Ticket Type Breakdown Chart */}
              {chartData.length > 0 && (
                <div className={`rounded-lg p-4 mb-6 ${darkMode ? 'bg-gray-900/50 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
                  <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Ticket Type Breakdown</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={chartData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={darkMode ? { backgroundColor: '#374151', border: '1px solid #6b7280', color: '#f3f4f6' } : { backgroundColor: '#fff', border: '1px solid #e5e7eb', color: '#1f2937' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1 flex flex-col justify-center">
                      {chartData.map((entry, index) => (
                        <div
                          key={index}
                          className={`flex items-center justify-between p-2 rounded ${darkMode ? 'bg-gray-800' : 'bg-white border border-gray-200'}`}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded"
                              style={{ backgroundColor: entry.color }}
                            ></div>
                            <span className={`font-medium text-xs ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{entry.name}</span>
                          </div>
                          <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {entry.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* JIRA Tickets List */}
              {sortedTickets.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>JIRA Tickets in this Release</h3>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Filter by engineer:</span>
                      <select
                        value={selectedEngineerFilter[releaseKey] || 'all'}
                        onChange={(e) => setSelectedEngineerFilter(prev => ({
                          ...prev,
                          [releaseKey]: e.target.value
                        }))}
                        className={`text-xs border rounded px-2 py-1 ${
                          darkMode
                            ? 'bg-gray-700 border-gray-600 text-gray-200'
                            : 'bg-white border-gray-300 text-gray-900'
                        }`}
                      >
                        <option value="all">All Engineers</option>
                        {engineerChartData.map(eng => (
                          <option key={eng.name} value={eng.name}>{eng.name} ({eng.value})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {sortedTickets
                      .filter(ticket => {
                        const filter = selectedEngineerFilter[releaseKey];
                        if (!filter || filter === 'all') return true;
                        return ticket.assignee === filter;
                      })
                      .map((ticket, idx) => {
                      const jiraUrl = import.meta.env.VITE_JIRA_URL;
                      const ticketUrl = jiraUrl ? `${jiraUrl.replace(/\/$/, '')}/browse/${ticket.key}` : null;
                      const hasCommit = allCommitMessages.includes(ticket.key);

                      return (
                        <div key={idx} className={`p-3 rounded-lg border transition-colors ${
                          darkMode
                            ? 'bg-purple-900/20 border-purple-700/50 hover:border-purple-600'
                            : 'bg-purple-50 border-purple-200 hover:border-purple-300'
                        }`}>
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-1">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                darkMode
                                  ? ticket.issueType === 'Bug' ? 'bg-red-900/50 text-red-300 border border-red-700' :
                                    ticket.issueType === 'Story' ? 'bg-blue-900/50 text-blue-300 border border-blue-700' :
                                    ticket.issueType === 'Epic' ? 'bg-purple-900/50 text-purple-300 border border-purple-700' :
                                    ticket.issueType === 'Task' ? 'bg-green-900/50 text-green-300 border border-green-700' :
                                    'bg-gray-700 text-gray-300 border border-gray-600'
                                  : ticket.issueType === 'Bug' ? 'bg-red-100 text-red-800' :
                                    ticket.issueType === 'Story' ? 'bg-blue-100 text-blue-800' :
                                    ticket.issueType === 'Epic' ? 'bg-purple-100 text-purple-800' :
                                    ticket.issueType === 'Task' ? 'bg-green-100 text-green-800' :
                                    'bg-gray-100 text-gray-800'
                              }`}>
                                {ticket.issueType}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-2">
                                {ticketUrl ? (
                                  <a
                                    href={ticketUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`text-sm font-semibold ${darkMode ? 'text-purple-400 hover:text-purple-300' : 'text-purple-600 hover:text-purple-800'}`}
                                  >
                                    {ticket.key}: {ticket.summary}
                                  </a>
                                ) : (
                                  <div className={`text-sm font-semibold ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                                    {ticket.key}: {ticket.summary}
                                  </div>
                                )}
                                {!hasCommit && (
                                  <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                    darkMode ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-800' : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    ⚠️ No commits
                                  </span>
                                )}
                              </div>
                              <div className={`flex items-center gap-3 text-xs mt-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium ${
                                  darkMode
                                    ? ticket.status === 'Done' || ticket.status === 'Closed' || ticket.status === 'Closed Verified' ? 'bg-green-900/50 text-green-300 border border-green-700' :
                                      ticket.status === 'In Progress' || ticket.status === 'Dev complete' || ticket.status === 'In Review' ? 'bg-yellow-900/50 text-yellow-300 border border-yellow-700' :
                                      'bg-gray-700 text-gray-300 border border-gray-600'
                                    : ticket.status === 'Done' || ticket.status === 'Closed' || ticket.status === 'Closed Verified' ? 'bg-green-100 text-green-800' :
                                      ticket.status === 'In Progress' || ticket.status === 'Dev complete' || ticket.status === 'In Review' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-gray-100 text-gray-800'
                                }`}>
                                  {ticket.status}
                                </span>
                                <span>👤 {ticket.assignee}</span>
                                {ticket.storyPoints && <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium border ${
                                  darkMode ? 'bg-blue-900/50 text-blue-300 border-blue-700' : 'bg-blue-50 text-blue-700 border-blue-200'
                                }`}>
                                  📊 {ticket.storyPoints} pts
                                </span>}
                                {ticket.priority && <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium border ${
                                  darkMode
                                    ? ticket.priority === 'High' || ticket.priority === 'Highest' ? 'bg-red-900/50 text-red-300 border-red-700' :
                                      ticket.priority === 'Medium' ? 'bg-yellow-900/50 text-yellow-300 border-yellow-700' :
                                      'bg-gray-700 text-gray-300 border-gray-600'
                                    : ticket.priority === 'High' || ticket.priority === 'Highest' ? 'bg-red-50 text-red-700 border-red-200' :
                                      ticket.priority === 'Medium' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                      'bg-gray-50 text-gray-700 border-gray-200'
                                }`}>
                                  {ticket.priority}
                                </span>}
                                <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium border ${
                                  darkMode
                                    ? ticket.featureFlag ? 'bg-indigo-900/50 text-indigo-300 border-indigo-700' : 'bg-gray-700 text-gray-400 border-gray-600'
                                    : ticket.featureFlag ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-gray-50 text-gray-600 border-gray-200'
                                }`}>
                                  🚩 {ticket.featureFlag || 'N/A'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <h3 className={`text-lg font-semibold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>GitHub Changes by Repository</h3>
              <div className="overflow-x-auto">
                <table className={`min-w-full divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                  <thead className={darkMode ? 'bg-gray-900/50' : 'bg-gray-50'}>
                    <tr>
                      <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>App</th>
                      <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>DB Migration</th>
                      <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Changes</th>
                      <th className={`px-6 py-3 text-center text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Expand</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${darkMode ? 'bg-gray-800/50 divide-gray-700' : 'bg-white divide-gray-200'}`}>
                    {items.map((item, index) => {
                      const rowKey = `${releaseKey}-${item.app}`;
                      const isExpanded = expandedRows[rowKey];

                      return (
                        <React.Fragment key={index}>
                          <tr className={darkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>{item.app}</div>
                              <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{item.path}</div>
                            </td>
                            <td className="px-6 py-4">
                              {item.app === 'credo-backend' ? (
                                item.dbMigrations && item.dbMigrations.length > 0 ? (
                                  <div className="space-y-1">
                                    {item.dbMigrations.map((migration, idx) => (
                                      <div key={idx} className="flex items-start gap-2">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                          ⚠️ Yes
                                        </span>
                                        <a
                                          href={migration.pr.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className={`text-xs underline ${darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'}`}
                                        >
                                          PR #{migration.pr.number}
                                        </a>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    ✓ No
                                  </span>
                                )
                              ) : (
                                <span className="text-gray-400 text-sm">N/A</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {item.missingReleases ? (
                                <span className={`text-xs italic ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{item.missingReleases}</span>
                              ) : item.hasChanges === true ? (
                                <button
                                  onClick={() => setModalData({
                                    app: item.app,
                                    path: item.path,
                                    release: `${item.headRelease} ← ${item.baseRelease}`,
                                    commits: item.commits || [],
                                    changeCount: item.changeCount,
                                  })}
                                  className={`text-xs font-semibold underline cursor-pointer ${darkMode ? 'text-green-400 hover:text-green-300' : 'text-green-600 hover:text-green-800'}`}
                                >
                                  {item.changeCount} changes
                                </button>
                              ) : item.hasChanges === false ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                  No changes
                                </span>
                              ) : (
                                <span className="text-gray-400 text-sm">?</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              {item.commits && item.commits.length > 0 && (
                                <button
                                  onClick={() => setExpandedRows(prev => ({ ...prev, [rowKey]: !prev[rowKey] }))}
                                  className={`font-medium text-sm ${darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'}`}
                                >
                                  {isExpanded ? '▼ Hide' : '▶ Show'}
                                </button>
                              )}
                            </td>
                          </tr>
                          {isExpanded && item.commits && item.commits.length > 0 && (
                            <tr>
                              <td colSpan="4" className={`px-6 py-4 ${darkMode ? 'bg-gray-900/70' : 'bg-gray-50'}`}>
                                <div className="space-y-2">
                                  <h4 className={`font-semibold text-sm mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Commits ({item.commits.length}):</h4>
                                  {item.commits.map((commit, commitIdx) => (
                                    <div key={commitIdx} className={`flex items-start gap-3 p-3 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                                      <code className={`text-xs font-mono mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{commit.sha}</code>
                                      <div className="flex-1 min-w-0">
                                        <p className={`text-sm ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>{renderMessageWithJiraLinks(commit.message)}</p>
                                        <div className={`flex items-center gap-3 mt-1 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                          <span>{commit.author}</span>
                                          <span>{new Date(commit.date).toLocaleDateString()}</span>
                                          {commit.pr && (
                                            <a
                                              href={commit.pr.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className={`font-medium ${darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'}`}
                                            >
                                              PR #{commit.pr.number}
                                            </a>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )});
        })()}

        {/* Empty State */}
        {!loadingSummary && releaseSummary.length === 0 && Object.keys(availableReleases).length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="text-center py-8 text-gray-500">
              <p>No release comparisons available</p>
            </div>
          </div>
        )}

        {/* Changes Modal */}
        {modalData && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setModalData(null)}
          >
            <div
              className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">{modalData.app}</h2>
                    <p className="text-blue-100 mt-1">
                      {modalData.path} • {modalData.release}
                    </p>
                    <p className="text-blue-100 text-sm mt-1">
                      {modalData.changeCount} {modalData.changeCount === 1 ? 'commit' : 'commits'}
                    </p>
                  </div>
                  <button
                    onClick={() => setModalData(null)}
                    className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
                {/* JIRA Tickets Section */}
                {modalData.jiraTickets && modalData.jiraTickets.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      JIRA Tickets ({modalData.jiraTickets.length})
                    </h3>
                    <div className="space-y-2">
                      {modalData.jiraTickets.map((ticket, idx) => {
                        const jiraUrl = import.meta.env.VITE_JIRA_URL;
                        const ticketUrl = jiraUrl ? `${jiraUrl.replace(/\/$/, '')}/browse/${ticket.key}` : null;

                        return (
                          <div key={idx} className="p-4 bg-purple-50 rounded-lg border border-purple-200 hover:border-purple-300 transition-colors">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 mt-1">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  ticket.issueType === 'Bug' ? 'bg-red-100 text-red-800' :
                                  ticket.issueType === 'Story' ? 'bg-blue-100 text-blue-800' :
                                  ticket.issueType === 'Epic' ? 'bg-purple-100 text-purple-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {ticket.issueType}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                {ticketUrl ? (
                                  <a
                                    href={ticketUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-semibold text-purple-600 hover:text-purple-800 block mb-1"
                                  >
                                    {ticket.key}: {ticket.summary}
                                  </a>
                                ) : (
                                  <div className="text-sm font-semibold text-purple-600 mb-1">
                                    {ticket.key}: {ticket.summary}
                                  </div>
                                )}
                                <div className="flex items-center gap-3 text-xs text-gray-600 mt-2">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium ${
                                    ticket.status === 'Done' || ticket.status === 'Closed' || ticket.status === 'Closed Verified' ? 'bg-green-100 text-green-800' :
                                    ticket.status === 'In Progress' || ticket.status === 'Dev complete' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {ticket.status}
                                  </span>
                                  <span>👤 {ticket.assignee}</span>
                                  {ticket.storyPoints && <span className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                    📊 {ticket.storyPoints} pts
                                  </span>}
                                  {ticket.priority && <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                    ticket.priority === 'High' || ticket.priority === 'Highest' ? 'bg-red-50 text-red-700' :
                                    ticket.priority === 'Medium' ? 'bg-yellow-50 text-yellow-700' :
                                    'bg-gray-50 text-gray-700'
                                  }`}>
                                    {ticket.priority}
                                  </span>}
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                    ticket.featureFlag ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-gray-50 text-gray-600 border border-gray-200'
                                  }`}>
                                    🚩 {ticket.featureFlag || 'N/A'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Commits Section */}
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Commits ({modalData.commits.length})
                </h3>
                {modalData.commits.length > 0 ? (
                  <div className="space-y-3">
                    {modalData.commits.map((commit, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors">
                        <code className="text-xs text-gray-500 font-mono mt-0.5 flex-shrink-0">{commit.sha}</code>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 font-medium">{renderMessageWithJiraLinks(commit.message)}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                              </svg>
                              {commit.author}
                            </span>
                            <span className="flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                              </svg>
                              {new Date(commit.date).toLocaleDateString()}
                            </span>
                            {commit.pr && (
                              <a
                                href={commit.pr.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                              >
                                <GitPullRequest className="w-3 h-3" />
                                PR #{commit.pr.number}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">No commits available</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReleaseComparison;
