import * as vscode from 'vscode';
import { selectConnection, getConnections, configureConnection } from './configureConnection';
import { ConfluenceClientFactory } from '../confluence/clients/client-factory';
import { CredentialStore } from '../confluence/auth/credential-store';
import { DocsManager } from '../storage/docs-manager';
import { DocumentNotFoundError, AuthenticationError } from '../confluence/types';

/**
 * Command to fetch a Confluence document by URL.
 */
export async function fetchByUrl(): Promise<void> {
  // Ensure we have a workspace
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('DocFetch: Please open a workspace folder first.');
    return;
  }

  // Ensure we have a connection
  let connection = await selectConnection();
  if (!connection) {
    return;
  }

  // Get the URL
  const url = await vscode.window.showInputBox({
    title: 'Fetch Confluence Document',
    prompt: 'Enter the Confluence page URL',
    placeHolder: 'https://company.atlassian.net/wiki/spaces/SPACE/pages/123456/Page+Title',
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value) {
        return 'URL is required';
      }
      try {
        new URL(value);
        return undefined;
      } catch {
        return 'Please enter a valid URL';
      }
    },
  });

  if (!url) {
    return;
  }

  // Check if URL matches the connection's base URL
  if (!url.includes(new URL(connection.baseUrl).hostname)) {
    const useAnyway = await vscode.window.showWarningMessage(
      `The URL doesn't match the configured connection (${connection.name}). Use this connection anyway?`,
      'Yes',
      'Select Different Connection'
    );

    if (useAnyway === 'Select Different Connection') {
      const connections = getConnections();
      const matching = connections.find((c) => url.includes(new URL(c.baseUrl).hostname));

      if (matching) {
        connection = matching;
      } else {
        vscode.window.showInformationMessage(
          'DocFetch: No matching connection found. Please configure a connection for this Confluence instance.'
        );
        await configureConnection();
        return;
      }
    } else if (!useAnyway) {
      return;
    }
  }

  // Select category
  const docsManager = new DocsManager(workspaceFolder.uri.fsPath);
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

  // Fetch the document
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'DocFetch: Fetching document...',
      cancellable: false,
    },
    async (progress) => {
      try {
        const credentialStore = CredentialStore.getInstance();
        const { client, authProvider } = ConfluenceClientFactory.create(connection!, credentialStore);

        // Ensure we're authenticated
        if (!(await authProvider.isAuthenticated())) {
          progress.report({ message: 'Authenticating...' });
          const authenticated = await authProvider.authenticate();
          if (!authenticated) {
            throw new AuthenticationError('Authentication cancelled');
          }
        }

        // Fetch the document
        progress.report({ message: 'Fetching from Confluence...' });
        const document = await client.getDocumentByUrl(url);

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

          vscode.window.showInformationMessage(
            `DocFetch: Updated "${document.title}"`
          );
        } else {
          progress.report({ message: 'Saving document...' });
          const metadata = await docsManager.saveDocument(document, connection!.id, category);

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
        if (error instanceof DocumentNotFoundError) {
          vscode.window.showErrorMessage(
            `DocFetch: Document not found. Check the URL and try again.`
          );
        } else if (error instanceof AuthenticationError) {
          vscode.window.showErrorMessage(
            `DocFetch: Authentication failed. Please check your credentials.`
          );
        } else {
          vscode.window.showErrorMessage(
            `DocFetch: Failed to fetch document. ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    }
  );
}
