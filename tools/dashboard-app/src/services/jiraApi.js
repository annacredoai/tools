class JiraAPI {
  constructor(url, email, token) {
    this.url = url;
    this.email = email;
    this.token = token;
    this.headers = {
      'Authorization': `Basic ${btoa(`${email}:${token}`)}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    this.cache = {}; // Cache issue types to avoid repeated API calls
  }

  async getIssue(issueKey) {
    try {
      // Check cache first
      if (this.cache[issueKey]) {
        return this.cache[issueKey];
      }

      const response = await fetch(`${this.url}/rest/api/3/issue/${issueKey}?fields=issuetype,summary`, {
        headers: this.headers,
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`JIRA issue ${issueKey} not found`);
          return null;
        }
        throw new Error(`JIRA API error: ${response.status}`);
      }

      const data = await response.json();
      const issueInfo = {
        key: data.key,
        summary: data.fields.summary,
        issueType: data.fields.issuetype.name,
        isEpic: data.fields.issuetype.name.toLowerCase() === 'epic',
      };

      // Cache the result
      this.cache[issueKey] = issueInfo;
      return issueInfo;
    } catch (error) {
      console.error(`Error fetching JIRA issue ${issueKey}:`, error);
      return null;
    }
  }

  async getIssuesInBatch(issueKeys) {
    try {
      // Remove duplicates
      const uniqueKeys = [...new Set(issueKeys)];

      // Filter out already cached issues
      const uncachedKeys = uniqueKeys.filter(key => !this.cache[key]);

      if (uncachedKeys.length === 0) {
        // All issues are cached
        return uniqueKeys.map(key => this.cache[key]).filter(Boolean);
      }

      // JIRA allows searching for multiple issues using JQL
      const jql = `key in (${uncachedKeys.join(',')})`;
      const response = await fetch(
        `${this.url}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=issuetype,summary&maxResults=100`,
        { headers: this.headers }
      );

      if (!response.ok) {
        throw new Error(`JIRA API error: ${response.status}`);
      }

      const data = await response.json();

      // Cache all results
      data.issues.forEach(issue => {
        const issueInfo = {
          key: issue.key,
          summary: issue.fields.summary,
          issueType: issue.fields.issuetype.name,
          isEpic: issue.fields.issuetype.name.toLowerCase() === 'epic',
        };
        this.cache[issue.key] = issueInfo;
      });

      // Return all requested issues (including previously cached ones)
      return uniqueKeys.map(key => this.cache[key]).filter(Boolean);
    } catch (error) {
      console.error('Error fetching JIRA issues in batch:', error);
      return [];
    }
  }

  isConfigured() {
    return !!(this.url && this.email && this.token);
  }
}

export default JiraAPI;
