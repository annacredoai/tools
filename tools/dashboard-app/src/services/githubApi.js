const GITHUB_API_BASE = 'https://api.github.com';

class GitHubAPI {
  constructor(token, org) {
    this.token = token;
    this.org = org;
    this.headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
    };
  }

  async fetchAllPages(url) {
    let allData = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const pageUrl = `${url}${url.includes('?') ? '&' : '?'}per_page=${perPage}&page=${page}`;
      const response = await fetch(pageUrl, { headers: this.headers });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (data.length === 0) break;

      allData = [...allData, ...data];
      page++;

      // GitHub API has a max of 1000 items per endpoint
      if (data.length < perPage || page > 10) break;
    }

    return allData;
  }

  async getOrgRepos() {
    try {
      const url = `${GITHUB_API_BASE}/orgs/${this.org}/repos`;
      return await this.fetchAllPages(url);
    } catch (error) {
      console.error('Error fetching repositories:', error);
      throw error;
    }
  }

  async getRepoPullRequests(repo, state = 'all', since = null) {
    try {
      let url = `${GITHUB_API_BASE}/repos/${this.org}/${repo}/pulls?state=${state}&sort=created&direction=desc`;

      const prs = await this.fetchAllPages(url);

      // Filter by date if since is provided
      if (since) {
        const sinceDate = new Date(since);
        return prs.filter(pr => new Date(pr.created_at) >= sinceDate);
      }

      return prs;
    } catch (error) {
      console.error(`Error fetching PRs for ${repo}:`, error);
      throw error;
    }
  }

  async getRepoCommits(repo, since = null) {
    try {
      let url = `${GITHUB_API_BASE}/repos/${this.org}/${repo}/commits`;

      if (since) {
        url += `?since=${since}`;
      }

      return await this.fetchAllPages(url);
    } catch (error) {
      console.error(`Error fetching commits for ${repo}:`, error);
      throw error;
    }
  }

  async getPullRequestReviews(repo, prNumber) {
    try {
      const url = `${GITHUB_API_BASE}/repos/${this.org}/${repo}/pulls/${prNumber}/reviews`;
      const response = await fetch(url, { headers: this.headers });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error fetching reviews for PR #${prNumber}:`, error);
      return [];
    }
  }

  calculateReviewTime(pr, reviews) {
    if (!reviews || reviews.length === 0) return null;

    const createdAt = new Date(pr.created_at);
    const firstReview = reviews.sort((a, b) =>
      new Date(a.submitted_at) - new Date(b.submitted_at)
    )[0];

    if (!firstReview) return null;

    const reviewedAt = new Date(firstReview.submitted_at);
    const diffInHours = (reviewedAt - createdAt) / (1000 * 60 * 60);

    return diffInHours;
  }

  async getEngineeringMetrics(repos = null, daysSince = 30) {
    try {
      // Get all repos if not specified
      if (!repos || repos.length === 0) {
        const allRepos = await this.getOrgRepos();
        repos = allRepos.map(r => r.name);
      }

      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - daysSince);
      const since = sinceDate.toISOString();

      const allMetrics = {
        contributors: {},
        repositories: {},
        weeklyData: {},
        prSizes: { xs: 0, s: 0, m: 0, l: 0, xl: 0 },
        reviewTimes: { '<1h': 0, '1-4h': 0, '4-24h': 0, '1-3d': 0, '>3d': 0 },
      };

      // Fetch PRs for each repository
      for (const repo of repos) {
        try {
          const prs = await this.getRepoPullRequests(repo, 'all', since);

          if (!allMetrics.repositories[repo]) {
            allMetrics.repositories[repo] = {
              totalPRs: 0,
              openPRs: 0,
              mergedPRs: 0,
              closedPRs: 0,
              avgReviewTime: [],
            };
          }

          for (const pr of prs) {
            // Repository stats
            allMetrics.repositories[repo].totalPRs++;
            if (pr.state === 'open') {
              allMetrics.repositories[repo].openPRs++;
            } else if (pr.merged_at) {
              allMetrics.repositories[repo].mergedPRs++;
            } else {
              allMetrics.repositories[repo].closedPRs++;
            }

            // Contributor stats
            const author = pr.user.login;
            if (!allMetrics.contributors[author]) {
              allMetrics.contributors[author] = {
                name: pr.user.login,
                avatarUrl: pr.user.avatar_url,
                count: 0,
                totalSize: 0,
                reviewTimes: [],
              };
            }

            allMetrics.contributors[author].count++;

            // PR size (additions + deletions)
            const prSize = (pr.additions || 0) + (pr.deletions || 0);
            allMetrics.contributors[author].totalSize += prSize;

            // Categorize PR size
            if (prSize <= 10) allMetrics.prSizes.xs++;
            else if (prSize <= 50) allMetrics.prSizes.s++;
            else if (prSize <= 200) allMetrics.prSizes.m++;
            else if (prSize <= 500) allMetrics.prSizes.l++;
            else allMetrics.prSizes.xl++;

            // Weekly data
            const weekKey = this.getWeekKey(new Date(pr.created_at));
            if (!allMetrics.weeklyData[weekKey]) {
              allMetrics.weeklyData[weekKey] = { created: 0, merged: 0, closed: 0 };
            }
            allMetrics.weeklyData[weekKey].created++;
            if (pr.merged_at) {
              allMetrics.weeklyData[weekKey].merged++;
            } else if (pr.closed_at && !pr.merged_at) {
              allMetrics.weeklyData[weekKey].closed++;
            }

            // Review time calculation
            const reviews = await this.getPullRequestReviews(repo, pr.number);
            const reviewTime = this.calculateReviewTime(pr, reviews);

            if (reviewTime !== null) {
              allMetrics.contributors[author].reviewTimes.push(reviewTime);
              allMetrics.repositories[repo].avgReviewTime.push(reviewTime);

              // Categorize review time
              if (reviewTime < 1) allMetrics.reviewTimes['<1h']++;
              else if (reviewTime < 4) allMetrics.reviewTimes['1-4h']++;
              else if (reviewTime < 24) allMetrics.reviewTimes['4-24h']++;
              else if (reviewTime < 72) allMetrics.reviewTimes['1-3d']++;
              else allMetrics.reviewTimes['>3d']++;
            }
          }
        } catch (error) {
          console.error(`Error processing repo ${repo}:`, error);
        }
      }

      return this.formatMetrics(allMetrics);
    } catch (error) {
      console.error('Error getting engineering metrics:', error);
      throw error;
    }
  }

  getWeekKey(date) {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${weekNumber}`;
  }

  formatMetrics(metrics) {
    // Format contributors
    const contributors = Object.values(metrics.contributors).map(c => ({
      author: c.name,
      avatarUrl: c.avatarUrl,
      count: c.count,
      avgSize: c.totalSize > 0 ? Math.round(c.totalSize / c.count) : 0,
      avgReviewTime: c.reviewTimes.length > 0
        ? parseFloat((c.reviewTimes.reduce((a, b) => a + b, 0) / c.reviewTimes.length).toFixed(1))
        : 0,
    })).sort((a, b) => b.count - a.count);

    // Format repositories
    const repositories = Object.entries(metrics.repositories).map(([name, data]) => ({
      repo: name,
      prs: data.totalPRs,
      openPRs: data.openPRs,
      mergedPRs: data.mergedPRs,
      closedPRs: data.closedPRs,
      avgTime: data.avgReviewTime.length > 0
        ? parseFloat((data.avgReviewTime.reduce((a, b) => a + b, 0) / data.avgReviewTime.length).toFixed(1))
        : 0,
    })).sort((a, b) => b.prs - a.prs);

    // Format weekly data
    const weeklyData = Object.entries(metrics.weeklyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8) // Last 8 weeks
      .map(([week, data]) => ({
        week: this.formatWeekLabel(week),
        prs: data.created,
        merged: data.merged,
        closed: data.closed,
      }));

    // Format PR sizes
    const prSizeDistribution = [
      { name: 'XS (0-10)', value: metrics.prSizes.xs, color: '#10b981' },
      { name: 'S (11-50)', value: metrics.prSizes.s, color: '#3b82f6' },
      { name: 'M (51-200)', value: metrics.prSizes.m, color: '#f59e0b' },
      { name: 'L (201-500)', value: metrics.prSizes.l, color: '#ef4444' },
      { name: 'XL (500+)', value: metrics.prSizes.xl, color: '#8b5cf6' },
    ];

    // Format review times
    const reviewTimeData = [
      { timeRange: '< 1h', count: metrics.reviewTimes['<1h'] },
      { timeRange: '1-4h', count: metrics.reviewTimes['1-4h'] },
      { timeRange: '4-24h', count: metrics.reviewTimes['4-24h'] },
      { timeRange: '1-3d', count: metrics.reviewTimes['1-3d'] },
      { timeRange: '> 3d', count: metrics.reviewTimes['>3d'] },
    ];

    return {
      contributors,
      repositories,
      weeklyData,
      prSizeDistribution,
      reviewTimeData,
    };
  }

  formatWeekLabel(weekKey) {
    const [year, week] = weekKey.split('-W');
    return `W${week}`;
  }
}

export default GitHubAPI;
