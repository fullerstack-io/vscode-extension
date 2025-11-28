import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/suite/extension.test.js',
  mocha: {
    ui: 'bdd',
    color: true,
    timeout: 10000
  },
  launchArgs: ['--disable-extensions']
});
