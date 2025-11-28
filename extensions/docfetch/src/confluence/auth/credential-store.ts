import * as vscode from 'vscode';
import { Credentials } from '../types';

const SECRET_KEY_PREFIX = 'docfetch.credentials.';

/**
 * Wrapper around VS Code SecretStorage for secure credential management.
 * Credentials are encrypted using the OS keychain.
 */
export class CredentialStore {
  private static instance: CredentialStore | undefined;
  private secretStorage: vscode.SecretStorage;

  private constructor(secretStorage: vscode.SecretStorage) {
    this.secretStorage = secretStorage;
  }

  /**
   * Initialize the credential store. Must be called during extension activation.
   */
  static initialize(context: vscode.ExtensionContext): void {
    CredentialStore.instance = new CredentialStore(context.secrets);
  }

  /**
   * Get the singleton instance.
   */
  static getInstance(): CredentialStore {
    if (!CredentialStore.instance) {
      throw new Error('CredentialStore not initialized. Call initialize() first.');
    }
    return CredentialStore.instance;
  }

  /**
   * Store credentials for a connection.
   */
  async store(connectionId: string, credentials: Credentials): Promise<void> {
    const key = `${SECRET_KEY_PREFIX}${connectionId}`;
    const value = JSON.stringify(credentials);
    await this.secretStorage.store(key, value);
  }

  /**
   * Retrieve credentials for a connection.
   */
  async retrieve(connectionId: string): Promise<Credentials | undefined> {
    const key = `${SECRET_KEY_PREFIX}${connectionId}`;
    const value = await this.secretStorage.get(key);

    if (!value) {
      return undefined;
    }

    try {
      return JSON.parse(value) as Credentials;
    } catch {
      console.error(`Failed to parse credentials for connection: ${connectionId}`);
      return undefined;
    }
  }

  /**
   * Delete credentials for a connection.
   */
  async delete(connectionId: string): Promise<void> {
    const key = `${SECRET_KEY_PREFIX}${connectionId}`;
    await this.secretStorage.delete(key);
  }

  /**
   * Check if credentials exist for a connection.
   */
  async hasCredentials(connectionId: string): Promise<boolean> {
    const credentials = await this.retrieve(connectionId);
    return credentials !== undefined;
  }

  /**
   * Listen for credential changes.
   */
  onDidChange(callback: (connectionId: string) => void): vscode.Disposable {
    return this.secretStorage.onDidChange((e) => {
      if (e.key.startsWith(SECRET_KEY_PREFIX)) {
        const connectionId = e.key.slice(SECRET_KEY_PREFIX.length);
        callback(connectionId);
      }
    });
  }
}
