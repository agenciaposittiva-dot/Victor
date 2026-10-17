# Pendências (o que depende de você)

Atualizado a cada fase. Enquanto um item não chega, o app segue num modo alternativo, descrito em cada item.

| # | Pendência | Enquanto isso | Fase que usa |
|---|---|---|---|
| 1 | Escolher o nome final da pasta do projeto novo. Hoje é `aragonez-builder-novo/`, porque `aragonez-builder/` já existe com uma versão antiga, que não é alterada. | Sigo em `aragonez-builder-novo/`. | Todas |
| 2 | Pasta `referencias/feira-nova/` com os JPGs da Capa, dos Ingredientes e do Passo a passo. Se possível, o logo em PNG transparente e a textura verde. | O seed "Receitas Feira Nova" segue a descrição do pedido. A conferência visual e o teste do JPG → Layout com essas imagens ficam pendentes. | 4 e 5 |
| 3 | Pasta `referencias/victor-aragonez/`. | As imagens saem do Figma pelo MCP. O download direto de figma.com é bloqueado nesta sessão, mas as capturas chegam pelo MCP. | 4 |
| 4 | Foto do avatar do Header e o balão 3D "Bolha IA" como arquivos (ou autorização para exportar do Figma). | Placeholder com as iniciais "VA". | 4 |
| 5 | Projeto Supabase e as migrações rodadas; o seu usuário admin criado. | Modo local: sem login, dados no navegador (IndexedDB). | 6 |
| 6 | Variáveis no Netlify: `ANTHROPIC_API_KEY`, `AI_MODEL` (opcional), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. | A IA responde "chave não configurada" com orientação; o app roda em modo local. | 5 e 6 |
| 7 | Site novo no Netlify ligado ao repositório `agenciaposittiva-dot/Victor`, com Base directory `aragonez-builder-novo`. | Testes locais com `netlify dev`. | 7 |
| 8 | (Opcional) Chave do Freepik ou de outro serviço de imagem para o `ImageProvider`. | Upload manual de fotos. | 5 |
