import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoDir = join(__dirname, 'data', 'demo-repo');

function run(cmd, opts = {}) {
  execSync(cmd, { cwd: repoDir, stdio: 'pipe', ...opts });
}

function setup() {
  if (existsSync(repoDir)) {
    for (const entry of readdirSync(repoDir)) {
      rmSync(join(repoDir, entry), { recursive: true, force: true });
    }
  } else {
    mkdirSync(repoDir, { recursive: true });
  }

  console.log('  Setting up demo repo...\n');

  writeFileSync(join(repoDir, 'package.json'), JSON.stringify({
    name: 'demo-app',
    version: '1.0.0',
    private: true,
    scripts: { start: 'node index.js', test: 'echo ok' },
    dependencies: { express: '^4.18.0' },
  }, null, 2));

  writeFileSync(join(repoDir, 'index.js'), `const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Hello from demo-app' });
});

app.listen(port, () => {
  console.log(\`Server running on port \${port}\`);
});
`);

  writeFileSync(join(repoDir, '.env.example'), 'PORT=3000\nDATABASE_URL=postgres://localhost:5432/demo\n');

  writeFileSync(join(repoDir, 'README.md'), `# demo-app

A simple Express API demo application.

## Quick start

\`\`\`bash
npm install
npm start
\`\`\`
`);

  run('git init');
  run('git config user.email "demo@nlsh.dev"');
  run('git config user.name "nlsh Demo"');
  run('git add .');
  run('git commit -m "initial commit"');

  mkdirSync(join(repoDir, 'src'), { recursive: true });
  writeFileSync(join(repoDir, 'src', 'routes.js'), `const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

router.get('/users', (req, res) => {
  res.json([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]);
});

module.exports = router;
`);

  // Add a second commit with more content
  run('git add .');
  run('git commit -m "add user routes and health check endpoint"');

  // Make unstaged changes for a richer demo experience
  const indexContent = `const express = require('express');
const routes = require('./src/routes');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use('/', routes);

app.listen(port, () => {
  console.log(\`Server running on port \${port}\`);
});
`;

  writeFileSync(join(repoDir, 'index.js'), indexContent);

  console.log('  Demo repo ready at:', repoDir);
  console.log(`  Content: Express API with ${2} commits + unstaged changes`);
  console.log('  Try: nlsh "push it to main"\n');
}

setup();
