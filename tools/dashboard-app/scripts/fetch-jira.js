#!/usr/bin/env node
/**
 * Fetch JIRA ticket data and save to JSON file for the dashboard.
 * This script uses Node.js and can be integrated into the npm workflow.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const JIRA_URL = process.env.VITE_JIRA_URL || "https://credo-ai.atlassian.net";
const JIRA_EMAIL = process.env.VITE_JIRA_EMAIL || "anna@credo.ai";
const JIRA_API_TOKEN = process.env.VITE_JIRA_TOKEN;
const JIRA_PROJECT_KEY = process.env.VITE_JIRA_PROJECT_KEY || "DEV";

if (!JIRA_API_TOKEN) {
  console.error('❌ Error: VITE_JIRA_TOKEN environment variable is required');
  console.error('Please set it in your .env.local file');
  process.exit(1);
}

// Default tickets to fetch (update this list or make it dynamic)
const DEFAULT_TICKETS = [
  'DEV-3872', 'DEV-4320', 'DEV-4321', 'DEV-4065',
  'DEV-4521', 'DEV-4498', 'DEV-4233', 'DEV-4372', 'DEV-4364'
];

async function fetchAvailableFixVersions() {
  console.log(`\n🔄 Fetching available fix versions from JIRA project: ${JIRA_PROJECT_KEY}...`);

  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  const url = `${JIRA_URL}/rest/api/3/project/${JIRA_PROJECT_KEY}/versions`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'X-Atlassian-Token': 'no-check'
      }
    });

    if (!response.ok) {
      throw new Error(`JIRA API error: ${response.status} ${response.statusText}`);
    }

    const versions = await response.json();

    // Filter to get only versions that match the pattern (v25.0, v24.0, etc.)
    // Sort by version number descending (newest first)
    const releaseVersions = versions
      .filter(v => v.name && v.name.match(/^v\d+\.\d+$/))
      .map(v => v.name)
      .sort((a, b) => {
        const aNum = parseFloat(a.substring(1));
        const bNum = parseFloat(b.substring(1));
        return bNum - aNum;
      })
      .slice(0, 15); // Get last 15 versions

    console.log(`✅ Found ${releaseVersions.length} release versions:`, releaseVersions.join(', '));
    return releaseVersions;

  } catch (error) {
    console.error(`❌ Error fetching fix versions:`, error.message);
    console.warn(`⚠️  Falling back to recent versions...`);
    // Fallback to recent versions if API fails
    return ['v26.0', 'v25.0', 'v24.0', 'v23.0'];
  }
}

async function fetchJiraTickets(ticketKeys) {
  console.log(`\n🔄 Fetching ${ticketKeys.length} JIRA tickets...`);

  const jql = `key in (${ticketKeys.join(',')})`;
  const payload = {
    jql,
    maxResults: 100,
    fields: ['issuetype', 'summary', 'status']
  };

  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  const url = `${JIRA_URL}/rest/api/3/search/jql`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Atlassian-Token': 'no-check'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`JIRA API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const issues = [];

    for (const issue of data.issues || []) {
      issues.push({
        key: issue.key,
        summary: issue.fields.summary,
        issueType: issue.fields.issuetype.name,
        status: issue.fields.status.name,
        isEpic: issue.fields.issuetype.name.toLowerCase() === 'epic'
      });
    }

    console.log(`✅ Successfully fetched ${issues.length} tickets`);
    return issues;

  } catch (error) {
    console.error(`❌ Error fetching JIRA issues:`, error.message);
    return [];
  }
}

async function fetchJiraTicketsByFixVersion(fixVersion) {
  console.log(`\n🔄 Fetching JIRA tickets for fixVersion: ${fixVersion}...`);

  const jql = `fixVersion = "${fixVersion}"`;
  const payload = {
    jql,
    maxResults: 100,
    fields: ['issuetype', 'summary', 'status', 'assignee', 'priority']
  };

  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  const url = `${JIRA_URL}/rest/api/3/search/jql`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Atlassian-Token': 'no-check'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`JIRA API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const issues = [];

    for (const issue of data.issues || []) {
      issues.push({
        key: issue.key,
        summary: issue.fields.summary,
        issueType: issue.fields.issuetype.name,
        status: issue.fields.status.name,
        isEpic: issue.fields.issuetype.name.toLowerCase() === 'epic',
        assignee: issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned',
        priority: issue.fields.priority ? issue.fields.priority.name : 'None'
      });
    }

    console.log(`✅ Found ${issues.length} tickets for ${fixVersion}`);
    return issues;

  } catch (error) {
    console.error(`❌ Error fetching JIRA issues for ${fixVersion}:`, error.message);
    return [];
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('📊 JIRA Data Fetcher for Engineering Dashboard');
  console.log('='.repeat(60));

  const publicDir = join(__dirname, '..', 'public');
  const outputFile = join(publicDir, 'jira-data.json');

  // Ensure public directory exists
  try {
    mkdirSync(publicDir, { recursive: true });
  } catch (err) {
    // Directory already exists
  }

  // Fetch tickets
  const issues = await fetchJiraTickets(DEFAULT_TICKETS);

  if (issues.length === 0) {
    console.warn('⚠️  No issues fetched - dashboard will show tickets without summaries');
  }

  // Prepare output
  const output = {
    tickets: {},
    lastUpdated: new Date().toISOString(),
    ticketCount: issues.length
  };

  for (const issue of issues) {
    output.tickets[issue.key] = issue;
  }

  // Save to file
  writeFileSync(outputFile, JSON.stringify(output, null, 2));

  console.log(`\n✅ Saved ${issues.length} tickets to ${outputFile}`);
  console.log(`📅 Last updated: ${output.lastUpdated}`);

  // Fetch available fix versions from JIRA
  console.log('\n' + '='.repeat(60));
  console.log('🏷️  Fetching tickets by release version...');
  console.log('='.repeat(60));

  const releaseVersions = await fetchAvailableFixVersions();

  const releaseTickets = {};
  for (const version of releaseVersions) {
    const tickets = await fetchJiraTicketsByFixVersion(version);
    releaseTickets[version] = tickets;
  }

  // Create summaries per release
  const releaseSummaries = {};
  for (const [version, tickets] of Object.entries(releaseTickets)) {
    const summary = {
      totalTickets: tickets.length,
      byType: {},
      byStatus: {}
    };

    tickets.forEach(ticket => {
      // Count by issue type
      const type = ticket.issueType || 'Unknown';
      summary.byType[type] = (summary.byType[type] || 0) + 1;

      // Count by status
      const status = ticket.status || 'Unknown';
      summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
    });

    releaseSummaries[version] = summary;
  }

  // Save release tickets to separate file
  const releaseOutputFile = join(publicDir, 'jira-release-tickets.json');
  const releaseOutput = {
    releases: releaseTickets,
    summaries: releaseSummaries,
    lastUpdated: new Date().toISOString(),
    releaseCount: releaseVersions.length,
    totalTickets: Object.values(releaseTickets).reduce((sum, tickets) => sum + tickets.length, 0)
  };

  writeFileSync(releaseOutputFile, JSON.stringify(releaseOutput, null, 2));

  console.log(`\n✅ Saved release tickets to ${releaseOutputFile}`);
  console.log(`📊 Total releases: ${releaseOutput.releaseCount}`);
  console.log(`📊 Total tickets across all releases: ${releaseOutput.totalTickets}`);

  // Print summary for recent releases
  console.log('\n' + '='.repeat(60));
  console.log('📋 Release Summaries (Top 5)');
  console.log('='.repeat(60));

  const topReleases = Object.keys(releaseSummaries).slice(0, 5);
  for (const version of topReleases) {
    const summary = releaseSummaries[version];
    console.log(`\n${version}: ${summary.totalTickets} total tickets`);

    // Show breakdown by type
    const typeBreakdown = Object.entries(summary.byType)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ');
    console.log(`  Types: ${typeBreakdown}`);

    // Show breakdown by status
    const statusBreakdown = Object.entries(summary.byStatus)
      .map(([status, count]) => `${status}: ${count}`)
      .join(', ');
    console.log(`  Status: ${statusBreakdown}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n✨ Dashboard is ready! Refresh your browser to see updates.\n');
}

main().catch(console.error);
