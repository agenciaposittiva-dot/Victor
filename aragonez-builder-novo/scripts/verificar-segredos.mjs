// Procura chaves, tokens e senhas no código que vai para o git e no build (dist/). Roda antes de cada commit.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = process.cwd();
const PASTAS = [
  'src',
  'public',
  'netlify',
  'scripts',
  'tests',
  'supabase',
  'dist',
  'docs',
  'referencias',
  'index.html',
  'netlify.toml',
  '.env.example',
  'README.md',
];
const IGNORAR = /node_modules|\.woff2?$|\.png$|\.jpe?g$|\.webp$|\.map$|verificar-segredos\.mjs$/;
const PADROES = [
  [/sk-ant-[a-zA-Z0-9_-]{20,}/, 'chave da Anthropic'],
  [/eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}/, 'token JWT (Supabase service role/anon)'],
  [/(?:SUPABASE_SERVICE_ROLE_KEY|ANTHROPIC_API_KEY)\s*[:=]\s*['"][^'"\s]{8,}/, 'chave atribuída no código'],
  [/AIza[0-9A-Za-z_-]{30,}/, 'chave do Google'],
  [/(?:senha|password|passwd)\s*[:=]\s*['"][^'"\s]{4,}['"]/i, 'senha escrita no código'],
];

const arquivos = [];
const andar = (p) => {
  let st;
  try {
    st = statSync(p);
  } catch {
    return;
  }
  if (st.isDirectory()) {
    for (const f of readdirSync(p)) andar(join(p, f));
    return;
  }
  if (!IGNORAR.test(p)) arquivos.push(p);
};
PASTAS.forEach((p) => andar(join(RAIZ, p)));

const achados = [];
for (const f of arquivos) {
  const linhas = readFileSync(f, 'utf8').split('\n');
  linhas.forEach((l, i) => {
    for (const [re, nome] of PADROES) if (re.test(l)) achados.push(`${relative(RAIZ, f)}:${i + 1}  ${nome}`);
  });
}
if (achados.length) {
  console.error('Possíveis segredos encontrados:\n' + achados.join('\n'));
  process.exit(1);
}
console.log(`Nenhum segredo encontrado (${arquivos.length} arquivos verificados).`);
