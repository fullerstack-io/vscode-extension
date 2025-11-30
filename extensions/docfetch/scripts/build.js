const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');

// Inject environment variables at build time
const define = {
  'process.env.DOCFETCH_CLIENT_ID': JSON.stringify(process.env.DOCFETCH_CLIENT_ID || ''),
  'process.env.DOCFETCH_CLIENT_SECRET': JSON.stringify(process.env.DOCFETCH_CLIENT_SECRET || ''),
};

const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  define,
};

async function build() {
  try {
    if (isWatch) {
      const context = await esbuild.context(buildOptions);
      await context.watch();
      console.log('Watching for changes...');
    } else {
      await esbuild.build(buildOptions);
      console.log('Build complete');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
