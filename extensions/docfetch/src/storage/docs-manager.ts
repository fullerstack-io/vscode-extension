import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { DocumentMetadata, MetadataIndex, ConfluenceDocument } from '../confluence/types';
import { StorageToMarkdownConverter, ConversionResult } from '../confluence/converters/storage-to-markdown';

const METADATA_FILENAME = '.docfetch-metadata.json';
const METADATA_VERSION = '1.0.0';

/**
 * Manages the .docs directory and document metadata.
 */
export class DocsManager {
  private readonly workspaceRoot: string;
  private readonly docsDir: string;
  private readonly metadataPath: string;
  private readonly converter: StorageToMarkdownConverter;

  constructor(workspaceRoot: string, docsDir: string = '.docs') {
    this.workspaceRoot = workspaceRoot;
    this.docsDir = docsDir;
    this.metadataPath = path.join(workspaceRoot, docsDir, METADATA_FILENAME);
    this.converter = new StorageToMarkdownConverter();
  }

  /**
   * Get the full path to the docs directory.
   */
  get docsPath(): string {
    return path.join(this.workspaceRoot, this.docsDir);
  }

  /**
   * Ensure the docs directory and subdirectories exist.
   */
  async ensureDirectories(): Promise<void> {
    const config = vscode.workspace.getConfiguration('docfetch');
    const subdirs = config.get<Record<string, string>>('subdirectories', {});

    // Create main docs directory
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(this.docsPath));

    // Create subdirectories
    for (const subdir of Object.keys(subdirs)) {
      const subdirPath = path.join(this.docsPath, subdir);
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(subdirPath));
    }
  }

  /**
   * Get available subdirectory categories.
   */
  getCategories(): { key: string; label: string }[] {
    const config = vscode.workspace.getConfiguration('docfetch');
    const subdirs = config.get<Record<string, string>>('subdirectories', {});

    return Object.entries(subdirs).map(([key, label]) => ({ key, label }));
  }

  /**
   * Save a Confluence document as a Markdown file.
   */
  async saveDocument(
    document: ConfluenceDocument,
    connectionId: string,
    category: string
  ): Promise<DocumentMetadata> {
    await this.ensureDirectories();

    // Convert to Markdown
    const result = this.converter.convert(document);
    const markdownContent = this.converter.buildMarkdownFile(result);

    // Generate filename from title
    const filename = this.sanitizeFilename(document.title) + '.md';
    const relativePath = path.join(category, filename);
    const fullPath = path.join(this.docsPath, relativePath);

    // Write the file
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(fullPath),
      encoder.encode(markdownContent)
    );

    // Create metadata entry
    const metadata: DocumentMetadata = {
      id: crypto.randomUUID(),
      confluenceId: document.id,
      connectionId,
      relativePath,
      title: document.title,
      confluenceUrl: document.webUrl,
      spaceKey: document.spaceKey,
      version: document.version,
      syncedAt: new Date().toISOString(),
      checksum: this.computeChecksum(markdownContent),
      category,
      labels: document.labels,
    };

    // Update metadata index
    await this.updateMetadataIndex(metadata);

    return metadata;
  }

  /**
   * Update an existing document.
   */
  async updateDocument(
    document: ConfluenceDocument,
    existingMetadata: DocumentMetadata
  ): Promise<DocumentMetadata> {
    // Convert to Markdown
    const result = this.converter.convert(document);
    const markdownContent = this.converter.buildMarkdownFile(result);

    // Use existing path
    const fullPath = path.join(this.docsPath, existingMetadata.relativePath);

    // Write the file
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(fullPath),
      encoder.encode(markdownContent)
    );

    // Update metadata
    const updatedMetadata: DocumentMetadata = {
      ...existingMetadata,
      title: document.title,
      version: document.version,
      syncedAt: new Date().toISOString(),
      checksum: this.computeChecksum(markdownContent),
      labels: document.labels,
    };

    await this.updateMetadataIndex(updatedMetadata);

    return updatedMetadata;
  }

  /**
   * Get metadata for a document by its Confluence ID.
   */
  async getDocumentByConfluenceId(confluenceId: string): Promise<DocumentMetadata | undefined> {
    const index = await this.loadMetadataIndex();
    return index.documents.find((d) => d.confluenceId === confluenceId);
  }

  /**
   * Get metadata for a document by its local file path.
   */
  async getDocumentByPath(relativePath: string): Promise<DocumentMetadata | undefined> {
    const index = await this.loadMetadataIndex();
    return index.documents.find((d) => d.relativePath === relativePath);
  }

  /**
   * Get all documents, optionally filtered by category.
   */
  async listDocuments(category?: string): Promise<DocumentMetadata[]> {
    const index = await this.loadMetadataIndex();

    if (category) {
      return index.documents.filter((d) => d.category === category);
    }

    return index.documents;
  }

  /**
   * Delete a document and its metadata.
   */
  async deleteDocument(id: string): Promise<void> {
    const index = await this.loadMetadataIndex();
    const docIndex = index.documents.findIndex((d) => d.id === id);

    if (docIndex === -1) {
      return;
    }

    const doc = index.documents[docIndex];

    // Delete the file
    const fullPath = path.join(this.docsPath, doc.relativePath);
    try {
      await vscode.workspace.fs.delete(vscode.Uri.file(fullPath));
    } catch {
      // File might not exist
    }

    // Remove from index
    index.documents.splice(docIndex, 1);
    await this.saveMetadataIndex(index);
  }

  /**
   * Load the metadata index from disk.
   */
  private async loadMetadataIndex(): Promise<MetadataIndex> {
    try {
      const content = await vscode.workspace.fs.readFile(vscode.Uri.file(this.metadataPath));
      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(content)) as MetadataIndex;
    } catch {
      // Return empty index if file doesn't exist
      return {
        version: METADATA_VERSION,
        documents: [],
      };
    }
  }

  /**
   * Save the metadata index to disk.
   */
  private async saveMetadataIndex(index: MetadataIndex): Promise<void> {
    const encoder = new TextEncoder();
    const content = JSON.stringify(index, null, 2);
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(this.metadataPath),
      encoder.encode(content)
    );
  }

  /**
   * Update a document in the metadata index.
   */
  private async updateMetadataIndex(metadata: DocumentMetadata): Promise<void> {
    const index = await this.loadMetadataIndex();

    // Find existing entry
    const existingIndex = index.documents.findIndex(
      (d) => d.id === metadata.id || d.confluenceId === metadata.confluenceId
    );

    if (existingIndex >= 0) {
      // Update existing
      index.documents[existingIndex] = metadata;
    } else {
      // Add new
      index.documents.push(metadata);
    }

    await this.saveMetadataIndex(index);
  }

  /**
   * Sanitize a string for use as a filename.
   */
  private sanitizeFilename(name: string): string {
    return name
      // Replace path separators and other problematic characters
      .replace(/[/\\:*?"<>|]/g, '-')
      // Replace multiple dashes with single dash
      .replace(/-+/g, '-')
      // Remove leading/trailing dashes
      .replace(/^-|-$/g, '')
      // Trim whitespace
      .trim()
      // Limit length
      .slice(0, 100)
      // Default if empty
      || 'untitled';
  }

  /**
   * Compute a checksum for content.
   */
  private computeChecksum(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }
}
