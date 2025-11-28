import * as vscode from 'vscode';
import { CredentialStore } from './confluence/auth/credential-store';
import { fetchByUrl, configureConnection } from './commands';

/**
 * Extension activation.
 * Called when the extension is first activated.
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('DocFetch extension is now active');

  // Initialize credential store
  CredentialStore.initialize(context);

  // Register commands
  const commands = [
    vscode.commands.registerCommand('docfetch.fetchByUrl', fetchByUrl),
    vscode.commands.registerCommand('docfetch.configureConnection', configureConnection),
    vscode.commands.registerCommand('docfetch.searchDocuments', searchDocuments),
    vscode.commands.registerCommand('docfetch.syncDocument', syncDocument),
    vscode.commands.registerCommand('docfetch.syncAllDocuments', syncAllDocuments),
    vscode.commands.registerCommand('docfetch.openInConfluence', openInConfluence),
  ];

  // Add all commands to subscriptions for cleanup
  context.subscriptions.push(...commands);

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
 * Search Confluence documents.
 * TODO: Implement search with QuickPick UI
 */
async function searchDocuments(): Promise<void> {
  vscode.window.showInformationMessage(
    'DocFetch: Search functionality coming soon! Use "Fetch by URL" for now.'
  );
}

/**
 * Sync the currently open document.
 * TODO: Implement document sync
 */
async function syncDocument(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('DocFetch: No document is currently open.');
    return;
  }

  const filePath = editor.document.uri.fsPath;
  if (!filePath.includes('.docs')) {
    vscode.window.showWarningMessage('DocFetch: This file is not a DocFetch document.');
    return;
  }

  vscode.window.showInformationMessage(
    'DocFetch: Document sync coming soon!'
  );
}

/**
 * Sync all documents.
 * TODO: Implement bulk sync
 */
async function syncAllDocuments(): Promise<void> {
  vscode.window.showInformationMessage(
    'DocFetch: Bulk sync coming soon!'
  );
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
