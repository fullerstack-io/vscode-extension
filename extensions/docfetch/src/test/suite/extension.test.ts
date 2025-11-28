import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Starting DocFetch tests');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('fullerstack-io.docfetch'));
  });

  test('Commands should be registered', async () => {
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
