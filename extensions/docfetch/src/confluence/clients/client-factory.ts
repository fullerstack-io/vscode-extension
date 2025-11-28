import { IConfluenceClient } from './base-client';
import { CloudConfluenceClient } from './cloud-client';
import { OAuthCloudConfluenceClient } from './oauth-cloud-client';
import { ConnectionConfig } from '../types';
import { AuthProvider, ApiTokenProvider } from '../auth/api-token-provider';
import { OAuth2Provider } from '../auth/oauth2-provider';
import { CredentialStore } from '../auth/credential-store';

/**
 * Factory for creating Confluence API clients.
 */
export class ConfluenceClientFactory {
  /**
   * Create a client for the given connection configuration.
   */
  static create(config: ConnectionConfig, credentialStore: CredentialStore): {
    client: IConfluenceClient;
    authProvider: AuthProvider;
  } {
    const authProvider = this.createAuthProvider(config, credentialStore);

    let client: IConfluenceClient;

    switch (config.type) {
      case 'cloud':
        if (config.authMethod === 'oauth2') {
          // OAuth uses different API endpoint structure
          client = new OAuthCloudConfluenceClient(
            config.baseUrl,
            authProvider as OAuth2Provider
          );
        } else {
          client = new CloudConfluenceClient(config.baseUrl, authProvider);
        }
        break;
      case 'datacenter':
        // For now, Data Center uses the same client structure
        // TODO: Implement DataCenterConfluenceClient when needed
        client = new CloudConfluenceClient(config.baseUrl, authProvider);
        break;
      default:
        throw new Error(`Unknown deployment type: ${config.type}`);
    }

    return { client, authProvider };
  }

  /**
   * Create an authentication provider based on the auth method.
   */
  private static createAuthProvider(
    config: ConnectionConfig,
    credentialStore: CredentialStore
  ): AuthProvider {
    switch (config.authMethod) {
      case 'apiToken':
        return new ApiTokenProvider(config.id, config.type, credentialStore);
      case 'oauth2':
        return new OAuth2Provider(config.id, config.baseUrl, credentialStore);
      case 'pat':
        // PAT uses the same provider as API token for Data Center
        return new ApiTokenProvider(config.id, config.type, credentialStore);
      default:
        throw new Error(`Unknown auth method: ${config.authMethod}`);
    }
  }

  /**
   * Detect the deployment type from a URL.
   */
  static detectDeploymentType(baseUrl: string): 'cloud' | 'datacenter' {
    // Atlassian Cloud instances are always on atlassian.net
    if (baseUrl.includes('.atlassian.net')) {
      return 'cloud';
    }
    return 'datacenter';
  }
}
