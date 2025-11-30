# DocFetch

Fetch Confluence documents as Markdown for local reference and context.

## Features

- **Fetch by URL**: Paste a Confluence page URL to fetch and convert to Markdown
- **Search Documents**: Search your Confluence spaces and select documents to fetch
- **Sync Documents**: Keep your local copies up to date with Confluence
- **Multiple Connections**: Support for both Confluence Cloud and Data Center

## Installation

1. Install the extension from the VS Code marketplace
2. Run `DocFetch: Configure Confluence Connection` from the command palette
3. Enter your Confluence URL and credentials

## Usage

### Fetch a Document by URL

1. Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run `DocFetch: Fetch Document by URL`
3. Paste the Confluence page URL
4. Select a category for the document
5. The document will be saved to `.docs/<category>/`

### Search Documents

1. Open the command palette
2. Run `DocFetch: Search Confluence Documents`
3. Type your search query
4. Sort results by Relevance, Date, or Title using the buttons
5. Select a document to fetch

### Configure a Connection

1. Open the command palette
2. Run `DocFetch: Configure Confluence Connection`
3. Follow the prompts to set up your connection

## Authentication

DocFetch supports three authentication methods:

### API Token (Confluence Cloud)

Use an API token from [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens).

### OAuth 2.0 (Confluence Cloud)

For OAuth 2.0 authentication, you need to create an OAuth app at [developer.atlassian.com](https://developer.atlassian.com/console/myapps/):

1. Create a new OAuth 2.0 integration
2. Add the callback URL: `vscode://fullerstack-io.docfetch/oauth/callback`
3. Configure the required scopes (see below)
4. Copy the Client ID to VS Code settings (`docfetch.oauth.clientId`)

### Personal Access Token (Confluence Data Center / Server)

Use a Personal Access Token (PAT) from your Confluence user settings.

## Required Confluence Permissions

DocFetch requires read-only access to your Confluence content. When configuring OAuth 2.0 or API access, the following scopes are used:

### Classic Scopes

| Scope Name | Code | Description |
|------------|------|-------------|
| Read Confluence space summary | `read:confluence-space.summary` | Read a summary of space information without expansions |
| Read Confluence detailed content | `read:confluence-content.all` | Read all content, including content body (expansions permitted) |
| Read Confluence content summary | `read:confluence-content.summary` | Read a summary of the content without expansions |
| Search Confluence | `search:confluence` | Search Confluence content and space summaries |

### Granular Scopes

| Scope Name | Code | Description |
|------------|------|-------------|
| View detailed contents | `read:content:confluence` | View content, including pages, blogposts, custom content, attachments, comments, and content templates |
| View content details | `read:content-details:confluence` | View details regarding content and its associated properties |
| View pages | `read:page:confluence` | View page content |
| View spaces | `read:space:confluence` | View space details |

## Directory Structure

Documents are saved to a `.docs` directory in your workspace:

```
.docs/
├── api-specs/          # API specifications
├── context/            # General context documents
├── guides/             # How-to guides
└── .docfetch-metadata.json
```

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `docfetch.connections` | Configured Confluence connections | `[]` |
| `docfetch.defaultConnection` | Default connection ID | `""` |
| `docfetch.docsDirectory` | Directory for documents | `.docs` |
| `docfetch.subdirectories` | Category subdirectories | `{ "api-specs": "...", "context": "...", "guides": "..." }` |
| `docfetch.oauth.clientId` | OAuth 2.0 Client ID | `""` |

## Commands

| Command | Description |
|---------|-------------|
| `DocFetch: Fetch Document by URL` | Fetch a single document by URL |
| `DocFetch: Search Confluence Documents` | Search and fetch documents |
| `DocFetch: Sync Document` | Update the current document |
| `DocFetch: Sync All Documents` | Update all fetched documents |
| `DocFetch: Configure Confluence Connection` | Set up a connection |
| `DocFetch: Open in Confluence` | Open current doc in browser |

## Development

```bash
cd extensions/docfetch
npm install
npm run compile
```

Press F5 to launch the extension in a new VS Code window.

## License

MIT
