# VS Code Extensions

A monorepo containing multiple VS Code extensions. Each extension can be cloned independently using Git sparse checkout.

## Repository Structure

```
vscode-extension/
├── extensions/           # All VS Code extensions
│   ├── extension-a/
│   ├── extension-b/
│   └── ...
├── scripts/              # Helper scripts
│   └── clone-extension.sh
├── .vscode/              # Shared VS Code configurations
└── vscode-extensions.code-workspace
```

## Clone Options

### Full Repository (All Extensions)

```bash
git clone https://github.com/fullerstack-io/vscode-extension.git
cd vscode-extension
```

### Single Extension Only

Use the helper script:

```bash
# Clone the helper script first, then use it
curl -O https://raw.githubusercontent.com/fullerstack-io/vscode-extension/main/scripts/clone-extension.sh
chmod +x clone-extension.sh
./clone-extension.sh my-extension
```

Or manually with Git sparse checkout:

```bash
git clone --filter=blob:none --no-checkout --sparse \
  https://github.com/fullerstack-io/vscode-extension.git my-extension-dev

cd my-extension-dev
git sparse-checkout set extensions/my-extension
git checkout main
```

### Add Another Extension to Existing Checkout

```bash
git sparse-checkout add extensions/another-extension
```

### Expand to Full Repository

```bash
git sparse-checkout disable
```

## Requirements

- Git 2.25+ (2.27+ recommended)
- Node.js 18+

## Creating a New Extension

1. Create a new directory under `extensions/`:
   ```bash
   mkdir extensions/my-new-extension
   cd extensions/my-new-extension
   ```

2. Initialize the extension (using VS Code's Yeoman generator or manually):
   ```bash
   npx yo code
   ```

3. Add the extension to `vscode-extensions.code-workspace` for multi-root workspace support.

4. Add a debug configuration in `.vscode/launch.json`.

## Development

Open the multi-root workspace in VS Code:

```bash
code vscode-extensions.code-workspace
```

Each extension can be developed, built, and tested independently within its own directory.
