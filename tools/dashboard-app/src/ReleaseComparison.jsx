import React, { useState, useEffect } from 'react';
import { GitPullRequest, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import GitHubAPI from './services/githubApi';

const ReleaseComparison = () => {
  const [availableReleases, setAvailableReleases] = useState([]);
  const [releaseSummary, setReleaseSummary] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [modalData, setModalData] = useState(null);

  useEffect(() => {
    fetchAvailableReleases();
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-4xl font-bold text-gray-900">Release Comparisons</h1>
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
          <p className="text-gray-600">
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
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">Debug Info:</h3>
          <div className="text-xs text-yellow-700 space-y-1">
            <p>Available releases: {Object.keys(availableReleases).length} repos</p>
            <p>Release summary: {releaseSummary.length} items</p>
            <p>Loading summary: {loadingSummary ? 'Yes' : 'No'}</p>
            {releaseSummary.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer font-semibold">Show raw summary data</summary>
                <pre className="mt-2 text-xs bg-white p-2 rounded overflow-auto max-h-40">
                  {JSON.stringify(releaseSummary, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>

        {/* Commit Type Distribution Chart */}
        {releaseSummary.length > 0 && (() => {
          // Collect all commits across all releases
          const allCommits = releaseSummary
            .filter(item => item.commits && item.commits.length > 0)
            .flatMap(item => item.commits);

          if (allCommits.length === 0) return null;

          const typeStats = getCommitTypeStats(allCommits);

          const COLORS = {
            feat: '#10b981',      // green
            fix: '#ef4444',       // red
            chore: '#6366f1',     // indigo
            docs: '#3b82f6',      // blue
            refactor: '#f59e0b',  // amber
            test: '#8b5cf6',      // violet
            style: '#ec4899',     // pink
            perf: '#14b8a6',      // teal
            ci: '#06b6d4',        // cyan
            build: '#84cc16',     // lime
            other: '#6b7280',     // gray
          };

          return (
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Commit Types Distribution ({allCommits.length} total commits)
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={typeStats}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        onClick={(data) => {
                          const org = import.meta.env.VITE_GITHUB_ORG;
                          let searchQuery;
                          if (data.type === 'other') {
                            // Exclude all known prefixes to show "other"
                            searchQuery = `org:${org} is:pr NOT "feat:" NOT "fix:" NOT "chore:" NOT "docs:" NOT "refactor:" NOT "test:" NOT "style:" NOT "perf:" NOT "ci:" NOT "build:"`;
                          } else {
                            searchQuery = `org:${org} is:pr in:title "${data.type}:"`;
                          }
                          const url = `https://github.com/search?q=${encodeURIComponent(searchQuery)}&type=pullrequests`;
                          window.open(url, '_blank');
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {typeStats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[entry.type]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {typeStats.map((stat) => {
                    const org = import.meta.env.VITE_GITHUB_ORG;
                    let searchQuery;
                    if (stat.type === 'other') {
                      // Exclude all known prefixes to show "other"
                      searchQuery = `org:${org} is:pr NOT "feat:" NOT "fix:" NOT "chore:" NOT "docs:" NOT "refactor:" NOT "test:" NOT "style:" NOT "perf:" NOT "ci:" NOT "build:"`;
                    } else {
                      searchQuery = `org:${org} is:pr in:title "${stat.type}:"`;
                    }
                    const url = `https://github.com/search?q=${encodeURIComponent(searchQuery)}&type=pullrequests`;

                    return (
                      <a
                        key={stat.type}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: COLORS[stat.type] }}
                          ></div>
                          <span className="font-medium text-sm">{stat.name}</span>
                        </div>
                        <span className="text-sm text-gray-600">
                          {stat.value} ({((stat.value / allCommits.length) * 100).toFixed(1)}%)
                        </span>
                      </a>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Loading State */}
        {loadingSummary && releaseSummary.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-3" />
                <p className="text-gray-600">Loading release status overview...</p>
                <p className="text-gray-500 text-sm mt-1">Analyzing releases across all repositories</p>
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

          return Object.entries(groupedByRelease).map(([releaseKey, items]) => (
            <div key={releaseKey} className="bg-white rounded-lg shadow-md p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">{releaseKey}</h2>
                <button
                  onClick={fetchReleaseSummary}
                  disabled={loadingSummary}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:bg-gray-50 disabled:cursor-not-allowed flex items-center gap-2"
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
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">App</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DB Migration</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Changes</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Expand</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {items.map((item, index) => {
                      const rowKey = `${releaseKey}-${item.app}`;
                      const isExpanded = expandedRows[rowKey];

                      return (
                        <React.Fragment key={index}>
                          <tr className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{item.app}</div>
                              <div className="text-xs text-gray-500">{item.path}</div>
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
                                          className="text-xs text-blue-600 hover:text-blue-800 underline"
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
                                <span className="text-xs text-gray-500 italic">{item.missingReleases}</span>
                              ) : item.hasChanges === true ? (
                                <button
                                  onClick={() => setModalData({
                                    app: item.app,
                                    path: item.path,
                                    release: `${item.headRelease} ← ${item.baseRelease}`,
                                    commits: item.commits || [],
                                    changeCount: item.changeCount,
                                  })}
                                  className="text-xs text-green-600 hover:text-green-800 font-semibold underline cursor-pointer"
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
                                  className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                                >
                                  {isExpanded ? '▼ Hide' : '▶ Show'}
                                </button>
                              )}
                            </td>
                          </tr>
                          {isExpanded && item.commits && item.commits.length > 0 && (
                            <tr>
                              <td colSpan="4" className="px-6 py-4 bg-gray-50">
                                <div className="space-y-2">
                                  <h4 className="font-semibold text-sm text-gray-700 mb-3">Commits ({item.commits.length}):</h4>
                                  {item.commits.map((commit, commitIdx) => (
                                    <div key={commitIdx} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                                      <code className="text-xs text-gray-500 font-mono mt-0.5">{commit.sha}</code>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-900">{renderMessageWithJiraLinks(commit.message)}</p>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                          <span>{commit.author}</span>
                                          <span>{new Date(commit.date).toLocaleDateString()}</span>
                                          {commit.pr && (
                                            <a
                                              href={commit.pr.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:text-blue-800 font-medium"
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
          ));
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
