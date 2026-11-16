import { existsSync, copyFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const root = process.cwd();
const envPath = path.join(root, '.env');
const envExamplePath = path.join(root, '.env.example');

if (!existsSync(envPath) && existsSync(envExamplePath)) {
  copyFileSync(envExamplePath, envPath);
  console.log('Created .env from .env.example');
}

execSync('npm --workspace packages/shared run build', { stdio: 'inherit' });
execSync('npm run seed', { stdio: 'inherit' });
