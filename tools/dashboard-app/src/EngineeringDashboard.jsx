import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Calendar, GitPullRequest, Clock, Users, TrendingUp, Activity, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import GitHubAPI from './services/githubApi';

const EngineeringDashboard = () => {
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [timeRange, setTimeRange] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedContributor, setSelectedContributor] = useState(null);
  const [selectedWeeklyContributor, setSelectedWeeklyContributor] = useState('all');
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0, repo: '' });
  const [usingCache, setUsingCache] = useState(false);
  const [releaseData, setReleaseData] = useState([]);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [expandedRelease, setExpandedRelease] = useState(null);
  const [data, setData] = useState({
    contributors: [],
    repositories: [],
    weeklyData: [],
    prSizeDistribution: [],
    reviewTimeData: [],
    recentPRsByRepo: {},
    projectWorkData: [],
    epicWorkData: [],
  });

  useEffect(() => {
    fetchGitHubData();
  }, [timeRange]);

  const getCacheKey = (org, repos, timeRange) => {
    const reposKey = repos?.join(',') || 'all';
    return `github_metrics_${org}_${reposKey}_${timeRange}`;
  };

  const getCachedData = (cacheKey) => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      const now = Date.now();
      const TEN_MINUTES = 10 * 60 * 1000;

      // Check if cache is still valid (less than 10 minutes old)
      if (now - timestamp < TEN_MINUTES) {
        console.log('Using cached data (age:', Math.round((now - timestamp) / 1000), 'seconds)');
        return data;
      }

      // Cache expired, remove it
      localStorage.removeItem(cacheKey);
      return null;
    } catch (error) {
      console.error('Error reading cache:', error);
      return null;
    }
  };

  const setCachedData = (cacheKey, data) => {
    try {
      const cacheEntry = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
    } catch (error) {
      console.error('Error writing cache:', error);
    }
  };

  const fetchAvailableReleases = async () => {
    console.log('[Release] Fetching available releases...');

    // Check cache first
    const cacheKey = `available_releases_${import.meta.env.VITE_GITHUB_ORG}`;
    const cachedData = getCachedData(cacheKey);

    if (cachedData) {
      console.log('[Release] Using cached releases data');
      setAvailableReleases(cachedData.releasesMap);
      if (cachedData.selectedRepo) {
        setSelectedRepo(cachedData.selectedRepo);
        setSelectedHeadRelease(cachedData.selectedHeadRelease);
        setSelectedBaseRelease(cachedData.selectedBaseRelease);
      }
      return;
    }

    try {
      const token = import.meta.env.VITE_GITHUB_TOKEN;
      const org = import.meta.env.VITE_GITHUB_ORG;
      const repos = import.meta.env.VITE_GITHUB_REPOS?.split(',').filter(Boolean);

      console.log('[Release] Config:', { org, hasToken: !!token, repos });

      if (!token || !org) {
        throw new Error('Missing GitHub configuration.');
      }

      const githubApi = new GitHubAPI(token, org);

      // Fetch releases for each repo
      const reposToCheck = repos && repos.length > 0 ? repos : await githubApi.getRecentRepositories();
      console.log('[Release] Repos to check:', reposToCheck);

      const releasesMap = {};

      for (const repo of reposToCheck) {
        try {
          console.log(`[Release] Fetching releases for ${repo}...`);
          const releases = await githubApi.getReleaseBranches(repo);
          console.log(`[Release] Found ${releases.length} releases for ${repo}:`, releases.map(r => r.name));
          if (releases.length > 0) {
            releasesMap[repo] = releases;
          }
        } catch (err) {
          console.error(`[Release] Error fetching releases for ${repo}:`, err);
        }
      }

      console.log('[Release] Final releases map:', releasesMap);
      setAvailableReleases(releasesMap);

      // Auto-select repo with the most recent release
      let latestRepo = null;
      let latestReleaseDate = null;

      for (const [repo, releases] of Object.entries(releasesMap)) {
        if (releases.length >= 2) {
          // Sort by commit date to get the truly latest
          const sortedByDate = [...releases].sort((a, b) =>
            new Date(b.committedDate) - new Date(a.committedDate)
          );
          const recentDate = new Date(sortedByDate[0].committedDate);

          if (!latestReleaseDate || recentDate > latestReleaseDate) {
            latestReleaseDate = recentDate;
            latestRepo = repo;
          }
        }
      }

      if (latestRepo) {
        console.log(`[Release] Auto-selecting ${latestRepo} with latest release from ${latestReleaseDate}`);
        setSelectedRepo(latestRepo);
        // Sort by date to get latest two releases
        const releases = [...releasesMap[latestRepo]].sort((a, b) =>
          new Date(b.committedDate) - new Date(a.committedDate)
        );
        const headRelease = releases[0].name;
        const baseRelease = releases[1].name;
        setSelectedHeadRelease(headRelease);
        setSelectedBaseRelease(baseRelease);

        // Cache the releases data
        const cacheKey = `available_releases_${import.meta.env.VITE_GITHUB_ORG}`;
        setCachedData(cacheKey, {
          releasesMap,
          selectedRepo: latestRepo,
          selectedHeadRelease: headRelease,
          selectedBaseRelease: baseRelease,
        });
        console.log('[Release] Cached releases data');
      }
    } catch (err) {
      console.error('Error fetching available releases:', err);
    }
  };

  const detectDbMigration = (commits) => {
    // Check for data migration patterns (alembic, SQL migrations)
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

  const fetchReleaseSummary = async () => {
    console.log('[Release] Fetching release summary...');

    // Check cache first
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

      // Define the repos we want to track with their display names
      const repoMapping = {
        'credo-ui': 'credoai/ui',
        'credo-backend': 'credoai/server',
        'credoai-integration-service': 'credoai/integration',
        'policy-packs': 'credoai/assets',
        'credoai-gaia': 'credoai/gaia',
      };

      console.log('[Release] Available releases for summary:', availableReleases);

      const summaryData = [];

      for (const [repoKey, repoPath] of Object.entries(repoMapping)) {
        const releases = availableReleases[repoKey] || [];

        // Compare v25 → v24 and v24 → v23 (if available)
        const comparisons = [];
        for (let i = 0; i < releases.length - 1 && i < 2; i++) {
          comparisons.push({ head: releases[i], base: releases[i + 1] });
        }

        if (comparisons.length > 0) {
          for (const { head, base } of comparisons) {
            try {
              const comparison = await githubApi.compareReleaseBranches(
                repoKey,
                base.name,
                head.name
              );

              const commits = comparison.commits || [];

              // Only check for DB migrations in backend repo
              const dbMigrations = repoKey === 'credo-backend'
                ? detectDbMigration(commits)
                : null;

              summaryData.push({
                app: repoKey,
                path: repoPath,
                dbMigrations: dbMigrations,
                hasChanges: commits.length > 0,
                changeCount: commits.length,
                currentRelease: `${head.name.replace('release/v', 'v')} ← ${base.name.replace('release/v', 'v')}`,
              });
            } catch (err) {
              console.warn(`Could not fetch comparison for ${repoKey} (${head.name} ← ${base.name}):`, err);
              summaryData.push({
                app: repoKey,
                path: repoPath,
                dbMigrations: null,
                hasChanges: null,
                changeCount: 0,
                currentRelease: `${head.name.replace('release/v', 'v')} ← ${base.name.replace('release/v', 'v')}`,
              });
            }
          }
        } else {
          summaryData.push({
            app: repoKey,
            path: repoPath,
            dbMigrations: null,
            hasChanges: null,
            changeCount: 0,
            currentRelease: 'N/A',
          });
        }
      }

      console.log('[Release] Setting release summary with', summaryData.length, 'items:', summaryData);
      setReleaseSummary(summaryData);

      // Cache the summary data
      const cacheKey = `release_summary_${import.meta.env.VITE_GITHUB_ORG}`;
      setCachedData(cacheKey, summaryData);
      console.log('[Release] Cached summary data');
    } catch (err) {
      console.error('Error fetching release summary:', err);
    } finally {
      setLoadingSummary(false);
    }
  };

  const fetchReleaseComparisons = async () => {
    setLoadingReleases(true);
    try {
      const token = import.meta.env.VITE_GITHUB_TOKEN;
      const org = import.meta.env.VITE_GITHUB_ORG;
      const repos = import.meta.env.VITE_GITHUB_REPOS?.split(',').filter(Boolean);

      if (!token || !org) {
        throw new Error('Missing GitHub configuration.');
      }

      const githubApi = new GitHubAPI(token, org);

      // If specific releases are selected, compare those
      if (selectedRepo && selectedBaseRelease && selectedHeadRelease) {
        const comparison = await githubApi.compareReleaseBranches(
          selectedRepo,
          selectedBaseRelease,
          selectedHeadRelease,
          true // Fetch PR details for detailed view
        );
        const commits = comparison.commits || [];
        setReleaseData([{
          repo: selectedRepo,
          currentVersion: selectedHeadRelease.replace('release/v', ''),
          previousVersion: selectedBaseRelease.replace('release/v', ''),
          changeCount: commits.length,
          changes: commits.slice(0, 10),
        }]);
      } else {
        // Fall back to sequential comparisons
        const comparisons = await githubApi.getReleaseComparisons(repos);
        setReleaseData(comparisons);
      }
    } catch (err) {
      console.error('Error fetching release comparisons:', err);
    } finally {
      setLoadingReleases(false);
    }
  };

  const fetchGitHubData = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = import.meta.env.VITE_GITHUB_TOKEN;
      const org = import.meta.env.VITE_GITHUB_ORG;
      const repos = import.meta.env.VITE_GITHUB_REPOS?.split(',').filter(Boolean);

      if (!token || !org) {
        throw new Error('Missing GitHub configuration. Please set VITE_GITHUB_TOKEN and VITE_GITHUB_ORG in your .env.local file.');
      }

      // Check cache first
      const cacheKey = getCacheKey(org, repos, timeRange);
      const cachedData = getCachedData(cacheKey);

      if (cachedData) {
        setData(cachedData);
        setUsingCache(true);
        setLoading(false);
        return;
      }

      setUsingCache(false);

      const githubApi = new GitHubAPI(token, org);

      // Convert timeRange to days
      const daysMap = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
      const days = daysMap[timeRange] || 30;

      const metrics = await githubApi.getEngineeringMetrics(repos, days, (progress) => {
        setLoadingProgress(progress);
      });

      const newData = {
        contributors: metrics.contributors,
        repositories: metrics.repositories,
        weeklyData: metrics.weeklyData,
        prSizeDistribution: metrics.prSizeDistribution,
        reviewTimeData: metrics.reviewTimeData,
        recentPRsByRepo: metrics.recentPRsByRepo,
        projectWorkData: metrics.projectWorkData,
        epicWorkData: metrics.epicWorkData,
      };

      setData(newData);
      setCachedData(cacheKey, newData);
    } catch (err) {
      console.error('Error fetching GitHub data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const prData = data.contributors;

  // Filter weekly data by selected contributor
  const getWeeklyPRs = () => {
    if (selectedWeeklyContributor === 'all') {
      return data.weeklyData;
    }

    const contributor = data.contributors.find(c => c.author === selectedWeeklyContributor);
    if (!contributor || !contributor.weeklyData) {
      return [];
    }

    // Convert contributor's weekly data to the same format as overall weekly data
    return Object.entries(contributor.weeklyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8) // Last 8 weeks
      .map(([week, weekData]) => {
        // Format the week label
        const date = new Date(week);
        const month = date.toLocaleDateString('en-US', { month: 'short' });
        const day = date.getDate();
        return {
          week: `${month} ${day}`,
          prs: weekData.created,
          merged: weekData.merged,
          closed: weekData.closed,
        };
      });
  };

  const weeklyPRs = getWeeklyPRs();
  const prSizeDistribution = data.prSizeDistribution;
  const reviewTimeData = data.reviewTimeData;
  const repositoryStats = data.repositories;

  const totalPRs = prData.reduce((sum, author) => sum + author.count, 0);
  const avgReviewTime = totalPRs > 0
    ? (prData.reduce((sum, author) => sum + author.avgReviewTime * author.count, 0) / totalPRs).toFixed(1)
    : 0;
  const totalRepos = repositoryStats.length;
  const openPRs = repositoryStats.reduce((sum, repo) => sum + repo.openPRs, 0);

  const StatCard = ({ title, value, subtitle, icon: Icon, trend, color = "blue" }) => (
    <div className="bg-white rounded-lg shadow-md p-6 border-l-4" style={{ borderColor: color }}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
          {trend && (
            <div className={`flex items-center mt-2 text-sm ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
              <TrendingUp className="w-4 h-4 mr-1" />
              {trend > 0 ? '+' : ''}{trend}% vs last period
            </div>
          )}
        </div>
        {Icon && (
          <div className="p-3 rounded-lg" style={{ backgroundColor: `${color}20` }}>
            <Icon className="w-6 h-6" style={{ color }} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Engineering Dashboard</h1>
            <p className="text-gray-600">Team productivity and code review analytics</p>
          </div>
          <a
            href="/release.html"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <GitPullRequest className="w-5 h-5" />
            <span>Go to Release Comparisons</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>

      {/* Dashboard Content */}
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6 flex gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Team</label>
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Teams</option>
            <option value="backend">Backend</option>
            <option value="frontend">Frontend</option>
            <option value="platform">Platform</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Time Range</label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
          </select>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
          >
            Clear Cache & Refresh
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center max-w-md w-full px-4">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
            <p className="text-gray-600 text-lg mb-2">Fetching data from GitHub...</p>
            {loadingProgress.total > 0 && (
              <>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${(loadingProgress.current / loadingProgress.total) * 100}%` }}
                  ></div>
                </div>
                <p className="text-gray-500 text-sm">
                  Processing repository {loadingProgress.current} of {loadingProgress.total}
                  {loadingProgress.repo && (
                    <span className="block text-blue-600 font-medium mt-1">{loadingProgress.repo}</span>
                  )}
                </p>
              </>
            )}
            <p className="text-gray-500 text-xs mt-2">Using GraphQL for optimized fetching</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-6 mb-6 rounded-lg">
          <div className="flex items-start">
            <AlertCircle className="w-6 h-6 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-red-800 font-semibold mb-2">Error Loading Data</h3>
              <p className="text-red-700 mb-3">{error}</p>
              <button
                onClick={fetchGitHubData}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Content - Only show when not loading and no error */}
      {!loading && !error && (
        <>
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <StatCard
          title="Total Pull Requests"
          value={totalPRs.toLocaleString()}
          subtitle="Across all repositories"
          icon={GitPullRequest}
          color="#3b82f6"
        />
        <StatCard
          title="Avg Review Time"
          value={`${avgReviewTime}h`}
          subtitle="Time to first review"
          icon={Clock}
          color="#10b981"
        />
        <StatCard
          title="Active Repositories"
          value={totalRepos}
          subtitle={`${openPRs} open PRs`}
          icon={Activity}
          color="#f59e0b"
        />
        <StatCard
          title="Team Members"
          value={prData.length}
          subtitle="Contributing developers (bots excluded)"
          icon={Users}
          color="#8b5cf6"
        />
      </div>

      {/* PR Activity Over Time */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Weekly PR Activity</h2>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Contributor:</label>
            <select
              value={selectedWeeklyContributor}
              onChange={(e) => setSelectedWeeklyContributor(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Contributors</option>
              {prData.map((contributor, index) => (
                <option key={index} value={contributor.author}>
                  {contributor.author}
                </option>
              ))}
            </select>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={weeklyPRs}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="week" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="prs" stroke="#3b82f6" strokeWidth={2} name="Created" />
            <Line type="monotone" dataKey="merged" stroke="#10b981" strokeWidth={2} name="Merged" />
            <Line type="monotone" dataKey="closed" stroke="#ef4444" strokeWidth={2} name="Closed" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* PR Statistics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* PR Size Distribution */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">PR Size Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={prSizeDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {prSizeDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {prSizeDistribution.map((item, index) => (
              <div key={index} className="flex items-center">
                <div className="w-3 h-3 rounded mr-2" style={{ backgroundColor: item.color }}></div>
                <span>{item.name}: {item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Review Time Distribution */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Review Time Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={reviewTimeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timeRange" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Contributors */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Top Contributors</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Developer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PRs</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Size</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Review Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {prData.map((author, index) => (
                <tr
                  key={index}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedContributor(author)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {author.avatarUrl ? (
                        <img
                          src={author.avatarUrl}
                          alt={author.author}
                          className="flex-shrink-0 h-10 w-10 rounded-full"
                        />
                      ) : (
                        <div className="flex-shrink-0 h-10 w-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                          {author.author.split(' ').map(n => n[0]).join('')}
                        </div>
                      )}
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{author.author}</div>
                        <div className="text-xs text-gray-500">Click to view PRs</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 font-semibold">{author.count}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{author.avgSize} lines</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm font-medium ${author.avgReviewTime < 3 ? 'text-green-600' : author.avgReviewTime < 5 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {author.avgReviewTime}h
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {author.avgReviewTime < 3 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Fast
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Normal
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Repository Stats */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Repository Activity</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={repositoryStats} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="repo" type="category" width={150} />
            <Tooltip />
            <Legend />
            <Bar dataKey="prs" fill="#3b82f6" name="Total PRs" radius={[0, 8, 8, 0]} />
            <Bar dataKey="openPRs" fill="#f59e0b" name="Open PRs" radius={[0, 8, 8, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Recent Activity by Repository */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Activity by Repository</h2>
        <div className="space-y-6">
          {repositoryStats.slice(0, 5).map((repo, index) => {
            const recentPRs = data.recentPRsByRepo[repo.repo] || [];
            return (
              <div key={index} className="border-b last:border-0 pb-6 last:pb-0">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">{repo.repo}</h3>
                {recentPRs.length === 0 ? (
                  <p className="text-gray-500 text-sm">No recent PRs</p>
                ) : (
                  <div className="space-y-2">
                    {recentPRs.map((pr, prIndex) => {
                      const org = import.meta.env.VITE_GITHUB_ORG;
                      const prUrl = pr.url || `https://github.com/${org}/${pr.repository}/pull/${pr.number}`;
                      return (
                      <a
                        key={prIndex}
                        href={prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 hover:border hover:border-blue-300 transition-all cursor-pointer"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-blue-600 hover:text-blue-800">#{pr.number}</span>
                            <span className="text-sm text-gray-700 truncate">{pr.title}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>{pr.user.login}</span>
                            <span>{new Date(pr.created_at).toLocaleDateString()}</span>
                            <span>{(pr.additions || 0) + (pr.deletions || 0)} lines</span>
                          </div>
                        </div>
                        <div className="ml-4 flex-shrink-0">
                          {pr.state === 'open' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Open
                            </span>
                          )}
                          {pr.merged_at && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              Merged
                            </span>
                          )}
                          {pr.closed_at && !pr.merged_at && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              Closed
                            </span>
                          )}
                        </div>
                      </a>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Contributor Detail Modal */}
      {selectedContributor && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedContributor(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {selectedContributor.avatarUrl ? (
                    <img
                      src={selectedContributor.avatarUrl}
                      alt={selectedContributor.author}
                      className="h-16 w-16 rounded-full border-4 border-white"
                    />
                  ) : (
                    <div className="h-16 w-16 bg-white text-blue-600 rounded-full flex items-center justify-center text-2xl font-bold border-4 border-white">
                      {selectedContributor.author.split(' ').map(n => n[0]).join('')}
                    </div>
                  )}
                  <div>
                    <h2 className="text-2xl font-bold">{selectedContributor.author}</h2>
                    <p className="text-blue-100 mt-1">
                      {selectedContributor.count} PRs • {selectedContributor.avgSize} lines avg • {selectedContributor.avgReviewTime}h avg review time
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedContributor(null)}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Pull Requests</h3>
              <div className="space-y-3">
                {selectedContributor.prs.map((pr, index) => {
                  const org = import.meta.env.VITE_GITHUB_ORG;
                  const prUrl = pr.url || `https://github.com/${org}/${pr.repository}/pull/${pr.number}`;
                  return (
                    <a
                      key={index}
                      href={prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-semibold text-blue-600 hover:text-blue-800">#{pr.number}</span>
                            <span className="text-sm text-gray-700">{pr.title}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span className="font-medium">{pr.repository}</span>
                            <span>{new Date(pr.created_at).toLocaleDateString()}</span>
                            <span className="text-green-600">+{pr.additions || 0}</span>
                            <span className="text-red-600">-{pr.deletions || 0}</span>
                          </div>
                        </div>
                        <div className="ml-4">
                          {pr.state === 'open' && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Open
                            </span>
                          )}
                          {pr.merged_at && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              Merged
                            </span>
                          )}
                          {pr.closed_at && !pr.merged_at && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              Closed
                            </span>
                          )}
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-gray-500">
        <p>Last updated: {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</p>
        {usingCache && (
          <p className="mt-1 text-xs text-green-600">
            <span className="inline-flex items-center">
              <CheckCircle className="w-3 h-3 mr-1" />
              Using cached data (refreshes every 10 minutes)
            </span>
          </p>
        )}
      </div>
      </>
      )}
    </div>
  );
};

export default EngineeringDashboard;
