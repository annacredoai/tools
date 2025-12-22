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

  useEffect(() => {
    fetchGitHubData();
  }, [timeRange]);

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

      {/* PR Activity Over Time */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Weekly PR Activity</h2>
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
                <tr key={index} className="hover:bg-gray-50">
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
