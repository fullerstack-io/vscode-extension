import * as assert from 'assert';
import * as vscode from 'vscode';

describe('Extension Test Suite', () => {
  before(async () => {
    vscode.window.showInformationMessage('Starting DocFetch tests');
    // Activate the extension
    const ext = vscode.extensions.getExtension('fullerstack-io.docfetch');
    if (ext && !ext.isActive) {
      await ext.activate();
    }
  });

  it('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('fullerstack-io.docfetch'));
  });

  it('Commands should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);

    const expectedCommands = [
      'docfetch.fetchByUrl',
      'docfetch.configureConnection',
      'docfetch.searchDocuments',
      'docfetch.syncDocument',
      'docfetch.syncAllDocuments',
      'docfetch.openInConfluence',
    ];

    for (const cmd of expectedCommands) {
      assert.ok(
        commands.includes(cmd),
        `Command ${cmd} should be registered`
      );
    }
  });
});
