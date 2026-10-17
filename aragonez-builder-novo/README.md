# Aragonez Builder

Plataforma web para criar, editar e exportar carrosséis e posts para redes sociais, para o Grupo Posittiva e a marca pessoal de Victor Aragonez. Interface em português do Brasil.

Este projeto vive **só nesta pasta** (`aragonez-builder-novo/`), com `package.json`, `netlify.toml` e testes próprios. O restante do repositório não faz parte dele.

> Em construção por fases. Plano completo: [`docs/PLAN.md`](docs/PLAN.md). O que depende de você: [`docs/PENDENCIAS.md`](docs/PENDENCIAS.md).

## Rodar localmente

Requisitos: Node 20 ou mais novo.

```bash
cd aragonez-builder-novo
npm install
npm run dev        # http://localhost:5173
```

Sem as variáveis do Supabase, o app roda em **modo local**: sem login e com os dados no navegador. Veja `.env.example`.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Checagem de tipos (TypeScript estrito) e build de produção em `dist/` |
| `npm run lint` · `npm run format` | ESLint e Prettier |
| `npm test` | Testes de unidade (Vitest) |
| `npm run test:e2e` | Testes de ponta a ponta (Playwright; roda o build antes com `npm run build`) |
| `npm run segredos` | Procura chaves e senhas no código e no build (rodar antes de cada commit) |

## Publicar no Netlify

Crie um site ligado ao repositório com **Base directory = `aragonez-builder-novo`**. O comando de build, a pasta publicada e as functions já estão no `netlify.toml` desta pasta.

O Netlify Drop (arrastar a pasta) **não publica functions**, então não serve para este projeto.

A configuração completa (Supabase, variáveis e usuário admin) entra neste README na Fase 7.
