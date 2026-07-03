import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- ENV DIAGNOSTICS ---');
console.log('Current working directory:', process.cwd());

const backendEnvPath = path.join(__dirname, '.env');
const rootEnvPath = path.join(__dirname, '..', '.env');

console.log('Backend .env exists:', fs.existsSync(backendEnvPath));
console.log('Root .env exists:', fs.existsSync(rootEnvPath));

// Load backend env
if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

console.log('Loaded variables:');
console.log('- PORT:', process.env.PORT);
console.log('- NODE_ENV:', process.env.NODE_ENV);
console.log('- SMTP_HOST:', process.env.SMTP_HOST ? 'SET (' + process.env.SMTP_HOST + ')' : 'NOT SET');
console.log('- SMTP_USER:', process.env.SMTP_USER ? 'SET (' + process.env.SMTP_USER + ')' : 'NOT SET');
console.log('- SMTP_PASS:', process.env.SMTP_PASS ? 'SET (length: ' + process.env.SMTP_PASS.length + ')' : 'NOT SET');
console.log('- SMTP_PORT:', process.env.SMTP_PORT);
console.log('- GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET');
console.log('-----------------------');
