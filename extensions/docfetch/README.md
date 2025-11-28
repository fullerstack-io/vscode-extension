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

### Configure a Connection

1. Open the command palette
2. Run `DocFetch: Configure Confluence Connection`
3. Follow the prompts to set up your connection

## Authentication

### Confluence Cloud

Use an API token from [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens).

### Confluence Data Center / Server

Use a Personal Access Token (PAT) from your Confluence user settings.

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
