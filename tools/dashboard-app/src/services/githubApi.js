const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_GRAPHQL_API = 'https://api.github.com/graphql';

class GitHubAPI {
  constructor(token, org) {
    this.token = token;
    this.org = org;
    this.headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
    };
    this.graphqlHeaders = {
      'Authorization': `bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async graphqlQuery(query, variables = {}) {
    try {
      const response = await fetch(GITHUB_GRAPHQL_API, {
        method: 'POST',
        headers: this.graphqlHeaders,
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        throw new Error(`GitHub GraphQL error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      if (result.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
      }

      return result.data;
    } catch (error) {
      console.error('GraphQL query error:', error);
      throw error;
    }
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

  async getReleaseBranches(repo) {
    try {
      const query = `
        query($org: String!, $repo: String!) {
          repository(owner: $org, name: $repo) {
            refs(refPrefix: "refs/heads/", first: 100, orderBy: {field: TAG_COMMIT_DATE, direction: DESC}) {
              nodes {
                name
                target {
                  ... on Commit {
                    committedDate
                  }
                }
              }
            }
          }
        }
      `;

      const variables = { org: this.org, repo };
      const data = await this.graphqlQuery(query, variables);

      // Filter for release branches matching release/v* pattern
      const releaseBranches = data.repository.refs.nodes
        .filter(branch => /^release\/v[\d.]+/.test(branch.name))
        .map(branch => ({
          name: branch.name,
          version: this.parseVersion(branch.name),
          committedDate: branch.target.committedDate,
        }))
        .filter(branch => {
          // Only include v22 and forward (exclude year-based versions like v2024.x)
          const majorVersion = parseInt(branch.version.split('.')[0]);
          // Keep versions between 22 and 99 (excludes years like 2024)
          return majorVersion >= 22 && majorVersion <= 99;
        })
        .sort((a, b) => new Date(b.committedDate) - new Date(a.committedDate)) // Sort by commit date, newest first
        .slice(0, 3); // Keep the latest 3 releases (for v25-v24 and v24-v23 comparisons)

      return releaseBranches;
    } catch (error) {
      console.error(`Error fetching release branches for ${repo}:`, error);
      return [];
    }
  }

  parseVersion(branchName) {
    // Extract version from release/vX.Y.Z
    const match = branchName.match(/release\/v([\d.]+)/);
    return match ? match[1] : '0.0.0';
  }

  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const num1 = parts1[i] || 0;
      const num2 = parts2[i] || 0;

      if (num1 !== num2) {
        return num1 - num2;
      }
    }
    return 0;
  }

  async compareReleaseBranches(repo, baseRelease, headRelease, fetchPRDetails = false) {
    try {
      // Use REST API for branch comparison - it's the only way to get accurate diff
      const url = `${GITHUB_API_BASE}/repos/${this.org}/${repo}/compare/${baseRelease}...${headRelease}`;
      console.log(`[Compare] ${repo}: ${baseRelease}...${headRelease}`);

      const response = await fetch(url, {
        headers: this.headers,
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`Comparison not found for ${repo}: ${baseRelease}...${headRelease}`);
          return { commits: [] };
        }
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[Compare] ${repo}: Found ${data.commits?.length || 0} commits`);

      // Extract PR numbers from commit messages - don't fetch individual PR details
      const commits = (data.commits || []).slice(0, 100).map((commit) => {
        const prMatch = commit.commit.message.match(/#(\d+)/);

        return {
          sha: commit.sha.substring(0, 7),
          message: commit.commit.message.split('\n')[0],
          date: commit.commit.committer.date,
          author: commit.author?.login || commit.commit.author.name,
          pr: prMatch ? {
            number: parseInt(prMatch[1]),
            url: `https://github.com/${this.org}/${repo}/pull/${prMatch[1]}`,
            title: commit.commit.message.split('\n')[0], // Use commit message as title
          } : null,
        };
      });

      return {
        commits,
        ahead_by: data.ahead_by || 0,
        behind_by: data.behind_by || 0,
      };
    } catch (error) {
      console.error(`Error comparing releases for ${repo}:`, error);
      return { commits: [] };
    }
  }

  async getReleaseComparisons(repos = null) {
    try {
      if (!repos || repos.length === 0) {
        const allRepos = await this.getOrgRepos();
        repos = allRepos
          .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
          .slice(0, 5)
          .map(r => r.name);
      }

      const releaseData = [];

      for (const repo of repos) {
        const branches = await this.getReleaseBranches(repo);

        if (branches.length < 2) {
          continue; // Need at least 2 releases to compare
        }

        // Compare each release with the previous one
        for (let i = 0; i < branches.length - 1; i++) {
          const current = branches[i];
          const previous = branches[i + 1];

          const comparison = await this.compareReleaseBranches(
            repo,
            previous.name,
            current.name
          );

          if (comparison.commits && comparison.commits.length > 0) {
            releaseData.push({
              repo,
              currentRelease: current.name,
              previousRelease: previous.name,
              currentVersion: current.version,
              previousVersion: previous.version,
              changeCount: comparison.commits.length,
              changes: comparison.commits.slice(0, 10), // Show top 10 changes
              allChanges: comparison.commits,
            });
          }
        }
      }

      return releaseData;
    } catch (error) {
      console.error('Error getting release comparisons:', error);
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

  async getRepoPullRequestsWithReviews(repo, state = 'all', since = null) {
    try {
      const sinceDate = since ? new Date(since) : null;
      let allPRs = [];
      let hasNextPage = true;
      let cursor = null;
      let pageCount = 0;
      const MAX_PAGES = 50; // Safety limit

      while (hasNextPage && pageCount < MAX_PAGES) {
        const query = `
          query($org: String!, $repo: String!, $states: [PullRequestState!], $after: String) {
            repository(owner: $org, name: $repo) {
              pullRequests(first: 100, after: $after, states: $states, orderBy: {field: CREATED_AT, direction: DESC}) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  number
                  title
                  state
                  createdAt
                  closedAt
                  mergedAt
                  additions
                  deletions
                  author {
                    login
                    avatarUrl
                  }
                  reviews(first: 10) {
                    nodes {
                      submittedAt
                      state
                      author {
                        login
                      }
                    }
                  }
                }
              }
            }
          }
        `;

        const stateFilter = state === 'all' ? ['OPEN', 'CLOSED', 'MERGED'] : [state.toUpperCase()];
        const variables = {
          org: this.org,
          repo: repo,
          states: stateFilter,
          after: cursor,
        };

        const data = await this.graphqlQuery(query, variables);
        const prData = data.repository.pullRequests;
        pageCount++;

        const prs = prData.nodes.map(pr => ({
          number: pr.number,
          title: pr.title,
          state: pr.state.toLowerCase(),
          created_at: pr.createdAt,
          closed_at: pr.closedAt,
          merged_at: pr.mergedAt,
          additions: pr.additions,
          deletions: pr.deletions,
          user: {
            login: pr.author?.login || 'unknown',
            avatar_url: pr.author?.avatarUrl || '',
          },
          reviews: pr.reviews.nodes.map(review => ({
            submitted_at: review.submittedAt,
            state: review.state,
            user: {
              login: review.author?.login || 'unknown',
            },
          })),
        }));

        // Check if we should stop early based on date
        if (sinceDate && prs.length > 0) {
          // Check the last (oldest) PR in this page
          const lastPR = prs[prs.length - 1];
          const lastPRDate = new Date(lastPR.created_at);

          // If the last PR is older than our cutoff, this is our final page
          if (lastPRDate < sinceDate) {
            // Only keep PRs from this page that are within range
            const filteredPRs = prs.filter(pr => new Date(pr.created_at) >= sinceDate);
            allPRs = [...allPRs, ...filteredPRs];
            console.log(`Stopped fetching ${repo} early at page ${pageCount} (found PRs older than ${sinceDate.toISOString()})`);
            break;
          }
        }

        // Add all PRs from this page (they're all within date range)
        allPRs = [...allPRs, ...prs];

        hasNextPage = prData.pageInfo.hasNextPage;
        cursor = prData.pageInfo.endCursor;

        // If no more pages, we're done
        if (!hasNextPage) {
          break;
        }
      }

      console.log(`Fetched ${allPRs.length} PRs from ${repo} in ${pageCount} page(s)`);
      return allPRs;
    } catch (error) {
      console.error(`Error fetching PRs with reviews for ${repo}:`, error);
      throw error;
    }
  }

  isBot(username) {
    if (!username) return true;
    const botPatterns = [
      /bot$/i,
      /\[bot\]/i,
      /^dependabot/i,
      /^renovate/i,
      /^github-actions/i,
      /^codecov/i,
      /-bot$/i,
    ];
    return botPatterns.some(pattern => pattern.test(username));
  }

  isFeatureBranchMerge(title) {
    if (!title) return false;
    // Match patterns like:
    // - feat/DEV-1234
    // - feature/DEV-1234
    // - Merge branch 'feat/...'
    // - Merge branch 'feature/...'
    const featureBranchPatterns = [
      /^feat\/[A-Z]+-\d+/i,
      /^feature\/[A-Z]+-\d+/i,
      /merge.*branch.*['"]feat\//i,
      /merge.*branch.*['"]feature\//i,
    ];
    return featureBranchPatterns.some(pattern => pattern.test(title));
  }

  extractJiraProject(title) {
    if (!title) return null;
    // Match JIRA ticket patterns like DEV-1234, ENG-456, PROD-789
    // Captures the project prefix (e.g., "DEV", "ENG", "PROD")
    const jiraPattern = /([A-Z]+)-\d+/;
    const match = title.match(jiraPattern);
    return match ? match[1] : null;
  }

  extractJiraTicket(title) {
    if (!title) return null;
    // Match full JIRA ticket patterns like DEV-1234, ENG-456, PROD-789
    const jiraPattern = /([A-Z]+-\d+)/;
    const match = title.match(jiraPattern);
    return match ? match[1] : null;
  }

  isEpic(title) {
    if (!title) return false;
    // Check if PR title indicates it's an epic
    // Common patterns: "work type: epic", "type: epic", "[epic]", "EPIC:", etc.
    return /epic/i.test(title);
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

  async getEngineeringMetrics(repos = null, daysSince = 30, onProgress = null) {
    try {
      // Get all repos if not specified
      if (!repos || repos.length === 0) {
        const allRepos = await this.getOrgRepos();
        // Limit to top 10 most recently pushed repos if not specified
        repos = allRepos
          .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
          .slice(0, 10)
          .map(r => r.name);
        console.log(`No repos specified, using top 10 active repos: ${repos.join(', ')}`);
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
        allPRs: [], // Store all PRs for activity feed
        projectWork: {}, // Track work by JIRA project prefix
        epicWork: {}, // Track work by individual epic tickets
      };

      // Fetch PRs for each repository with reviews using GraphQL (in parallel)
      const repoPromises = repos.map(async (repo, index) => {
        try {
          if (onProgress) {
            onProgress({ current: index + 1, total: repos.length, repo });
          }
          const prs = await this.getRepoPullRequestsWithReviews(repo, 'all', since);
          return { repo, prs };
        } catch (error) {
          console.error(`Error processing repo ${repo}:`, error);
          return { repo, prs: [] };
        }
      });

      // Process repos in batches of 3 to avoid rate limiting
      const batchSize = 3;
      const results = [];
      for (let i = 0; i < repoPromises.length; i += batchSize) {
        const batch = repoPromises.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch);
        results.push(...batchResults);
      }

      // Process results
      for (const { repo, prs } of results) {
        try {
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
            // Skip PRs from bots
            const author = pr.user.login;
            if (this.isBot(author)) {
              continue;
            }

            // Store PR details for activity feed
            allMetrics.allPRs.push({
              ...pr,
              repository: repo,
              url: `https://github.com/${this.org}/${repo}/pull/${pr.number}`,
            });

            // Track work by JIRA project
            const jiraProject = this.extractJiraProject(pr.title);
            if (jiraProject) {
              if (!allMetrics.projectWork[jiraProject]) {
                allMetrics.projectWork[jiraProject] = {
                  project: jiraProject,
                  prCount: 0,
                  merged: 0,
                  open: 0,
                  closed: 0,
                };
              }
              allMetrics.projectWork[jiraProject].prCount++;
              if (pr.merged_at) {
                allMetrics.projectWork[jiraProject].merged++;
              } else if (pr.state === 'open') {
                allMetrics.projectWork[jiraProject].open++;
              } else if (pr.closed_at) {
                allMetrics.projectWork[jiraProject].closed++;
              }
            }

            // Track work by epic tickets (only if PR is for an epic)
            if (this.isEpic(pr.title)) {
              const jiraTicket = this.extractJiraTicket(pr.title);
              if (jiraTicket) {
                if (!allMetrics.epicWork[jiraTicket]) {
                  allMetrics.epicWork[jiraTicket] = {
                    ticket: jiraTicket,
                    prCount: 0,
                    merged: 0,
                    open: 0,
                    closed: 0,
                    prTitles: [], // Store PR titles for context
                  };
                }
                allMetrics.epicWork[jiraTicket].prCount++;
                allMetrics.epicWork[jiraTicket].prTitles.push(pr.title);
                if (pr.merged_at) {
                  allMetrics.epicWork[jiraTicket].merged++;
                } else if (pr.state === 'open') {
                  allMetrics.epicWork[jiraTicket].open++;
                } else if (pr.closed_at) {
                  allMetrics.epicWork[jiraTicket].closed++;
                }
              }
            }

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
            if (!allMetrics.contributors[author]) {
              allMetrics.contributors[author] = {
                name: pr.user.login,
                avatarUrl: pr.user.avatar_url,
                count: 0,
                totalSize: 0,
                sizeCount: 0, // Count of PRs included in size calculation (excludes feature branch merges)
                reviewTimes: [],
                prs: [], // Store individual PRs for this contributor
                weeklyData: {}, // Track weekly activity per contributor
              };
            }

            allMetrics.contributors[author].count++;
            allMetrics.contributors[author].prs.push({
              number: pr.number,
              title: pr.title,
              state: pr.state,
              repository: repo,
              created_at: pr.created_at,
              merged_at: pr.merged_at,
              closed_at: pr.closed_at,
              additions: pr.additions,
              deletions: pr.deletions,
              url: `https://github.com/${this.org}/${repo}/pull/${pr.number}`,
            });

            // PR size (additions + deletions)
            // Skip feature branch merges from size calculation as they're typically very large
            const prSize = (pr.additions || 0) + (pr.deletions || 0);
            if (!this.isFeatureBranchMerge(pr.title)) {
              allMetrics.contributors[author].totalSize += prSize;
              allMetrics.contributors[author].sizeCount++;
            } else {
              console.log(`Excluding feature branch merge from size calc: ${pr.title}`);
            }

            // Debug: Log if additions/deletions are missing
            if (prSize === 0 && (pr.additions === undefined || pr.deletions === undefined)) {
              console.warn(`PR #${pr.number} missing additions/deletions data`);
            }

            // Categorize PR size
            if (prSize <= 10) allMetrics.prSizes.xs++;
            else if (prSize <= 50) allMetrics.prSizes.s++;
            else if (prSize <= 200) allMetrics.prSizes.m++;
            else if (prSize <= 500) allMetrics.prSizes.l++;
            else allMetrics.prSizes.xl++;

            // Weekly data (overall)
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

            // Weekly data per contributor
            if (!allMetrics.contributors[author].weeklyData[weekKey]) {
              allMetrics.contributors[author].weeklyData[weekKey] = { created: 0, merged: 0, closed: 0 };
            }
            allMetrics.contributors[author].weeklyData[weekKey].created++;
            if (pr.merged_at) {
              allMetrics.contributors[author].weeklyData[weekKey].merged++;
            } else if (pr.closed_at && !pr.merged_at) {
              allMetrics.contributors[author].weeklyData[weekKey].closed++;
            }

            // Review time calculation (reviews are already included from GraphQL)
            const reviewTime = this.calculateReviewTime(pr, pr.reviews);

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
    // Get Monday of the week for this date
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().split('T')[0]; // Returns YYYY-MM-DD format
  }

  formatMetrics(metrics) {
    // Format contributors
    const contributors = Object.values(metrics.contributors).map(c => ({
      author: c.name,
      avatarUrl: c.avatarUrl,
      count: c.count,
      avgSize: c.sizeCount > 0 ? Math.round(c.totalSize / c.sizeCount) : 0,
      avgReviewTime: c.reviewTimes.length > 0
        ? parseFloat((c.reviewTimes.reduce((a, b) => a + b, 0) / c.reviewTimes.length).toFixed(1))
        : 0,
      prs: c.prs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), // Sort by date, newest first
      weeklyData: c.weeklyData, // Include weekly data for filtering
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

    // Group PRs by repository for activity feed
    const recentPRsByRepo = {};
    repositories.forEach(repo => {
      recentPRsByRepo[repo.repo] = metrics.allPRs
        .filter(pr => pr.repository === repo.repo)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5); // Top 5 most recent PRs per repo
    });

    // Format project work data
    const projectWorkData = Object.values(metrics.projectWork)
      .sort((a, b) => b.prCount - a.prCount)
      .slice(0, 10); // Top 10 projects

    // Format epic work data
    const epicWorkData = Object.values(metrics.epicWork)
      .sort((a, b) => b.prCount - a.prCount)
      .slice(0, 15); // Top 15 epics

    return {
      contributors,
      repositories,
      weeklyData,
      prSizeDistribution,
      reviewTimeData,
      recentPRsByRepo,
      projectWorkData,
      epicWorkData,
    };
  }

  formatWeekLabel(weekKey) {
    // weekKey is in format YYYY-MM-DD (Monday of the week)
    const date = new Date(weekKey);
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
  }
}

export default GitHubAPI;
