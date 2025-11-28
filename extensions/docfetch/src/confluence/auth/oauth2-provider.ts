import * as vscode from 'vscode';
import * as http from 'http';
import { CredentialStore } from './credential-store';
import { OAuth2Credentials, AuthenticationError } from '../types';
import { AuthProvider } from './api-token-provider';

// OAuth 2.0 configuration
const ATLASSIAN_AUTH_URL = 'https://auth.atlassian.com/authorize';
const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const ATLASSIAN_RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';

// Scopes needed for Confluence read access
const CONFLUENCE_SCOPES = [
  'read:confluence-content.all',
  'read:confluence-space.summary',
  'read:confluence-content.summary',
  'search:confluence',
  'offline_access', // For refresh tokens
].join(' ');

// Local callback server port
const CALLBACK_PORT = 27419;
const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/callback`;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface AccessibleResource {
  id: string;
  url: string;
  name: string;
  scopes: string[];
  avatarUrl: string;
}

/**
 * OAuth 2.0 (3LO) authentication provider for Confluence Cloud.
 */
export class OAuth2Provider implements AuthProvider {
  private cachedCredentials?: OAuth2Credentials;
  private clientId: string = '';
  private clientSecret: string = '';

  constructor(
    private readonly connectionId: string,
    private readonly baseUrl: string,
    private readonly credentialStore: CredentialStore
  ) {}

  /**
   * Get authorization headers for API requests.
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const credentials = await this.getValidCredentials();
    if (!credentials) {
      throw new AuthenticationError('Not authenticated. Please sign in.');
    }

    return {
      'Authorization': `Bearer ${credentials.accessToken}`,
    };
  }

  /**
   * Get the Cloud ID for API requests.
   */
  async getCloudId(): Promise<string> {
    const credentials = await this.getValidCredentials();
    if (!credentials) {
      throw new AuthenticationError('Not authenticated. Please sign in.');
    }
    return credentials.cloudId;
  }

  /**
   * Check if user is authenticated with valid tokens.
   */
  async isAuthenticated(): Promise<boolean> {
    const credentials = await this.getValidCredentials();
    return credentials !== undefined;
  }

  /**
   * Start the OAuth 2.0 authentication flow.
   */
  async authenticate(): Promise<boolean> {
    // First, get OAuth client credentials from user
    const hasClientCredentials = await this.ensureClientCredentials();
    if (!hasClientCredentials) {
      return false;
    }

    try {
      // Generate state for CSRF protection
      const state = this.generateState();

      // Create authorization URL
      const authUrl = this.buildAuthUrl(state);

      // Start local server to receive callback
      const authCode = await this.startCallbackServer(state);

      if (!authCode) {
        vscode.window.showErrorMessage('DocFetch: Authentication was cancelled or failed.');
        return false;
      }

      // Exchange code for tokens
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'DocFetch: Completing authentication...',
          cancellable: false,
        },
        async () => {
          const tokens = await this.exchangeCodeForTokens(authCode);
          const cloudId = await this.getCloudIdForSite(tokens.access_token);

          if (!cloudId) {
            throw new AuthenticationError('Could not find Confluence site. Make sure you have access.');
          }

          const credentials: OAuth2Credentials = {
            method: 'oauth2',
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: Date.now() + (tokens.expires_in * 1000),
            cloudId,
          };

          await this.credentialStore.store(this.connectionId, credentials);
          this.cachedCredentials = credentials;
        }
      );

      vscode.window.showInformationMessage('DocFetch: Successfully authenticated with Confluence!');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`DocFetch: Authentication failed. ${message}`);
      return false;
    }
  }

  /**
   * Log out and clear credentials.
   */
  async logout(): Promise<void> {
    await this.credentialStore.delete(this.connectionId);
    this.cachedCredentials = undefined;
  }

  /**
   * Ensure we have OAuth client credentials (Client ID and Secret).
   */
  private async ensureClientCredentials(): Promise<boolean> {
    // Check if we have stored client credentials
    const config = vscode.workspace.getConfiguration('docfetch');
    let clientId = config.get<string>('oauth.clientId');
    let clientSecret = config.get<string>('oauth.clientSecret');

    if (!clientId || !clientSecret) {
      // Show setup instructions
      const setupChoice = await vscode.window.showInformationMessage(
        'DocFetch: OAuth 2.0 requires an Atlassian OAuth app. You need to create one at developer.atlassian.com',
        'Enter Credentials',
        'Open Atlassian Developer',
        'Cancel'
      );

      if (setupChoice === 'Open Atlassian Developer') {
        await vscode.env.openExternal(vscode.Uri.parse('https://developer.atlassian.com/console/myapps/'));
        // Show instructions
        await vscode.window.showInformationMessage(
          `DocFetch OAuth Setup:\n\n` +
          `1. Create a new OAuth 2.0 app\n` +
          `2. Add callback URL: ${CALLBACK_URL}\n` +
          `3. Enable Confluence API scopes\n` +
          `4. Copy the Client ID and Secret`,
          'Continue'
        );
      }

      if (setupChoice === 'Cancel') {
        return false;
      }

      // Get Client ID
      clientId = await vscode.window.showInputBox({
        title: 'OAuth 2.0 Setup (Step 1/2)',
        prompt: 'Enter your Atlassian OAuth Client ID',
        placeHolder: 'Client ID from developer.atlassian.com',
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value || value.length < 10) {
            return 'Please enter a valid Client ID';
          }
          return undefined;
        },
      });

      if (!clientId) {
        return false;
      }

      // Get Client Secret
      clientSecret = await vscode.window.showInputBox({
        title: 'OAuth 2.0 Setup (Step 2/2)',
        prompt: 'Enter your Atlassian OAuth Client Secret',
        placeHolder: 'Client Secret',
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value || value.length < 10) {
            return 'Please enter a valid Client Secret';
          }
          return undefined;
        },
      });

      if (!clientSecret) {
        return false;
      }

      // Store in settings (Client ID is not secret, but we store both for convenience)
      await config.update('oauth.clientId', clientId, vscode.ConfigurationTarget.Global);
      // Store client secret securely
      await this.credentialStore.store('oauth.clientSecret', {
        method: 'apiToken',
        email: '',
        token: clientSecret,
      });
    } else {
      // Retrieve stored client secret
      const storedSecret = await this.credentialStore.retrieve('oauth.clientSecret');
      if (storedSecret?.method === 'apiToken') {
        clientSecret = storedSecret.token;
      }
    }

    this.clientId = clientId;
    this.clientSecret = clientSecret || '';

    return true;
  }

  /**
   * Build the authorization URL.
   */
  private buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: this.clientId,
      scope: CONFLUENCE_SCOPES,
      redirect_uri: CALLBACK_URL,
      state,
      response_type: 'code',
      prompt: 'consent',
    });

    return `${ATLASSIAN_AUTH_URL}?${params}`;
  }

  /**
   * Start a local HTTP server to receive the OAuth callback.
   */
  private startCallbackServer(expectedState: string): Promise<string | undefined> {
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url || '', `http://localhost:${CALLBACK_PORT}`);

        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(this.getCallbackHtml(false, error));
            server.close();
            resolve(undefined);
            return;
          }

          if (state !== expectedState) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(this.getCallbackHtml(false, 'Invalid state parameter'));
            server.close();
            resolve(undefined);
            return;
          }

          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(this.getCallbackHtml(true));
            server.close();
            resolve(code);
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(this.getCallbackHtml(false, 'No authorization code received'));
            server.close();
            resolve(undefined);
          }
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      server.listen(CALLBACK_PORT, () => {
        // Open the authorization URL in the browser
        const authUrl = this.buildAuthUrl(expectedState);
        vscode.env.openExternal(vscode.Uri.parse(authUrl));
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        resolve(undefined);
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Exchange authorization code for tokens.
   */
  private async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
    const response = await fetch(ATLASSIAN_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: CALLBACK_URL,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    return response.json() as Promise<TokenResponse>;
  }

  /**
   * Refresh the access token using the refresh token.
   */
  private async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    const response = await fetch(ATLASSIAN_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    return response.json() as Promise<TokenResponse>;
  }

  /**
   * Get the Cloud ID for the user's Confluence site.
   */
  private async getCloudIdForSite(accessToken: string): Promise<string | undefined> {
    const response = await fetch(ATLASSIAN_RESOURCES_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get accessible resources');
    }

    const resources = await response.json() as AccessibleResource[];

    // Find the resource matching our base URL
    const baseHostname = new URL(this.baseUrl).hostname;
    const matchingResource = resources.find((r) => {
      const resourceHostname = new URL(r.url).hostname;
      return resourceHostname === baseHostname;
    });

    if (matchingResource) {
      return matchingResource.id;
    }

    // If no exact match, return first resource (user can have multiple sites)
    if (resources.length > 0) {
      // Let user choose if multiple sites
      if (resources.length > 1) {
        const choice = await vscode.window.showQuickPick(
          resources.map((r) => ({
            label: r.name,
            description: r.url,
            id: r.id,
          })),
          {
            title: 'Select Confluence Site',
            placeHolder: 'Choose which site to connect to',
          }
        );

        if (choice) {
          return (choice as { id: string }).id;
        }
        return undefined;
      }

      return resources[0].id;
    }

    return undefined;
  }

  /**
   * Get valid credentials, refreshing if necessary.
   */
  private async getValidCredentials(): Promise<OAuth2Credentials | undefined> {
    // Check cached credentials first
    if (this.cachedCredentials && !this.isTokenExpired(this.cachedCredentials)) {
      return this.cachedCredentials;
    }

    // Try to load from store
    const stored = await this.credentialStore.retrieve(this.connectionId);
    if (stored?.method !== 'oauth2') {
      return undefined;
    }

    // Check if token needs refresh
    if (this.isTokenExpired(stored)) {
      try {
        await this.ensureClientCredentials();
        const tokens = await this.refreshAccessToken(stored.refreshToken);

        const refreshed: OAuth2Credentials = {
          method: 'oauth2',
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || stored.refreshToken,
          expiresAt: Date.now() + (tokens.expires_in * 1000),
          cloudId: stored.cloudId,
        };

        await this.credentialStore.store(this.connectionId, refreshed);
        this.cachedCredentials = refreshed;
        return refreshed;
      } catch (error) {
        console.error('Failed to refresh token:', error);
        // Token refresh failed, user needs to re-authenticate
        return undefined;
      }
    }

    this.cachedCredentials = stored;
    return stored;
  }

  /**
   * Check if the token is expired or about to expire (5 min buffer).
   */
  private isTokenExpired(credentials: OAuth2Credentials): boolean {
    const bufferMs = 5 * 60 * 1000; // 5 minutes
    return Date.now() >= (credentials.expiresAt - bufferMs);
  }

  /**
   * Generate a random state parameter for CSRF protection.
   */
  private generateState(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generate HTML for the callback page.
   */
  private getCallbackHtml(success: boolean, error?: string): string {
    if (success) {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <title>DocFetch - Authentication Successful</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1e1e1e; color: #fff; }
            .container { text-align: center; padding: 40px; }
            .success { color: #4caf50; font-size: 48px; margin-bottom: 20px; }
            h1 { margin: 0 0 10px 0; }
            p { color: #888; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success">✓</div>
            <h1>Authentication Successful!</h1>
            <p>You can close this window and return to VS Code.</p>
          </div>
        </body>
        </html>
      `;
    } else {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <title>DocFetch - Authentication Failed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1e1e1e; color: #fff; }
            .container { text-align: center; padding: 40px; }
            .error { color: #f44336; font-size: 48px; margin-bottom: 20px; }
            h1 { margin: 0 0 10px 0; }
            p { color: #888; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">✗</div>
            <h1>Authentication Failed</h1>
            <p>${error || 'An unknown error occurred.'}</p>
            <p>Please close this window and try again in VS Code.</p>
          </div>
        </body>
        </html>
      `;
    }
  }
}
