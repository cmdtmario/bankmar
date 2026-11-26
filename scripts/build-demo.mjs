// Gera dist-demo/bankmar-demo.html: o app inteiro num arquivo só, com dados fictícios, para olhar sem publicar.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';

const env = { ...process.env, VITE_DEMO: '1', VITE_SUPABASE_URL: 'https://demo.supabase.co', VITE_SUPABASE_ANON_KEY: 'demo' };
execSync('python3 tests/e2e/gerar_demo.py', { stdio: 'inherit' });
execSync('npx vite build --mode demo', { stdio: 'inherit', env });
let html = readFileSync('dist-demo/index.html', 'utf8');
const tipos = { png: 'image/png', jpg: 'image/jpeg' };
for (const f of ['monograma.png', 'logo.jpg', 'icon-192.png', 'apple-touch-icon.png']) {
  const uri = `data:${tipos[f.split('.').pop()]};base64,${readFileSync('public/' + f).toString('base64')}`;
  html = html.replaceAll(`./${f}`, uri).replaceAll(`"/${f}"`, `"${uri}"`).replaceAll('"monograma.png"', `"${uri}"`).replaceAll('"logo.jpg"', `"${uri}"`);
}
html = html.replace('<title>', '<title>Demonstração · ');
writeFileSync('dist-demo/index.html', html);
renameSync('dist-demo/index.html', 'dist-demo/bankmar-demo.html');
console.log('pronto: dist-demo/bankmar-demo.html');
