import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getConnection } from './configureConnection';
import { ConfluenceClientFactory } from '../confluence/clients/client-factory';
import { CredentialStore } from '../confluence/auth/credential-store';
import { DocsManager } from '../storage/docs-manager';
import { DocumentMetadata } from '../confluence/types';

/**
 * Sync the currently open document with Confluence.
 */
export async function syncDocument(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('DocFetch: No document is currently open.');
    return;
  }

  const filePath = editor.document.uri.fsPath;

  // Check if this is a DocFetch document
  if (!filePath.includes('.docs')) {
    vscode.window.showWarningMessage('DocFetch: This file is not a DocFetch document.');
    return;
  }

  // Get workspace folder
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('DocFetch: No workspace folder found.');
    return;
  }

  const docsManager = new DocsManager(workspaceFolder.uri.fsPath);

  // Get the relative path from the .docs directory
  const docsPath = path.join(workspaceFolder.uri.fsPath, '.docs');
  const relativePath = path.relative(docsPath, filePath);

  // Find metadata for this document
  const metadata = await docsManager.getDocumentByPath(relativePath);
  if (!metadata) {
    vscode.window.showWarningMessage(
      'DocFetch: Could not find metadata for this document. It may not have been fetched with DocFetch.'
    );
    return;
  }

  // Sync the single document
  await syncSingleDocument(metadata, docsManager, workspaceFolder.uri.fsPath);
}

/**
 * Sync all documents in the .docs directory.
 */
export async function syncAllDocuments(): Promise<void> {
  // Get workspace folder
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('DocFetch: No workspace folder found.');
    return;
  }

  const docsManager = new DocsManager(workspaceFolder.uri.fsPath);
  const documents = await docsManager.listDocuments();

  if (documents.length === 0) {
    vscode.window.showInformationMessage('DocFetch: No documents to sync.');
    return;
  }

  // Confirm sync
  const confirm = await vscode.window.showInformationMessage(
    `DocFetch: Sync ${documents.length} document${documents.length > 1 ? 's' : ''} with Confluence?`,
    'Sync All',
    'Cancel'
  );

  if (confirm !== 'Sync All') {
    return;
  }

  let synced = 0;
  let failed = 0;
  let skipped = 0;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'DocFetch: Syncing documents...',
      cancellable: true,
    },
    async (progress, token) => {
      for (let i = 0; i < documents.length; i++) {
        if (token.isCancellationRequested) {
          break;
        }

        const doc = documents[i];
        progress.report({
          message: `(${i + 1}/${documents.length}) ${doc.title}`,
          increment: (100 / documents.length),
        });

        try {
          const result = await syncSingleDocument(doc, docsManager, workspaceFolder.uri.fsPath, true);
          if (result === 'synced') {
            synced++;
          } else if (result === 'skipped') {
            skipped++;
          }
        } catch (error) {
          console.error(`Failed to sync "${doc.title}":`, error);
          failed++;
        }
      }
    }
  );

  // Show summary
  const parts: string[] = [];
  if (synced > 0) {
    parts.push(`${synced} synced`);
  }
  if (skipped > 0) {
    parts.push(`${skipped} up to date`);
  }
  if (failed > 0) {
    parts.push(`${failed} failed`);
  }

  vscode.window.showInformationMessage(`DocFetch: ${parts.join(', ')}.`);
}

/**
 * Sync a single document.
 * @returns 'synced' if updated, 'skipped' if already up to date, throws on error
 */
async function syncSingleDocument(
  metadata: DocumentMetadata,
  docsManager: DocsManager,
  workspaceRoot: string,
  silent: boolean = false
): Promise<'synced' | 'skipped'> {
  // Get the connection for this document
  const connection = getConnection(metadata.connectionId);
  if (!connection) {
    if (!silent) {
      vscode.window.showErrorMessage(
        `DocFetch: Connection "${metadata.connectionId}" not found. The connection may have been deleted.`
      );
    }
    throw new Error(`Connection not found: ${metadata.connectionId}`);
  }

  const credentialStore = CredentialStore.getInstance();
  const { client, authProvider } = ConfluenceClientFactory.create(connection, credentialStore);

  // Ensure authenticated
  if (!(await authProvider.isAuthenticated())) {
    if (!silent) {
      const authenticated = await authProvider.authenticate();
      if (!authenticated) {
        throw new Error('Authentication cancelled');
      }
    } else {
      throw new Error('Not authenticated');
    }
  }

  // Check if local file exists - skip deleted files
  const localFilePath = path.join(docsManager.docsPath, metadata.relativePath);
  const fileExists = fs.existsSync(localFilePath);

  if (!fileExists) {
    if (!silent) {
      vscode.window.showWarningMessage(
        `DocFetch: "${metadata.title}" was deleted locally. Use Search to fetch it again.`
      );
    }
    return 'skipped';
  }

  // Wrap in progress if not silent
  if (!silent) {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `DocFetch: Syncing "${metadata.title}"...`,
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: 'Fetching from Confluence...' });
        const document = await client.getDocumentById(metadata.confluenceId);

        // Check if there's a newer version
        if (document.version <= metadata.version) {
          vscode.window.showInformationMessage(
            `DocFetch: "${metadata.title}" is already up to date.`
          );
          return 'skipped';
        }

        progress.report({ message: 'Updating local file...' });
        await docsManager.updateDocument(document, metadata);

        vscode.window.showInformationMessage(
          `DocFetch: Updated "${metadata.title}" (v${metadata.version} → v${document.version})`
        );
        return 'synced';
      }
    );
  } else {
    // Silent mode for bulk sync
    const document = await client.getDocumentById(metadata.confluenceId);

    // Check if there's a newer version
    if (document.version <= metadata.version) {
      return 'skipped';
    }

    await docsManager.updateDocument(document, metadata);
    return 'synced';
  }
}
