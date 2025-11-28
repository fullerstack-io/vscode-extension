import * as vscode from 'vscode';
import { CredentialStore } from './credential-store';
import { ApiTokenCredentials, AuthenticationError, ConfluenceDeploymentType } from '../types';

/**
 * Authentication provider interface.
 */
export interface AuthProvider {
  getAuthHeaders(): Promise<Record<string, string>>;
  isAuthenticated(): Promise<boolean>;
  authenticate(): Promise<boolean>;
  logout(): Promise<void>;
}

/**
 * API Token authentication provider.
 *
 * For Confluence Cloud: Uses email + API token with Basic auth.
 * For Data Center: Uses token as Bearer auth.
 */
export class ApiTokenProvider implements AuthProvider {
  private cachedCredentials?: ApiTokenCredentials;

  constructor(
    private readonly connectionId: string,
    private readonly deploymentType: ConfluenceDeploymentType,
    private readonly credentialStore: CredentialStore
  ) {}

  async getAuthHeaders(): Promise<Record<string, string>> {
    const credentials = await this.getCredentials();
    if (!credentials) {
      throw new AuthenticationError('No credentials found. Please configure the connection.');
    }

    if (this.deploymentType === 'cloud') {
      // Cloud uses Basic auth with email:token
      const encoded = Buffer.from(`${credentials.email}:${credentials.token}`).toString('base64');
      return {
        'Authorization': `Basic ${encoded}`,
      };
    } else {
      // Data Center uses Bearer token
      return {
        'Authorization': `Bearer ${credentials.token}`,
      };
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const credentials = await this.getCredentials();
    return credentials !== undefined;
  }

  async authenticate(): Promise<boolean> {
    let email: string | undefined;

    if (this.deploymentType === 'cloud') {
      email = await vscode.window.showInputBox({
        title: 'Confluence Authentication',
        prompt: 'Enter your Atlassian account email',
        placeHolder: 'user@company.com',
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value || !value.includes('@')) {
            return 'Please enter a valid email address';
          }
          return undefined;
        },
      });

      if (!email) {
        return false;
      }
    }

    const token = await vscode.window.showInputBox({
      title: 'Confluence Authentication',
      prompt: this.deploymentType === 'cloud'
        ? 'Enter your Atlassian API token (from id.atlassian.com/manage-profile/security/api-tokens)'
        : 'Enter your Personal Access Token',
      placeHolder: 'API Token',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || value.length < 10) {
          return 'Please enter a valid token';
        }
        return undefined;
      },
    });

    if (!token) {
      return false;
    }

    const credentials: ApiTokenCredentials = {
      method: 'apiToken',
      email: email || '',
      token,
    };

    await this.credentialStore.store(this.connectionId, credentials);
    this.cachedCredentials = credentials;

    vscode.window.showInformationMessage('DocFetch: Credentials saved successfully.');
    return true;
  }

  async logout(): Promise<void> {
    await this.credentialStore.delete(this.connectionId);
    this.cachedCredentials = undefined;
  }

  private async getCredentials(): Promise<ApiTokenCredentials | undefined> {
    if (this.cachedCredentials) {
      return this.cachedCredentials;
    }

    const stored = await this.credentialStore.retrieve(this.connectionId);
    if (stored?.method === 'apiToken') {
      this.cachedCredentials = stored;
      return stored;
    }

    return undefined;
  }
}
