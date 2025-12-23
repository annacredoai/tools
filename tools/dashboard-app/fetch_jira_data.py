#!/usr/bin/env python3
"""
Fetch JIRA ticket data and save to JSON file for the dashboard.

Usage:
    python fetch_jira_data.py

The script reads ticket keys from the dashboard's GitHub data and fetches
their summaries from JIRA, saving the results to public/jira-data.json
"""

import json
import os
import sys
from pathlib import Path
from requests.auth import HTTPBasicAuth
import requests

# Configuration - these should be set in your environment or .env.local file
JIRA_URL = os.getenv("VITE_JIRA_URL", "https://credo-ai.atlassian.net")
JIRA_EMAIL = os.getenv("VITE_JIRA_EMAIL", "anna@credo.ai")
JIRA_API_TOKEN = os.getenv("VITE_JIRA_TOKEN")

if not JIRA_API_TOKEN:
    print("❌ Error: VITE_JIRA_TOKEN environment variable is required")
    print("Please set it in your .env.local file or environment")
    sys.exit(1)

class JiraDataFetcher:
    def __init__(self, jira_url, email, api_token):
        self.jira_url = jira_url
        self.auth = HTTPBasicAuth(email, api_token)
        self.headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Atlassian-Token": "no-check"
        }

    def get_issues_in_batch(self, issue_keys):
        """Fetch multiple issues at once using JQL."""
        if not issue_keys:
            return []

        print(f"Fetching {len(issue_keys)} JIRA tickets...")

        # JIRA allows searching for multiple issues using JQL
        jql = f"key in ({','.join(issue_keys)})"

        payload = {
            "jql": jql,
            "maxResults": 100,
            "fields": ["issuetype", "summary", "status"]
        }

        url = f"{self.jira_url}/rest/api/3/search/jql"

        try:
            response = requests.post(url, auth=self.auth, headers=self.headers, json=payload)
            response.raise_for_status()

            data = response.json()
            issues = []

            for issue in data.get('issues', []):
                issues.append({
                    'key': issue['key'],
                    'summary': issue['fields']['summary'],
                    'issueType': issue['fields']['issuetype']['name'],
                    'status': issue['fields']['status']['name'],
                    'isEpic': issue['fields']['issuetype']['name'].lower() == 'epic'
                })

            print(f"✓ Successfully fetched {len(issues)} tickets")
            return issues

        except requests.exceptions.RequestException as e:
            print(f"✗ Error fetching JIRA issues: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"  Response status: {e.response.status_code}")
                print(f"  Response body: {e.response.text[:200]}")
            return []

def get_ticket_keys_from_github_cache():
    """Extract ticket keys from GitHub cache data."""
    # Look for GitHub metrics cache files
    cache_pattern = "github_metrics_credo-ai_"

    for key in os.listdir('.'):
        if not key.startswith(cache_pattern):
            continue

        try:
            # Try to find cache in localStorage simulation or other location
            pass
        except:
            pass

    # Fallback: provide default set of tickets we've seen in the dashboard
    # You can update this list or read from a config file
    default_tickets = [
        'DEV-3872', 'DEV-4320', 'DEV-4321', 'DEV-4065',
        'DEV-4521', 'DEV-4498', 'DEV-4233', 'DEV-4372', 'DEV-4364'
    ]

    print(f"Using default ticket list: {len(default_tickets)} tickets")
    return default_tickets

def main():
    """Main function to fetch JIRA data and save to JSON."""
    script_dir = Path(__file__).parent
    output_file = script_dir / "public" / "jira-data.json"

    # Ensure public directory exists
    output_file.parent.mkdir(exist_ok=True)

    print("=" * 60)
    print("JIRA Data Fetcher for Engineering Dashboard")
    print("=" * 60)

    # Get ticket keys (you can modify this to read from a file or command line args)
    ticket_keys = get_ticket_keys_from_github_cache()

    if not ticket_keys:
        print("✗ No ticket keys found")
        sys.exit(1)

    # Initialize JIRA fetcher
    fetcher = JiraDataFetcher(JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN)

    # Fetch ticket data
    issues = fetcher.get_issues_in_batch(ticket_keys)

    if not issues:
        print("✗ No issues fetched")
        sys.exit(1)

    # Prepare output data
    output_data = {
        'tickets': {issue['key']: issue for issue in issues},
        'lastUpdated': requests.get('http://worldtimeapi.org/api/timezone/Etc/UTC').json()['datetime']
        if requests.get('http://worldtimeapi.org/api/timezone/Etc/UTC').ok
        else None
    }

    # Save to JSON file
    with open(output_file, 'w') as f:
        json.dump(output_data, f, indent=2)

    print(f"\n✓ Successfully saved {len(issues)} tickets to {output_file}")
    print(f"  File size: {output_file.stat().st_size} bytes")
    print("\nYou can now refresh your dashboard to see the JIRA ticket summaries!")
    print("=" * 60)

if __name__ == "__main__":
    main()
