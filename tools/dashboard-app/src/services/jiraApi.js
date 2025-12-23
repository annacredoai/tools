class JiraAPI {
  constructor(url, email, token) {
    this.url = url;
    this.email = email;
    this.token = token;
    // Use proxy in development to avoid CORS issues
    this.baseUrl = import.meta.env.DEV ? '/api/jira' : url;
    this.headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Atlassian-Token': 'no-check', // Bypass XSRF check for API calls
    };
    // Only add auth headers when not using proxy (production)
    if (!import.meta.env.DEV) {
      this.headers['Authorization'] = `Basic ${btoa(`${email}:${token}`)}`;
    }
    this.cache = {}; // Cache issue types to avoid repeated API calls
  }

  async getIssue(issueKey) {
    try {
      // Check cache first
      if (this.cache[issueKey]) {
        return this.cache[issueKey];
      }

      const response = await fetch(`${this.baseUrl}/rest/api/3/issue/${issueKey}?fields=issuetype,summary`, {
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

      console.log(`[JIRA] Fetching ${uncachedKeys.length} uncached tickets using POST /search/jql...`);

      // Use POST to /rest/api/3/search/jql (same as working Python script)
      const jql = `key in (${uncachedKeys.join(',')})`;

      const payload = {
        jql: jql,
        maxResults: 100,
        fields: ['issuetype', 'summary']
      };

      console.log('[JIRA] POST payload:', payload);

      const response = await fetch(
        `${this.baseUrl}/rest/api/3/search/jql`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(payload),
          credentials: 'omit'  // Don't send cookies - prevents XSRF issues
        }
      );

      console.log(`[JIRA] POST response:`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[JIRA] Error response body:`, errorText);
        throw new Error(`JIRA API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`[JIRA] Successfully fetched ${data.issues?.length || 0} issues`);

      // Cache all results
      data.issues.forEach(issue => {
        const issueInfo = {
          key: issue.key,
          summary: issue.fields.summary,
          issueType: issue.fields.issuetype.name,
          isEpic: issue.fields.issuetype.name.toLowerCase() === 'epic',
        };
        this.cache[issue.key] = issueInfo;
        console.log(`[JIRA] Cached ${issue.key}: ${issue.fields.summary}`);
      });

      // Return all requested issues (including previously cached ones)
      return uniqueKeys.map(key => this.cache[key]).filter(Boolean);
    } catch (error) {
      console.error('[JIRA] Error in getIssuesInBatch:', error);
      return [];
    }
  }

  isConfigured() {
    return !!(this.url && this.email && this.token);
  }
}

export default JiraAPI;
