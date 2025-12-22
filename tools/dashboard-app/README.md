# Engineering Dashboard

A real-time engineering metrics dashboard that pulls data from GitHub to visualize team productivity, code review analytics, and pull request statistics.

## Features

- **Top Contributors**: View PR counts, average PR size, and review times per developer
  - Click any contributor to see their individual PRs breakdown
- **Weekly PR Activity**: Track PRs created, merged, and closed over time
- **PR Size Distribution**: Understand the distribution of PR sizes across your organization
- **Review Time Analytics**: Monitor how quickly PRs are getting reviewed
- **Repository Activity**: See which repositories have the most activity
- **Recent Activity Feed**: View the latest PRs per repository
- **Time Range Filtering**: View metrics for the last 7, 30, 90 days, or 1 year
- **Real GitHub Data**: Automatically fetches and updates from your GitHub organization
- **Bot Filtering**: Automatically excludes bot accounts (dependabot, renovate, etc.)
- **Optimized Performance**: Uses GitHub GraphQL API for efficient data fetching

## Prerequisites

- Node.js 16+ and npm
- A GitHub Personal Access Token with the following scopes:
  - `repo` (Full control of private repositories)
  - `read:org` (Read org and team membership, read org projects)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create GitHub Personal Access Token

1. Go to [GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Give it a descriptive name (e.g., "Engineering Dashboard")
4. Select the following scopes:
   - ✅ `repo` (all repo permissions)
   - ✅ `read:org`
5. Click "Generate token"
6. **Copy the token immediately** (you won't be able to see it again)

### 3. Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your configuration:

```env
VITE_GITHUB_TOKEN=ghp_your_token_here
VITE_GITHUB_ORG=your-org-name
VITE_GITHUB_REPOS=repo1,repo2,repo3
```

- `VITE_GITHUB_TOKEN`: Your GitHub Personal Access Token
- `VITE_GITHUB_ORG`: Your GitHub organization name (e.g., "facebook", "google")
- `VITE_GITHUB_REPOS`: (Optional) Comma-separated list of specific repos to track. Leave empty to automatically track the top 10 most recently active repositories. **Tip**: Specifying repos significantly improves performance and reduces loading time.

### 4. Run the Application

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Usage

- **Time Range Filter**: Select different time ranges (7d, 30d, 90d, 1y) to see metrics for different periods
- **Automatic Refresh**: The dashboard fetches fresh data whenever you change the time range
- **Loading States**: The dashboard shows a progress bar while fetching data from GitHub
- **Error Handling**: If there's an issue with the API or configuration, you'll see an error message with a retry button
- **Contributor Details**: Click on any contributor in the table to see a detailed breakdown of their PRs
- **Recent Activity**: Scroll down to see the latest PRs for each repository

## Development

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

## How It Works

The dashboard uses the GitHub GraphQL API to efficiently fetch data:

1. Fetch repositories in your organization (or use the specified list)
2. Use GraphQL to batch-fetch pull requests with reviews in a single query per repository
3. Process repos in parallel (batches of 3) to speed up data collection
4. Calculate metrics like:
   - PR counts per contributor
   - Average PR size (lines changed)
   - Review time (time from PR creation to first review)
   - Weekly PR activity (created, merged, closed)
   - PR size distribution
5. Cache results in browser storage for 10 minutes
6. Display the data in interactive charts and tables

## Performance Optimizations

- **GraphQL API**: Reduces API calls from ~500 to ~10-20 by batching PR and review data
- **Parallel Processing**: Fetches multiple repositories concurrently in batches
- **Smart Defaults**: Auto-selects top 10 active repos if none specified
- **Caching**: Stores fetched data for 10 minutes to avoid redundant API calls
- **Progress Tracking**: Shows real-time progress during data fetching
- **Bot Filtering**: Excludes automated accounts to focus on human contributors

## Rate Limits

The GitHub API has rate limits:
- **Authenticated requests**: 5,000 requests per hour
- The dashboard typically uses 10-30 requests per data fetch (depending on number of repos and PR count)
- With caching enabled, you can view the dashboard multiple times within the cache window without additional API calls

**Tip**: Specifying repositories in `VITE_GITHUB_REPOS` significantly reduces API usage and loading time.

## Technologies

- **React**: UI framework
- **Vite**: Build tool and dev server
- **Recharts**: Charting library
- **Lucide React**: Icon library
- **Tailwind CSS**: Styling
- **GitHub REST API**: Data source

## Security Notes

- **Never commit your `.env.local` file** (it's already in `.gitignore`)
- Keep your GitHub token secure and don't share it
- Use a token with minimal required permissions
- Regularly rotate your tokens
