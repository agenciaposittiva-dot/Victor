# Aragonez Builder

Sistema operacional de conteúdo para Instagram: clientes, criação de carrosséis, posts, stories e anúncios com IA, radar de marca, tendências, templates, biblioteca e calendário editorial.

## Estrutura

| Arquivo | Função |
| --- | --- |
| `index.html` | Entrada do site (cópia de `Aragonez Builder.dc.html`) |
| `Aragonez Builder.dc.html` | Aplicação, versão para edição |
| `SlideIcarus.dc.html` | Componente que desenha cada slide |
| `store.js` | Camada de dados (localStorage, chave `aragonez-db`) |
| `ai-client.js` | Ponte do navegador com a função de IA |
| `cloud-client.js` | Ponte com a nuvem (login e sincronização) |
| `icons.js` | Galeria de ícones |
| `support.js` | Runtime |
| `netlify/functions/` | Backend: `ai`, `image`, `news`, `instagram`, `cloud` |

## Deploy no Netlify

1. Conecte este repositório no Netlify (publish `.`, functions `netlify/functions`, já definidos no `netlify.toml`).
2. Cadastre as variáveis de ambiente listadas em `.env.example`.
3. Faça o deploy e teste `/.netlify/functions/ai`, `/news`, `/instagram` e `/cloud`.

Mais detalhes nos arquivos `LEIA-ME-*.txt`.

As chaves de API ficam só nas variáveis de ambiente do Netlify. Nunca coloque chaves nos arquivos do repositório.
