import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Calendar, GitPullRequest, Clock, Users, TrendingUp, Activity, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import GitHubAPI from './services/githubApi';

const EngineeringDashboard = () => {
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [timeRange, setTimeRange] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    contributors: [],
    repositories: [],
    weeklyData: [],
    prSizeDistribution: [],
    reviewTimeData: [],
  });
  const [epics, setEpics] = useState([]);
  const [expandedEpics, setExpandedEpics] = useState({});
  const [epicPage, setEpicPage] = useState(1);
  const epicsPerPage = 10;

  useEffect(() => {
    fetchGitHubData();
    fetchJiraEpics();
  }, [timeRange]);

  const fetchJiraEpics = async () => {
    try {
      const response = await fetch('/jira-epics.json');
      if (!response.ok) {
        console.log('[JIRA] No jira-epics.json found. Run: npm run fetch-jira');
        return;
      }
      const data = await response.json();
      setEpics(data.epics || []);
      console.log(`[JIRA] Loaded ${data.epics?.length || 0} epics`);
    } catch (error) {
      console.error('[JIRA] Error loading jira-epics.json:', error);
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

      const githubApi = new GitHubAPI(token, org);

      // Convert timeRange to days
      const daysMap = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
      const days = daysMap[timeRange] || 30;

      const metrics = await githubApi.getEngineeringMetrics(repos, days);

      setData({
        contributors: metrics.contributors,
        repositories: metrics.repositories,
        weeklyData: metrics.weeklyData,
        prSizeDistribution: metrics.prSizeDistribution,
        reviewTimeData: metrics.reviewTimeData,
      });
    } catch (err) {
      console.error('Error fetching GitHub data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const prData = data.contributors;
  const weeklyPRs = data.weeklyData;
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
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Engineering Dashboard</h1>
        <p className="text-gray-600">Team productivity and code review analytics</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6 flex gap-4">
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
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
            <p className="text-gray-600 text-lg">Fetching data from GitHub...</p>
            <p className="text-gray-500 text-sm mt-2">This may take a moment for large organizations</p>
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
          trend={12}
          color="#3b82f6"
        />
        <StatCard 
          title="Avg Review Time"
          value={`${avgReviewTime}h`}
          subtitle="Time to first review"
          icon={Clock}
          trend={-8}
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
          subtitle="Contributing developers"
          icon={Users}
          trend={5}
          color="#8b5cf6"
        />
      </div>

      {/* Epic Progress */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Active Epics</h2>
          <button
            onClick={fetchJiraEpics}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
        {(() => {
          const filteredEpics = epics.filter(epic => ['Ready for Sprint', 'In Progress'].includes(epic.status));

          if (epics.length === 0) {
            return <p className="text-gray-500 text-center py-8">No active epics found. Run <code className="bg-gray-100 px-2 py-1 rounded">npm run fetch-jira</code> to load epic data.</p>;
          }

          if (filteredEpics.length === 0) {
            return <p className="text-gray-500 text-center py-8">No epics with status "Ready for Sprint" or "In Progress" found.</p>;
          }

          // Pagination
          const totalPages = Math.ceil(filteredEpics.length / epicsPerPage);
          const startIndex = (epicPage - 1) * epicsPerPage;
          const paginatedEpics = filteredEpics.slice(startIndex, startIndex + epicsPerPage);

          return (
          <div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Epic</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Story Points</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contributors</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Sub-tickets</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedEpics.map((epic) => {
                    const jiraUrl = import.meta.env.VITE_JIRA_URL;
                    const epicUrl = jiraUrl ? `${jiraUrl.replace(/\/$/, '')}/browse/${epic.key}` : null;
                    const isExpanded = expandedEpics[epic.key];

                    return (
                      <React.Fragment key={epic.key}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div>
                              {epicUrl ? (
                                <a
                                  href={epicUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm font-semibold text-purple-600 hover:text-purple-800"
                                >
                                  {epic.key}
                                </a>
                              ) : (
                                <div className="text-sm font-semibold text-purple-600">{epic.key}</div>
                              )}
                              <div className="text-xs text-gray-600 mt-1">{epic.summary}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              {epic.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-green-500 h-2 rounded-full transition-all"
                                    style={{ width: `${epic.progressPercent}%` }}
                                  ></div>
                                </div>
                              </div>
                              <span className="text-xs text-gray-600 whitespace-nowrap">{epic.completedTickets}/{epic.totalTickets}</span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">{epic.progressPercent}%</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {epic.totalStoryPoints > 0 ? (
                              <div className="text-sm text-gray-900">{epic.completedStoryPoints}/{epic.totalStoryPoints}</div>
                            ) : (
                              <span className="text-xs text-gray-400">N/A</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {epic.contributors.length > 0 ? epic.contributors.slice(0, 3).map((contributor, idx) => (
                                <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
                                  {contributor}
                                </span>
                              )) : (
                                <span className="text-xs text-gray-400 italic">No assignees</span>
                              )}
                              {epic.contributors.length > 3 && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
                                  +{epic.contributors.length - 3}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {epic.totalTickets > 0 && (
                              <button
                                onClick={() => setExpandedEpics(prev => ({ ...prev, [epic.key]: !prev[epic.key] }))}
                                className="px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                              >
                                {isExpanded ? '▼ Hide' : '▶ Show'} ({epic.totalTickets})
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Expandable Sub-tickets Row */}
                        {isExpanded && (
                          <tr>
                            <td colSpan="6" className="px-6 py-4 bg-gray-50">
                              <div className="border-t border-gray-200 pt-4">
                                <h4 className="font-semibold text-gray-900 mb-3">Sub-tickets:</h4>
                                <div className="space-y-2">
                                  {epic.subTickets.map((ticket, idx) => {
                                    const ticketUrl = jiraUrl ? `${jiraUrl.replace(/\/$/, '')}/browse/${ticket.key}` : null;

                                    return (
                                      <div
                                        key={idx}
                                        className={`p-3 rounded-lg border transition-all ${
                                          ticket.isCompleted
                                            ? 'bg-green-50 border-green-200'
                                            : 'bg-white border-gray-200 hover:border-blue-300'
                                        }`}
                                      >
                                        <div className="flex items-start gap-3">
                                          <div className="flex-shrink-0 mt-1">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                              ticket.issueType === 'Bug' ? 'bg-red-100 text-red-800' :
                                              ticket.issueType === 'Story' ? 'bg-blue-100 text-blue-800' :
                                              ticket.issueType === 'Task' ? 'bg-green-100 text-green-800' :
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
                                                className="text-sm font-semibold text-purple-600 hover:text-purple-800"
                                              >
                                                {ticket.key}: {ticket.summary}
                                              </a>
                                            ) : (
                                              <div className="text-sm font-semibold text-purple-600">
                                                {ticket.key}: {ticket.summary}
                                              </div>
                                            )}
                                            <div className="flex items-center gap-3 text-xs mt-1.5 text-gray-600">
                                              <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium ${
                                                ticket.isCompleted ? 'bg-green-100 text-green-800' :
                                                ticket.status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-gray-100 text-gray-800'
                                              }`}>
                                                {ticket.status}
                                              </span>
                                              <span>👤 {ticket.assignee}</span>
                                              {ticket.storyPoints > 0 && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                                  📊 {ticket.storyPoints} pts
                                                </span>
                                              )}
                                              {ticket.priority && ticket.priority !== 'None' && (
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                                  ticket.priority === 'High' || ticket.priority === 'Highest' ? 'bg-red-50 text-red-700 border border-red-200' :
                                                  ticket.priority === 'Medium' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                                                  'bg-gray-50 text-gray-700 border border-gray-200'
                                                }`}>
                                                  {ticket.priority}
                                                </span>
                                              )}
                                              {ticket.featureFlag && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                                                  🚩 {ticket.featureFlag}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 px-2">
                <div className="text-sm text-gray-600">
                  Showing {startIndex + 1} to {Math.min(startIndex + epicsPerPage, filteredEpics.length)} of {filteredEpics.length} epics
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEpicPage(p => Math.max(1, p - 1))}
                    disabled={epicPage === 1}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ← Previous
                  </button>
                  <span className="px-3 py-1 text-sm text-gray-700">
                    Page {epicPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setEpicPage(p => Math.min(totalPages, p + 1))}
                    disabled={epicPage === totalPages}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
          )
        })()}
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
              {prData.map((author, index) => {
                const org = import.meta.env.VITE_GITHUB_ORG;
                const repos = import.meta.env.VITE_GITHUB_REPOS?.split(',').filter(Boolean) || [];
                // Create GitHub search URL for this author's PRs
                const repoQuery = repos.map(r => `repo:${org}/${r}`).join(' ');
                const authorSearchUrl = `https://github.com/search?q=${encodeURIComponent(`is:pr author:${author.login || author.author} ${repoQuery}`)}&type=pullrequests`;
                const profileUrl = author.login ? `https://github.com/${author.login}` : authorSearchUrl;

                return (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <a
                        href={profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center hover:opacity-80 transition-opacity"
                      >
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
                          <div className="text-sm font-medium text-blue-600 hover:text-blue-800">{author.author}</div>
                        </div>
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <a
                        href={authorSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800 font-semibold underline"
                      >
                        {author.count}
                      </a>
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Repository Stats */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Repository Activity</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Repository</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total PRs</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Open PRs</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activity</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {repositoryStats.map((repo, index) => {
                const org = import.meta.env.VITE_GITHUB_ORG;
                const repoUrl = `https://github.com/${org}/${repo.repo}`;
                const allPRsUrl = `https://github.com/${org}/${repo.repo}/pulls?q=is%3Apr`;
                const openPRsUrl = `https://github.com/${org}/${repo.repo}/pulls?q=is%3Apr+is%3Aopen`;

                return (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <a
                        href={repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        {repo.repo}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <a
                        href={allPRsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800 font-semibold underline"
                      >
                        {repo.prs}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <a
                        href={openPRsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-orange-600 hover:text-orange-800 font-semibold underline"
                      >
                        {repo.openPRs}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-full bg-gray-200 rounded-full h-2 mr-2" style={{ width: '100px' }}>
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${Math.min((repo.prs / Math.max(...repositoryStats.map(r => r.prs))) * 100, 100)}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-500">{repo.prs}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-gray-500">
        <p>Last updated: {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</p>
      </div>
      </>
      )}
    </div>
  );
};

export default EngineeringDashboard;
