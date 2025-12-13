import * as vscode from 'vscode';
import { CredentialStore } from './confluence/auth/credential-store';
import { fetchByUrl, configureConnection, searchDocuments, syncDocument, syncAllDocuments } from './commands';
import { DocumentTreeProvider } from './views';

// Tree provider instance for refreshing
let documentTreeProvider: DocumentTreeProvider;

/**
 * Extension activation.
 * Called when the extension is first activated.
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('DocFetch extension is now active');

  // Initialize credential store
  CredentialStore.initialize(context);

  // Initialize document tree view
  documentTreeProvider = new DocumentTreeProvider();
  const treeView = vscode.window.createTreeView('docfetch.documents', {
    treeDataProvider: documentTreeProvider,
    showCollapseAll: true,
  });

  // Register commands with tree refresh
  const commands = [
    vscode.commands.registerCommand('docfetch.fetchByUrl', async () => {
      await fetchByUrl();
      documentTreeProvider.refresh();
    }),
    vscode.commands.registerCommand('docfetch.configureConnection', configureConnection),
    vscode.commands.registerCommand('docfetch.searchDocuments', async () => {
      await searchDocuments();
      documentTreeProvider.refresh();
    }),
    vscode.commands.registerCommand('docfetch.syncDocument', async () => {
      await syncDocument();
      documentTreeProvider.refresh();
    }),
    vscode.commands.registerCommand('docfetch.syncAllDocuments', async () => {
      await syncAllDocuments();
      documentTreeProvider.refresh();
    }),
    vscode.commands.registerCommand('docfetch.openInConfluence', openInConfluence),
    vscode.commands.registerCommand('docfetch.refreshDocuments', () => {
      documentTreeProvider.refresh();
    }),
  ];

  // Watch for changes in .docs directory
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceFolder, '.docs/**/*.md')
    );
    watcher.onDidCreate(() => documentTreeProvider.refresh());
    watcher.onDidDelete(() => documentTreeProvider.refresh());
    watcher.onDidChange(() => documentTreeProvider.refresh());
    context.subscriptions.push(watcher);
  }

  // Add all to subscriptions for cleanup
  context.subscriptions.push(treeView, ...commands);

  // Show welcome message on first activation
  showWelcomeMessage(context);
}

/**
 * Extension deactivation.
 * Called when the extension is deactivated.
 */
export function deactivate(): void {
  console.log('DocFetch extension deactivated');
}

/**
 * Open the current document in Confluence.
 */
async function openInConfluence(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('DocFetch: No document is currently open.');
    return;
  }

  const content = editor.document.getText();

  // Extract Confluence URL from frontmatter
  const urlMatch = content.match(/confluence_url:\s*["']?([^"'\n]+)["']?/);
  if (!urlMatch) {
    vscode.window.showWarningMessage(
      'DocFetch: Could not find Confluence URL in this document.'
    );
    return;
  }

  const url = urlMatch[1].trim();
  vscode.env.openExternal(vscode.Uri.parse(url));
}

/**
 * Show welcome message on first activation.
 */
async function showWelcomeMessage(context: vscode.ExtensionContext): Promise<void> {
  const hasShownWelcome = context.globalState.get<boolean>('docfetch.hasShownWelcome', false);

  if (!hasShownWelcome) {
    const action = await vscode.window.showInformationMessage(
      'DocFetch: Welcome! Configure a Confluence connection to get started.',
      'Configure Now',
      'Later'
    );

    if (action === 'Configure Now') {
      await configureConnection();
    }

    await context.globalState.update('docfetch.hasShownWelcome', true);
  }
}
