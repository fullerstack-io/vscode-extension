import * as vscode from 'vscode';
import { selectConnection, getConnections } from './configureConnection';
import { ConfluenceClientFactory } from '../confluence/clients/client-factory';
import { CredentialStore } from '../confluence/auth/credential-store';
import { DocsManager } from '../storage/docs-manager';
import { SearchResult, ConnectionConfig, AuthenticationError, SortBy } from '../confluence/types';

interface SearchQuickPickItem extends vscode.QuickPickItem {
  result?: SearchResult;
  action?: 'load-more' | 'no-results';
}

// Sort button interface with sort type identifier
interface SortButton extends vscode.QuickInputButton {
  sortBy: SortBy;
}

// Create all sort buttons (must be called after vscode is ready)
function createSortButtons(currentSort: SortBy): SortButton[] {
  const buttons: { sortBy: SortBy; icon: string; label: string }[] = [
    { sortBy: 'relevance', icon: 'search', label: 'Relevance' },
    { sortBy: 'lastModified', icon: 'calendar', label: 'Date' },
    { sortBy: 'title', icon: 'case-sensitive', label: 'Title' },
  ];

  return buttons.map(({ sortBy, icon, label }) => ({
    sortBy,
    iconPath: new vscode.ThemeIcon(sortBy === currentSort ? `${icon}` : icon),
    tooltip: sortBy === currentSort ? `Sorted by: ${label}` : `Sort by: ${label}`,
  }));
}

/**
 * Debounce helper for search input.
 */
function debounce<T extends (...args: string[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | undefined;
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Format a date for display.
 */
function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Convert search results to QuickPick items.
 */
function resultsToQuickPickItems(
  results: SearchResult[],
  hasMore: boolean
): SearchQuickPickItem[] {
  if (results.length === 0) {
    return [
      {
        label: '$(info) No results found',
        description: 'Try a different search term',
        action: 'no-results',
        alwaysShow: true,
      },
    ];
  }

  const items: SearchQuickPickItem[] = results.map((result) => ({
    label: result.title,
    description: `$(folder) ${result.spaceKey}`,
    detail: `${result.excerpt.substring(0, 100)}${result.excerpt.length > 100 ? '...' : ''} - ${formatDate(result.lastModified)}`,
    result,
    alwaysShow: true, // Prevent local filtering from hiding server results
  }));

  if (hasMore) {
    items.push({
      label: '$(ellipsis) Load more results...',
      description: '',
      action: 'load-more',
      alwaysShow: true,
    });
  }

  return items;
}

/**
 * Command to search Confluence documents with live QuickPick UI.
 */
export async function searchDocuments(): Promise<void> {
  // Ensure we have a workspace
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('DocFetch: Please open a workspace folder first.');
    return;
  }

  // Ensure we have a connection
  const connection = await selectConnection();
  if (!connection) {
    return;
  }

  // Initialize client
  const credentialStore = CredentialStore.getInstance();
  const { client, authProvider } = ConfluenceClientFactory.create(connection, credentialStore);

  // Ensure we're authenticated
  if (!(await authProvider.isAuthenticated())) {
    const authenticated = await authProvider.authenticate();
    if (!authenticated) {
      vscode.window.showErrorMessage('DocFetch: Authentication cancelled.');
      return;
    }
  }

  // Create QuickPick
  const quickPick = vscode.window.createQuickPick<SearchQuickPickItem>();
  quickPick.placeholder = 'Type to search documents...';
  // Disable local filtering - we rely on server-side search
  // Setting these to false prevents VS Code from hiding results
  // that don't match the typed text exactly
  quickPick.matchOnDescription = false;
  quickPick.matchOnDetail = false;

  // Track current search state
  let currentQuery = '';
  let currentResults: SearchResult[] = [];
  let currentCursor: string | undefined;
  let hasMore = false;
  let isLoading = false;
  let currentSortBy: SortBy = 'relevance';

  // Helper to update title with current sort
  const updateTitle = () => {
    const sortLabel = currentSortBy === 'relevance' ? 'Relevance'
      : currentSortBy === 'lastModified' ? 'Date'
      : 'Title';
    quickPick.title = `Search Confluence (${connection.name}) - Sort: ${sortLabel}`;
  };

  // Set up sort buttons - show all three so user can pick
  const updateButtons = () => {
    quickPick.buttons = createSortButtons(currentSortBy);
  };
  updateButtons();
  updateTitle();

  /**
   * Perform search and update QuickPick.
   */
  const performSearch = async (query: string, cursor?: string): Promise<void> => {
    if (query.length < 2) {
      quickPick.items = [];
      currentResults = [];
      currentCursor = undefined;
      hasMore = false;
      return;
    }

    isLoading = true;
    quickPick.busy = true;

    try {
      const response = await client.search(query, { cursor, limit: 20, sortBy: currentSortBy });

      if (cursor) {
        // Appending to existing results
        currentResults = [...currentResults, ...response.results];
      } else {
        // New search
        currentResults = response.results;
      }

      currentCursor = response.cursor;
      hasMore = response.hasMore;

      quickPick.items = resultsToQuickPickItems(currentResults, hasMore);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        quickPick.items = [
          {
            label: '$(error) Authentication failed',
            description: 'Please reconfigure your connection',
            action: 'no-results',
          },
        ];
      } else {
        quickPick.items = [
          {
            label: '$(error) Search failed',
            description: error instanceof Error ? error.message : 'Unknown error',
            action: 'no-results',
          },
        ];
      }
    } finally {
      isLoading = false;
      quickPick.busy = false;
    }
  };

  // Debounced search
  const debouncedSearch = debounce((query: string) => {
    currentQuery = query;
    performSearch(query);
  }, 300);

  // Handle input changes
  quickPick.onDidChangeValue((value) => {
    if (value !== currentQuery) {
      debouncedSearch(value);
    }
  });

  // Handle sort button click
  quickPick.onDidTriggerButton((button) => {
    const sortButton = button as SortButton;
    if (sortButton.sortBy && sortButton.sortBy !== currentSortBy) {
      currentSortBy = sortButton.sortBy;

      // Update buttons and title
      updateButtons();
      updateTitle();

      // Re-run search with new sort if we have a query
      if (currentQuery.length >= 2) {
        currentResults = [];
        currentCursor = undefined;
        performSearch(currentQuery);
      }
    }
  });

  // Handle selection
  quickPick.onDidAccept(async () => {
    const selected = quickPick.selectedItems[0];
    if (!selected) return;

    if (selected.action === 'load-more') {
      // Load more results
      if (currentCursor && !isLoading) {
        await performSearch(currentQuery, currentCursor);
      }
      return;
    }

    if (selected.action === 'no-results') {
      return;
    }

    if (selected.result) {
      // Hide quickpick while fetching
      quickPick.hide();

      // Fetch and save the selected document
      await fetchAndSaveDocument(
        selected.result,
        connection,
        workspaceFolder,
        credentialStore
      );
    }
  });

  // Handle close
  quickPick.onDidHide(() => {
    quickPick.dispose();
  });

  quickPick.show();
}

/**
 * Fetch and save a document from search result.
 */
async function fetchAndSaveDocument(
  searchResult: SearchResult,
  connection: ConnectionConfig,
  workspaceFolder: vscode.WorkspaceFolder,
  credentialStore: CredentialStore
): Promise<void> {
  const docsManager = new DocsManager(workspaceFolder.uri.fsPath);

  // Select category
  const categories = docsManager.getCategories();
  const categoryChoice = await vscode.window.showQuickPick(
    categories.map((c) => ({
      label: c.key,
      description: c.label,
    })),
    {
      title: 'Select Category',
      placeHolder: 'Choose where to save the document',
      ignoreFocusOut: true,
    }
  );

  if (!categoryChoice) {
    return;
  }

  const category = categoryChoice.label;

  // Fetch the full document
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `DocFetch: Fetching "${searchResult.title}"...`,
      cancellable: false,
    },
    async (progress) => {
      try {
        const { client } = ConfluenceClientFactory.create(connection, credentialStore);

        progress.report({ message: 'Fetching from Confluence...' });
        const document = await client.getDocumentById(searchResult.id);

        // Check if document already exists
        const existing = await docsManager.getDocumentByConfluenceId(document.id);

        if (existing) {
          const action = await vscode.window.showWarningMessage(
            `Document "${document.title}" already exists. Update it?`,
            'Update',
            'Cancel'
          );

          if (action !== 'Update') {
            return;
          }

          progress.report({ message: 'Updating document...' });
          await docsManager.updateDocument(document, existing);

          vscode.window.showInformationMessage(`DocFetch: Updated "${document.title}"`);
        } else {
          progress.report({ message: 'Saving document...' });
          const metadata = await docsManager.saveDocument(document, connection.id, category);

          // Open the saved file
          const filePath = vscode.Uri.file(
            `${workspaceFolder.uri.fsPath}/.docs/${metadata.relativePath}`
          );

          const openDoc = await vscode.window.showInformationMessage(
            `DocFetch: Saved "${document.title}"`,
            'Open File'
          );

          if (openDoc === 'Open File') {
            const doc = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(doc);
          }
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `DocFetch: Failed to fetch document. ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  );
}
