import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DocsManager } from '../storage/docs-manager';
import { DocumentMetadata } from '../confluence/types';

/**
 * Tree item representing a document or category in the DocFetch view.
 */
export class DocumentTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly metadata?: DocumentMetadata,
    public readonly category?: string
  ) {
    super(label, collapsibleState);

    if (metadata) {
      // Document item
      this.tooltip = `${metadata.title}\nLast synced: ${new Date(metadata.syncedAt).toLocaleString()}`;
      this.description = `v${metadata.version}`;
      this.contextValue = 'document';
      this.iconPath = new vscode.ThemeIcon('file-text');

      // Make it clickable to open the file
      this.command = {
        command: 'vscode.open',
        title: 'Open Document',
        arguments: [vscode.Uri.file(path.join(this.getDocsPath(), metadata.relativePath))],
      };
    } else if (category) {
      // Category folder
      this.contextValue = 'category';
      this.iconPath = new vscode.ThemeIcon('folder');
    }
  }

  private getDocsPath(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    return workspaceFolder ? path.join(workspaceFolder.uri.fsPath, '.docs') : '';
  }
}

/**
 * TreeDataProvider for the DocFetch Documents view.
 */
export class DocumentTreeProvider implements vscode.TreeDataProvider<DocumentTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<DocumentTreeItem | undefined | null | void> =
    new vscode.EventEmitter<DocumentTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<DocumentTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private docsManager: DocsManager | undefined;

  constructor() {
    this.initDocsManager();
  }

  private initDocsManager(): void {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      this.docsManager = new DocsManager(workspaceFolder.uri.fsPath);
    }
  }

  /**
   * Refresh the tree view.
   */
  refresh(): void {
    this.initDocsManager();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: DocumentTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: DocumentTreeItem): Promise<DocumentTreeItem[]> {
    if (!this.docsManager) {
      return [];
    }

    if (!element) {
      // Root level - show categories
      return this.getCategories();
    } else if (element.category) {
      // Category level - show documents in this category
      return this.getDocumentsInCategory(element.category);
    }

    return [];
  }

  private async getCategories(): Promise<DocumentTreeItem[]> {
    if (!this.docsManager) {
      return [];
    }

    const documents = await this.docsManager.listDocuments();

    // Get unique categories that have documents
    const categoriesWithDocs = new Set<string>();
    for (const doc of documents) {
      if (doc.category) {
        // Check if file exists
        const filePath = path.join(this.docsManager.docsPath, doc.relativePath);
        if (fs.existsSync(filePath)) {
          categoriesWithDocs.add(doc.category);
        }
      }
    }

    // Get configured categories
    const configuredCategories = this.docsManager.getCategories();

    // Show categories that either have documents or are configured
    const allCategories = new Map<string, string>();
    for (const cat of configuredCategories) {
      allCategories.set(cat.key, cat.label);
    }

    const items: DocumentTreeItem[] = [];
    for (const [key, label] of allCategories) {
      const hasDocuments = categoriesWithDocs.has(key);
      if (hasDocuments) {
        items.push(new DocumentTreeItem(
          key,
          vscode.TreeItemCollapsibleState.Expanded,
          undefined,
          key
        ));
      }
    }

    // Sort alphabetically
    items.sort((a, b) => a.label.localeCompare(b.label));

    // If no documents, show a message
    if (items.length === 0) {
      const emptyItem = new DocumentTreeItem(
        'No documents fetched yet',
        vscode.TreeItemCollapsibleState.None
      );
      emptyItem.iconPath = new vscode.ThemeIcon('info');
      emptyItem.command = {
        command: 'docfetch.searchDocuments',
        title: 'Search Documents',
      };
      return [emptyItem];
    }

    return items;
  }

  private async getDocumentsInCategory(category: string): Promise<DocumentTreeItem[]> {
    if (!this.docsManager) {
      return [];
    }

    const documents = await this.docsManager.listDocuments(category);

    // Filter to only existing files
    const existingDocs = documents.filter(doc => {
      const filePath = path.join(this.docsManager!.docsPath, doc.relativePath);
      return fs.existsSync(filePath);
    });

    // Sort by title
    existingDocs.sort((a, b) => a.title.localeCompare(b.title));

    return existingDocs.map(doc => new DocumentTreeItem(
      doc.title,
      vscode.TreeItemCollapsibleState.None,
      doc
    ));
  }
}
