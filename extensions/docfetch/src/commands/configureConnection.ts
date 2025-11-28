import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ConnectionConfig, ConfluenceDeploymentType, AuthMethod } from '../confluence/types';
import { ConfluenceClientFactory } from '../confluence/clients/client-factory';
import { CredentialStore } from '../confluence/auth/credential-store';

/**
 * Command to configure a new Confluence connection.
 */
export async function configureConnection(): Promise<ConnectionConfig | undefined> {
  const credentialStore = CredentialStore.getInstance();

  // Step 1: Get connection name
  const name = await vscode.window.showInputBox({
    title: 'Configure Confluence Connection (1/4)',
    prompt: 'Enter a name for this connection',
    placeHolder: 'My Confluence',
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value || value.trim().length < 2) {
        return 'Name must be at least 2 characters';
      }
      return undefined;
    },
  });

  if (!name) {
    return undefined;
  }

  // Step 2: Get Confluence URL
  const baseUrl = await vscode.window.showInputBox({
    title: 'Configure Confluence Connection (2/4)',
    prompt: 'Enter your Confluence URL',
    placeHolder: 'https://company.atlassian.net or https://confluence.company.com',
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

  if (!baseUrl) {
    return undefined;
  }

  // Auto-detect deployment type
  const detectedType = ConfluenceClientFactory.detectDeploymentType(baseUrl);

  // Step 3: Confirm deployment type
  const typeChoice = await vscode.window.showQuickPick(
    [
      {
        label: 'Confluence Cloud',
        description: 'Hosted on atlassian.net',
        value: 'cloud' as ConfluenceDeploymentType,
        picked: detectedType === 'cloud',
      },
      {
        label: 'Confluence Data Center / Server',
        description: 'Self-hosted instance',
        value: 'datacenter' as ConfluenceDeploymentType,
        picked: detectedType === 'datacenter',
      },
    ],
    {
      title: 'Configure Confluence Connection (3/4)',
      placeHolder: 'Select your Confluence deployment type',
      ignoreFocusOut: true,
    }
  );

  if (!typeChoice) {
    return undefined;
  }

  const deploymentType = typeChoice.value;

  // Step 4: Select authentication method
  const authOptions = deploymentType === 'cloud'
    ? [
        {
          label: 'API Token',
          description: 'Email + API token from id.atlassian.com',
          value: 'apiToken' as AuthMethod,
        },
        // OAuth2 can be added later
      ]
    : [
        {
          label: 'Personal Access Token',
          description: 'PAT from Confluence settings',
          value: 'pat' as AuthMethod,
        },
        {
          label: 'API Token',
          description: 'Username + API token',
          value: 'apiToken' as AuthMethod,
        },
      ];

  const authChoice = await vscode.window.showQuickPick(authOptions, {
    title: 'Configure Confluence Connection (4/4)',
    placeHolder: 'Select authentication method',
    ignoreFocusOut: true,
  });

  if (!authChoice) {
    return undefined;
  }

  // Create connection config
  const connectionId = crypto.randomUUID();
  const config: ConnectionConfig = {
    id: connectionId,
    name: name.trim(),
    baseUrl: baseUrl.replace(/\/+$/, ''), // Remove trailing slashes
    type: deploymentType,
    authMethod: authChoice.value,
  };

  // Create client and authenticate
  const { client, authProvider } = ConfluenceClientFactory.create(config, credentialStore);

  // Prompt for credentials
  const authenticated = await authProvider.authenticate();
  if (!authenticated) {
    vscode.window.showWarningMessage('DocFetch: Connection configuration cancelled.');
    return undefined;
  }

  // Test the connection
  const progress = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'DocFetch: Testing connection...',
      cancellable: false,
    },
    async () => {
      return await client.testConnection();
    }
  );

  if (!progress) {
    const retry = await vscode.window.showErrorMessage(
      'DocFetch: Connection test failed. Check your credentials and URL.',
      'Retry',
      'Cancel'
    );

    if (retry === 'Retry') {
      return configureConnection();
    }

    // Clean up stored credentials
    await authProvider.logout();
    return undefined;
  }

  // Save connection to settings
  await saveConnection(config);

  vscode.window.showInformationMessage(
    `DocFetch: Connection "${config.name}" configured successfully!`
  );

  return config;
}

/**
 * Save a connection to VS Code settings.
 */
async function saveConnection(config: ConnectionConfig): Promise<void> {
  const vsConfig = vscode.workspace.getConfiguration('docfetch');
  const connections = vsConfig.get<ConnectionConfig[]>('connections', []);

  // Remove existing connection with same ID
  const filtered = connections.filter((c) => c.id !== config.id);
  filtered.push(config);

  await vsConfig.update('connections', filtered, vscode.ConfigurationTarget.Global);
}

/**
 * Get all configured connections.
 */
export function getConnections(): ConnectionConfig[] {
  const config = vscode.workspace.getConfiguration('docfetch');
  return config.get<ConnectionConfig[]>('connections', []);
}

/**
 * Get a connection by ID.
 */
export function getConnection(id: string): ConnectionConfig | undefined {
  return getConnections().find((c) => c.id === id);
}

/**
 * Get the default connection.
 */
export function getDefaultConnection(): ConnectionConfig | undefined {
  const config = vscode.workspace.getConfiguration('docfetch');
  const defaultId = config.get<string>('defaultConnection', '');
  const connections = getConnections();

  if (defaultId) {
    const defaultConn = connections.find((c) => c.id === defaultId);
    if (defaultConn) {
      return defaultConn;
    }
  }

  // Return first connection if no default
  return connections[0];
}

/**
 * Prompt user to select a connection.
 */
export async function selectConnection(): Promise<ConnectionConfig | undefined> {
  const connections = getConnections();

  if (connections.length === 0) {
    const configure = await vscode.window.showInformationMessage(
      'DocFetch: No Confluence connections configured.',
      'Configure Now'
    );

    if (configure === 'Configure Now') {
      return configureConnection();
    }

    return undefined;
  }

  if (connections.length === 1) {
    return connections[0];
  }

  const choice = await vscode.window.showQuickPick(
    connections.map((c) => ({
      label: c.name,
      description: c.baseUrl,
      connection: c,
    })),
    {
      title: 'Select Confluence Connection',
      placeHolder: 'Choose a connection',
      ignoreFocusOut: true,
    }
  );

  return choice?.connection;
}
