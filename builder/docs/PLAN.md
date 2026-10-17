# Aragonez Builder — Plano (Fase 0)

Plataforma web para criar, editar e exportar carrosséis e posts para redes sociais. Usuários: Grupo Posittiva (agência) e a marca pessoal de Victor Aragonez. Projeto novo, sem nada da versão antiga. A interface é toda em português do Brasil.

> Status: **aguardando aprovação**. Nenhum código da aplicação foi escrito ainda.

---

## 0. Decisões que preciso de você

1. **Onde o projeto vai morar.**
   - Esta sessão só tem acesso ao repositório `agenciaposittiva-dot/Victor`, branch `claude/festive-rubin-r3h449`. Esse repositório já tem git e guarda arquivos da versão antiga.
   - Proposta: criar o projeto novo na pasta isolada `builder/`, com `package.json`, `netlify.toml` e testes próprios. Os arquivos antigos ficam como estão e não são abertos.
   - No Netlify, isso exige configurar **Base directory = `builder`**.
   - Se preferir um repositório só para o projeto (o "git init" do pedido), crie o repositório vazio e me passe o nome. Eu movo a pasta com o histórico de commits (`git subtree split`).
2. **Pasta `referencias/` não existe.** Procurei nos dois repositórios e em todas as branches. Veja a seção 2 e o arquivo `docs/PENDENCIAS.md`.
3. **Aprovação do plano.** Com o seu ok, começo a Fase 1.

---

## 1. Resumo da solução

- **Um renderizador único.** Cada slide é um componente React puro: `<Slide layout tipo conteudo brandKit />`. Ele desenha em pixels reais na base 1080, com posição absoluta.
  - O mesmo componente serve para o canvas do editor, as miniaturas e a exportação. Só muda a escala (`transform: scale`) no preview.
  - Assim, o que aparece na tela é o que sai no arquivo.
- **Tokens.** Cores e fontes do layout apontam para o Brand Kit (`{cores.primaria}`, `{fontes.titulo}`). Trocar o kit re-veste tudo.
- **Projeto = só conteúdo e ajustes.** O layout continua reutilizável.
- **Segredos só nas Netlify Functions.** O front nunca vê chave.
- **Supabase** para login, banco (com RLS) e arquivos. Sem as variáveis do Supabase, o app entra em **modo local**: sem login e com dados em IndexedDB.

---

## 2. Referências analisadas

### 2.1 Figma "Victor Aragonez" (`SjDnOmy2k55O61mtqLpxMu`): acessível pelo MCP

A página "Rede Social" tem 4 carrosséis da marca. O pedido usa o primeiro como referência.

**Carrossel escuro "Prompt bonito não paga boleto"**: frames `10:11` a `10:274`, 8 slides de 1080×1350.

| Slide | Nome no Figma |
|---|---|
| 01 | Capa |
| 02 | Ferramentas |
| 03 | Atalho |
| 04 | Sem cliente |
| 05 | Comparação |
| 06 | Checklist |
| 07 | Problema resolvido |
| 08 | CTA (fundo laranja) |

Estrutura que já confirmei:

- **Faixa contínua.**
  - "Fundo contínuo": um retângulo de **8640×1350** (8 × 1080), repetido em cada frame com deslocamento −1080·i.
  - "Linha contínua": um único vetor de **6762×876** em x=870, y=230 da faixa. É a linha de luz que atravessa os slides.
  - "Glow ponte": brilhos posicionados sobre a divisa entre slides, para a passagem ficar suave.
- **Brilhos (glows).** Elipses grandes de 600 a 900px por slide, mais "Brilho de tela", "Escurecer" e "Horizonte" (elipse de 2000×1000 na base).
- **Capa.**
  - Etiqueta `// PAPO RETO PRA DESIGNER` em JetBrains Mono, x=120, y=413.
  - Título em x=120, y=472, w=870 (Space Grotesk Light, com "boleto." em Instrument Serif Itálico).
  - Sublinhado laranja de 120×5 em y=887.
  - Subtítulo em y=917, w=880.
  - Header (avatar de 64px + nome) em x=72, y=1213.
  - "Arraste pro lado→" no canto inferior direito.
- **Componentes.** `Carrossel/Header` (299×64) e `Carrossel/Handle` (302×64) são símbolos reutilizados.
- **Margens recorrentes.** 72px nas laterais e no rodapé; 118 a 120px no bloco de texto.
- **CTA.**
  - Fundo laranja em gradiente.
  - Header centralizado com avatar, nome e @handle.
  - Título em duas cores (a primeira frase com opacidade menor).
  - Caixa preta arredondada de 936×112 com ícone de comentário.
- **Variante clara.** O frame `45:188` é uma faixa de 8640×1350 com fundo creme e acentos laranja. Fica como opção de seed "Victor Aragonez — Claro" (fora do escopo obrigatório).

A rede da sessão bloqueia o download direto de `figma.com`, mas as capturas chegam embutidas pelo MCP. Na Fase 4, exporto cada slide em 1080×1350 para `referencias/victor-aragonez/` e uso como gabarito da regressão visual. As medidas finas (cores exatas, tamanhos de fonte, entrelinha) saem de `get_design_context` no mesmo momento.

### 2.2 `referencias/feira-nova/`: ausente

Os JPGs das receitas Feira Nova não estão no repositório. Sigo com os valores descritos no pedido (Montserrat, cores, estrutura de Capa, Ingredientes e Passo a passo). O seed fica pronto, e a conferência visual e o teste do JPG → Layout ficam pendentes até você enviar as imagens (ver `PENDENCIAS.md`).

---

## 3. Arquitetura e stack

| Camada | Escolha | Por quê |
|---|---|---|
| Build | **Vite 8 + React 19 + TypeScript estrito** | Rápido, padrão de mercado, HMR. |
| Estado | **Zustand** (+ `immer` e um middleware de histórico próprio) | Simples. Desfazer e refazer viram uma pilha de patches. |
| Rotas | React Router (rotas lazy) | Editor e admin carregados sob demanda. |
| Validação | **Zod 4** | Schemas únicos para layouts, projetos, Brand Kits e respostas da IA. `z.toJSONSchema()` gera o JSON Schema do *tool use* da IA sem outra biblioteca. |
| Estilo da interface | CSS Modules + tokens em variáveis CSS | Sem framework pesado. Tema escuro com preto quente e laranja (tokens do kit Victor Aragonez). |
| Arrastar listas | `@dnd-kit` | Faixa de slides e painel de camadas. |
| Interação no canvas | Própria (pointer events) sobre o DOM do renderizador | Mover, redimensionar, girar, snapping e régua. O renderizador é DOM; um canvas como Konva quebraria a regra de "um único renderizador". |
| Exportação | **modern-screenshot** ou html-to-image (escolha medida na Fase 2), **jsPDF**, **JSZip** | Na Fase 2, os dois passam pelo mesmo teste de pixels; fica o mais fiel. modern-screenshot é o candidato, por embutir melhor as fontes e usar worker. |
| Fontes | **@fontsource** (Space Grotesk, Instrument Serif, JetBrains Mono, Montserrat…) servidas pelo próprio site, mais Google Fonts sob demanda e upload de TTF/OTF/WOFF2 | As fontes são embutidas na exportação e funcionam sem internet. |
| PDF de entrada | pdf.js (`pdfjs-dist`), lazy | Uma página vira um slide no JPG → Layout. |
| Backend | **Netlify Functions** (TypeScript) | IA, análise de imagem, rate limit e operações de admin com a service role. |
| IA | `@anthropic-ai/sdk`, modelo na constante `AI_MODEL` (padrão `claude-sonnet-5-5`) | Visão e *tool use* com JSON Schema. |
| Auth, banco e arquivos | **Supabase** (Auth + Postgres com RLS + Storage) | Sem variáveis, cai para o modo local (IndexedDB via `idb`). |
| Testes | **Vitest** (unidade) e **Playwright** (E2E e regressão visual; o Chromium já está instalado no ambiente) | |
| Qualidade | ESLint (flat config) + Prettier + `tsc --noEmit` no CI | |

### 3.1 Renderizador (o coração)

```
<SlideCanvas w h escala>              ← preview (scale), miniatura (scale pequeno), exportação (1× ou 2×)
  <Fundo fundo tokens />              ← cor | gradiente | imagem | brilhos (radial-gradient, sem filter)
  {camadas.map(c => <Camada c conteudo tokens />)}
</SlideCanvas>
```

- **Resolução de tokens.** `resolver(valor, brandKit)` troca `{cores.x}`, `{fontes.y}` e `{handle}` pelos valores do kit. Função pura, coberta por teste.
- **Destaque inline.** `parseDestaque("Prompt bonito não paga *boleto.*")` devolve trechos `[normal | destaque]`. O trecho de destaque recebe `camada.destaque` (fonte, itálico, cor). Função pura, coberta por teste.
- **Auto-ajuste do texto.** Busca binária do tamanho da fonte, medindo num nó oculto com a mesma fonte e largura. O resultado fica em cache por (texto, fonte, largura, altura), e a exportação usa o mesmo tamanho calculado.
- **Brilhos sem `filter: blur`.** Uso `radial-gradient` elíptico com várias paradas. Fica idêntico no preview e na exportação e é muito mais leve.
- **Linha de luz.** SVG com `path` e traço em gradiente. O brilho em volta é um segundo traço largo e de baixa opacidade, sem filtro SVG, pelo mesmo motivo.

### 3.2 Carrossel contínuo

- O layout contínuo tem **camadas de faixa** (`layout.faixa.camadas`), com x medido na faixa inteira (0 a N×1080). As camadas de cada tipo de slide continuam locais.
- Como N muda por projeto, a geometria da faixa aceita **âncoras**:
  - `ancora: { slide: n | 'ultimo', x }` posiciona em relação a um slide;
  - `estica: true` ocupa a faixa toda.
- A **linha de luz** é uma forma procedural (`forma: 'linhaDeLuz'`, com semente e amplitude). O caminho é recalculado para N slides, e o seed Victor Aragonez reproduz a curva do Figma em N=8.
- **Editor.** No modo faixa, os slides ficam lado a lado (N×1080), as divisas aparecem marcadas e qualquer camada pode atravessar.
- **Exportação.**
  - A faixa é renderizada uma vez num canvas de N×W×escala.
  - Depois é **fatiada com `drawImage` em offsets inteiros** (i·W·escala). Não sobra nem falta 1px, e há teste automatizado para isso.
  - Em aparelhos com limite de canvas (iOS Safari: cerca de 16,7 MP), a exportação cai para "slide a slide com recorte" (`clip` + `translate`), com o mesmo teste.

### 3.3 Fluxo do JPG → Layout

```
cliente: upload (JPG/PNG/WebP/PDF→páginas) ─▶ guarda original (Storage/IndexedDB)
         └▶ cópia reduzida (lado maior 1568px, JPEG q≈0,85)
                 │
                 ▼
function analyze-layout (Netlify, segredo no servidor)
   └▶ Claude com visão + tool "registrar_layout" (input_schema = z.toJSONSchema(LayoutAnalise))
   └▶ valida com Zod ─✗─▶ 1 reparo (manda o erro de volta) ─✗─▶ devolve bruto + erros
                 │✓
                 ▼
cliente: normaliza para base 1080 · recorta o logo da imagem ORIGINAL pela bbox · agrupa slides iguais em tipos
         └▶ Editor em Modo Comparar (original sobreposta, slider de opacidade, "diferença")
         └▶ "Salvar como layout" + oferecer criar Brand Kit com a paleta e as fontes detectadas
```

- **Limites do Netlify.**
  - O corpo da requisição tem limite de cerca de 6 MB. Por isso as imagens sobem antes para o Storage (ou vão uma por chamada no modo local).
  - O tempo da function é limitado. A análise roda **uma imagem por chamada** em paralelo controlado, e o agrupamento em tipos é uma segunda chamada leve, só com os resultados em JSON.
  - Se ainda faltar tempo, troco para *Background Function* com consulta de status. Fica registrado como risco R5.
- **Modo rápido.** A imagem original vira fundo travado, e eu marco retângulos que viram campos de texto ou imagem. Não depende de IA.

---

## 4. Estrutura de pastas

```
builder/
├─ docs/                     PLAN.md · PENDENCIAS.md · COMO-CRIAR-LAYOUT.md · SUPABASE.md
├─ referencias/              victor-aragonez/ · feira-nova/ (gabaritos para testes e JPG→Layout)
├─ public/                   fontes/ (woff2) · seeds/ (assets dos layouts iniciais)
├─ src/
│  ├─ app/                   rotas, layout da interface, providers, onboarding
│  ├─ ui/                    componentes da interface (Botao, Campo, Dialogo, Toast, Vazio…) + tokens.css
│  ├─ dominio/
│  │  ├─ schemas/            zod: brandKit, layout, camada, fundo, projeto, analise-ia, conteudo-ia
│  │  ├─ tokens.ts           resolver {cores.x}/{fontes.y}
│  │  ├─ destaque.ts         parser de *destaque*
│  │  ├─ autoajuste.ts       tamanho de fonte que cabe
│  │  ├─ faixa.ts            geometria contínua, âncoras, linha de luz, fatiamento
│  │  └─ componentes.ts      instâncias de componente + overrides
│  ├─ render/                Slide, Fundo, CamadaTexto/Imagem/Forma/Logo/Icone/Grupo/Componente, Faixa
│  ├─ editor/                Canvas, Seleção, Alças, Snapping, Régua, Painéis (Camadas, Propriedades, Conteúdo),
│  │                         FaixaDeSlides, Atalhos, ModoComparar, historico.ts (desfazer/refazer)
│  ├─ exportar/              motor (modern-screenshot), fontes-embutidas, jpg/png/pdf/zip, nomes de arquivo
│  ├─ biblioteca/            galeria, filtros, importar/exportar .json
│  ├─ brandkits/             CRUD, upload de fontes (@font-face), logos e assets
│  ├─ ia/                    cliente da function ai, ImageProvider (interface vazia), JPG→Layout (cliente)
│  ├─ dados/                 repositório com 2 implementações: supabase/ e local/ (IndexedDB) + autosave
│  ├─ seeds/                 victor-aragonez.ts · feira-nova.ts · genericos/ (11 × 3 formatos)
│  └─ admin/                 usuários, publicação de layouts, uso de IA
├─ netlify/functions/        ai.ts · analyze-layout.ts · admin.ts · _lib/ (auth, rate-limit, anthropic, erros)
├─ supabase/                 migrations/*.sql (tabelas, RLS, buckets) · seed.sql
├─ tests/
│  ├─ unit/                  (Vitest) schemas, tokens, destaque, autoajuste, faixa/fatiamento, histórico
│  └─ e2e/                   (Playwright) fluxos + visual/ (gabaritos dos seeds)
├─ netlify.toml · vite.config.ts · tsconfig.json · eslint.config.js · .prettierrc · .env.example
└─ README.md
```

---

## 5. Modelo de dados (refinado)

```ts
// ——— Brand Kit ———
type Fonte = { familia: string; peso?: number; italico?: boolean; origem: 'google' | 'local' | 'upload'; arquivoId?: string };
type Asset = { id: string; nome: string; tipo: 'logo' | 'pattern' | 'textura' | 'selo' | 'foto' | 'fonte' | 'icone';
               variacao?: 'clara' | 'escura' | 'icone'; url: string; w?: number; h?: number };
type BrandKit = {
  id: string; nome: string; clienteId?: string; donoId?: string;
  cores: Record<string, string>;        // primaria, secundaria, fundo, texto, destaque… (hex; aceita #rrggbbaa)
  fontes: { titulo: Fonte; corpo: Fonte; destaque?: Fonte; etiqueta?: Fonte };
  logos: Asset[]; assets: Asset[]; handle?: string; tomDeVoz?: string;
  layoutPadraoId?: string;              // "Victor Aragonez — Carrossel Escuro" para o kit Victor
  atualizadoEm: string;
};

// ——— Cliente (pastas e filtro) ———
type Cliente = { id: string; nome: string; brandKitId?: string; cor?: string; criadoEm: string };

// ——— Layout ———
type Formato = { w: number; h: number };            // 1080×1350 · 1080×1080 · 1080×1920
type Fundo =
  | { tipo: 'cor'; cor: string }
  | { tipo: 'gradiente'; angulo: number; paradas: { cor: string; pos: number }[] }
  | { tipo: 'imagem'; assetId?: string; url?: string; ajuste: 'cover' | 'contain'; foco?: Ponto; travada?: boolean }
  | { tipo: 'brilhos'; base: string; brilhos: Brilho[] };
type Brilho = { x: number; y: number; w: number; h: number; cor: string; intensidade: number; suavidade: number };
type Sombra = { x: number; y: number; desfoque: number; cor: string };

type CamadaBase = {
  id: string; tipo: 'texto' | 'imagem' | 'forma' | 'logo' | 'icone' | 'grupo' | 'componente';
  x: number; y: number; w: number; h: number; rotacao?: number; opacidade?: number;
  oculta?: boolean; travada?: boolean; editavel?: boolean; rotulo?: string; nome?: string;
  ancora?: { slide: number | 'ultimo' };   // só em camadas de faixa
  estica?: boolean;                        // ocupa a faixa toda (camadas de faixa)
};
type CamadaTexto = CamadaBase & { tipo: 'texto'; texto: string;
  fonte?: string; tamanho?: number; peso?: number; italico?: boolean; cor?: string;
  alinhamento?: 'left' | 'center' | 'right'; alinhamentoV?: 'top' | 'middle' | 'bottom';
  entrelinha?: number; espacamento?: number; autoAjuste?: boolean; tamanhoMin?: number;
  maxCaracteres?: number; caixaAlta?: boolean;
  contorno?: { cor: string; largura: number }; sombra?: Sombra;
  destaque?: { fonte?: string; peso?: number; italico?: boolean; cor?: string } };
type CamadaImagem = CamadaBase & { tipo: 'imagem' | 'logo'; assetId?: string; url?: string; placeholder?: string;
  ajuste?: 'cover' | 'contain'; foco?: Ponto; zoom?: number; raio?: number;
  filtros?: { brilho?: number; contraste?: number; saturacao?: number; pb?: boolean };
  borda?: { cor: string; largura: number }; sombra?: Sombra };
type CamadaForma = CamadaBase & { tipo: 'forma'; forma: 'retangulo' | 'elipse' | 'linha' | 'caminho' | 'linhaDeLuz';
  preenchimento?: string | Gradiente; borda?: { cor: string; largura: number }; raioBorda?: number;
  caminho?: string; parametros?: Record<string, number> };
type CamadaIcone = CamadaBase & { tipo: 'icone'; nome: string; cor?: string; traco?: number };
type CamadaGrupo = CamadaBase & { tipo: 'grupo'; filhos: Camada[] };
type CamadaComponente = CamadaBase & { tipo: 'componente'; componenteId: string;
  overrides?: Record<string /* id da camada interna */, Partial<Camada>> };
type Camada = CamadaTexto | CamadaImagem | CamadaForma | CamadaIcone | CamadaGrupo | CamadaComponente;

type Componente = { id: string; nome: string; w: number; h: number; camadas: Camada[] };   // ex.: Header, Handle
type TipoDeSlide = { id: string; nome: string; fundo: Fundo; camadas: Camada[]; repetivel?: boolean };
type Layout = {
  id: string; nome: string; categoria: string; tags: string[];
  brandKitId?: string; formato: Formato; continuo?: boolean;
  faixa?: { fundo?: Fundo; camadas: Camada[] };           // só se continuo
  componentes: Componente[]; tiposDeSlide: TipoDeSlide[];
  margemSegura?: { x: number; y: number };
  status: 'rascunho' | 'publicado'; donoId?: string; origem?: 'seed' | 'editor' | 'jpg';
  miniaturaUrl?: string; versaoSchema: 1; atualizadoEm: string;
};

// ——— Projeto ———
type SlideDoProjeto = { id: string; tipoId: string;
  conteudo: Record<string /* camadaId */, string | { assetId?: string; url?: string; foco?: Ponto; zoom?: number }>;
  overrides?: Record<string /* camadaId */, Partial<Camada>>; camadasExtras?: Camada[] };
type Projeto = { id: string; nome: string; clienteId?: string; layoutId: string; brandKitId: string;
  formato: Formato; slides: SlideDoProjeto[]; faixaOverrides?: Record<string, Partial<Camada>>;
  legenda?: { texto: string; hashtags: string[]; cta: string };
  miniaturaUrl?: string; donoId?: string; atualizadoEm: string };
type Versao = { id: string; projetoId: string; criadoEm: string; rotulo?: string; dados: Projeto };

// ——— IA ———
type LayoutAnalise = { formato: Formato; paleta: { hex: string; tokenSugerido: string }[];
  fontes: { bloco: string; familiaGoogle: string; peso: number; italico: boolean }[];
  blocos: (CamadaTexto | CamadaImagem | CamadaForma)[]; logo?: { x: number; y: number; w: number; h: number };
  confianca: number; observacoes?: string };
type ConteudoGerado = { slides: { tipoId: string; campos: Record<string, string>; sugestaoFoto?: Record<string, string> }[];
  legenda?: { texto: string; hashtags: string[]; cta: string } };
```

Notas:

- **Precedência.** O que o projeto define vence o que o layout define. A ordem é: `override do projeto` > `conteúdo do projeto` > `camada do layout` > `token do Brand Kit`.
- **Componentes.** O layout guarda a definição uma vez, e cada uso guarda só o `componenteId` e os overrides. Editar o componente atualiza todos os usos.
- **Migração.** `versaoSchema` permite migrar layouts antigos. Importar um `.json` valida e migra.

### 5.1 Tabelas no Supabase (Postgres com RLS)

| Tabela | Colunas principais | RLS |
|---|---|---|
| `perfis` | `id (= auth.users.id)`, `nome`, `papel ('admin'\|'designer')` | Cada um lê o próprio perfil; admin lê todos. Só admin muda o papel. |
| `clientes` | `id`, `dono_id`, `nome`, `brand_kit_id`, `cor` | O dono faz tudo; admin lê. |
| `brand_kits` | `id`, `dono_id`, `dados jsonb`, `atualizado_em` | O dono faz tudo; admin lê. |
| `layouts` | `id`, `dono_id`, `status`, `categoria`, `dados jsonb`, `miniatura_url` | O dono faz tudo. **Todos leem os `publicado`.** Só admin muda o status para `publicado`. |
| `projetos` | `id`, `dono_id`, `cliente_id`, `layout_id`, `dados jsonb`, `miniatura_url`, `atualizado_em` | O dono faz tudo. |
| `versoes` | `id`, `projeto_id`, `dono_id`, `rotulo`, `dados jsonb`, `criado_em` | O dono faz tudo. |
| `uso_ia` | `id`, `usuario_id`, `acao`, `tokens_in`, `tokens_out`, `criado_em` | Só a function grava (service role); admin lê tudo; cada um lê o seu. |

- **Storage.** Buckets `uploads` (fotos e logos) e `fontes`, com caminho `{usuario_id}/…` e política "só o dono". O bucket `publicos` guarda os assets de layouts publicados, com leitura para todos os autenticados.
- **Admin.** O primeiro admin é criado por SQL. O passo a passo vai no README e em `docs/SUPABASE.md`.

---

## 6. Fases, entregas e esforço

O esforço é estimado em sessões de trabalho meu, e cada fase fecha com build limpo, testes verdes, `grep` de segredos e um commit.

| Fase | Entrega | Pronto quando | Esforço |
|---|---|---|---|
| **0** | Este plano | `docs/PLAN.md` aprovado por você | ✔ |
| **1** | Base | Vite/TS/ESLint/Prettier/Vitest/Playwright configurados, tema da interface, navegação entre Dashboard, Biblioteca, Editor e Brand Kits (telas vazias com orientação), modo local detectado | P (≈0,5) |
| **2** | Motor de layout e exportação | Schemas Zod; renderizador único (texto com destaque e auto-ajuste, imagem, forma, brilhos, linha de luz, componentes, faixa); comparação modern-screenshot × html-to-image; um layout de teste exportando JPG, PNG, PDF e ZIP; testes de exportação (diferença de pixels contra o preview) e de fatiamento | M (≈1,5) |
| **3** | Editor completo | Tudo da seção 5.1 do pedido: zoom e pan, seleção múltipla, mover, redimensionar e girar, alinhar e distribuir, snapping, guias e régua, camadas, propriedades, texto inline, imagem com foco, zoom e filtros, faixa de slides, desfazer ilimitado, autosave, atalhos com painel "?", Modo Conteúdo × Modo Design, "Salvar como layout", modo faixa contínua | G (≈3) |
| **4** | Brand Kits, biblioteca e seeds | CRUD de kits com fontes por upload; biblioteca com busca, filtros, favoritos, rascunho/publicado e importar/exportar `.json`; seeds Victor Aragonez (conferido contra o Figma), Feira Nova e coleção genérica (11 modelos × 3 formatos); trocar de kit re-veste tudo | G (≈2,5) |
| **5** | IA e JPG → Layout | Functions `ai` e `analyze-layout` rodando no `netlify dev`; geração de carrossel preenchendo campos (com `maxCaracteres` e `*destaque*`); ações por campo; legenda com hashtags; `ImageProvider` vazio; rate limit; JPG → Layout com reparo, Modo Comparar, recorte de logo, agrupamento de tipos, criar kit a partir da análise, modo rápido | G (≈2,5) |
| **6** | Contas, nuvem e admin | Login real e recuperação de senha, papéis, RLS testado (testes SQL e E2E com dois usuários), autosave na nuvem, versões, Storage com compressão, admin (usuários, publicação, uso de IA), modo local funcionando sem Supabase | M (≈1,5) |
| **7** | Polimento e deploy | E2E de login → criar → editar → exportar JPG; regressão visual dos seeds; onboarding de 3 passos; celular (ver, preencher no Modo Conteúdo, exportar); acessibilidade básica; README e documentação; `netlify.toml` com headers e cache | M (≈1) |

Total: cerca de 12 sessões. As fases 3, 4 e 5 são as maiores. Se alguma fase não couber numa sessão, entrego sub-commits dentro dela e só fecho a fase quando o critério de aceite estiver cumprido.

---

## 7. Riscos técnicos e como reduzo cada um

| # | Risco | Impacto | Mitigação |
|---|---|---|---|
| R1 | **Fontes na exportação.** A biblioteca de captura não embute uma fonte, ou captura antes de ela carregar, e o texto sai com a fonte errada. | Alto | Fontes servidas pelo próprio site (woff2 da @fontsource). Antes de capturar: `document.fonts.load()` de cada família usada e `document.fonts.ready`. As fontes vão embutidas como data URL no SVG da captura. Teste de pixels na Fase 2. |
| R2 | **Efeitos que não passam pelo foreignObject**: `filter: blur`, `backdrop-filter`, `mix-blend-mode`, máscaras. | Alto | O renderizador **evita** esses efeitos: brilhos com `radial-gradient`, linha de luz com traço duplo, sombras com `box-shadow`/`text-shadow` (que funcionam). Lista de propriedades proibidas no renderizador, com teste. |
| R3 | **Imagens e CORS** (canvas "contaminado" pela origem). | Médio | Toda imagem vira data URL ou blob antes da captura; o Storage é servido com CORS liberado para o domínio. `img.decode()` em todas antes de capturar. |
| R4 | **Diferença de 1px no carrossel contínuo**, ou limite de tamanho do canvas no iOS. | Médio | Fatiar uma única captura com offsets inteiros; teste que compara as colunas da divisa (a última coluna do slide i com a primeira do slide i+1 na faixa). Plano B para iOS: um slide por vez com recorte. |
| R5 | **JPG → Layout impreciso**: fontes "próximas", posições aproximadas, texto mal transcrito. Mais os limites de tempo e de tamanho da function. | Alto | JSON Schema estrito com tool use; prompt com régua de coordenadas (base 1080 e a proporção informada); validação com uma tentativa de reparo; **Modo Comparar** para o ajuste final; modo rápido como alternativa garantida. Uma imagem por chamada (cabe no tempo e no limite de 6 MB) e Background Function se precisar. |
| R6 | **Diferenças de renderização de texto entre navegadores** (quebra de linha, kerning). | Médio | O auto-ajuste e a quebra são medidos no mesmo navegador que exporta. A regressão visual roda no Chromium; tolerância de diferença documentada. |
| R7 | **Desempenho com 20 slides** no editor. | Médio | Memoização por slide, miniaturas virtualizadas, renderização só do slide ativo em escala total, histórico com patches (immer) e não com cópias. |
| R8 | **RLS mal configurada** expondo projetos de outro usuário. | Alto | Migrações versionadas, testes com dois usuários na Fase 6, e a service role só dentro das functions. |
| R9 | **Custo e abuso da IA.** | Médio | Rate limit por usuário (tabela `uso_ia`); limite de imagens por análise; mensagens claras em português; o admin vê o uso. |
| R10 | **Referências ausentes** (Feira Nova). | Médio | O seed segue a descrição do pedido; a conferência fica pendente sem travar o resto. |

---

## 8. O que você precisa fazer manualmente

1. **Decidir onde o projeto mora** (seção 0) e aprovar este plano.
2. **Enviar `referencias/feira-nova/`.** Preciso dos JPGs da Capa, dos Ingredientes e do Passo a passo. Se possível, também do logo Feira Nova em PNG transparente e da textura verde do fundo.
3. **Kit Victor Aragonez.** Envie a foto do avatar usada no Header (ou autorize exportar do Figma) e o balão 3D "Bolha IA", se quiser usá-lo como asset.
4. **Supabase.** Criar o projeto, rodar as migrações de `supabase/migrations` (passo a passo no README) e criar o seu usuário admin.
5. **Netlify.**
   - Ligar o site ao repositório, com Base directory `builder` se ficar neste repositório.
   - Cadastrar as variáveis: `ANTHROPIC_API_KEY`, `AI_MODEL` (opcional), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` (esta só nas functions).
   - O **Netlify Drop não publica functions**, então não serve para este projeto.
6. **(Depois) Chave do Freepik** ou de outro serviço de imagem, para ligar o `ImageProvider`.

Enquanto nada disso chega, o app funciona em **modo local** (sem login, dados no navegador), e a IA mostra uma mensagem clara de "chave não configurada". As pendências ficam em `docs/PENDENCIAS.md`.

---

## 9. Regras que vou seguir em todas as fases

- Um commit por fase, com mensagem clara. Antes do commit: `npm run build`, `npm test`, E2E da fase e um `grep` de segredos (`sk-ant`, `service_role`, `eyJ`, senhas).
- Nenhuma chave no front: só `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (públicas por natureza, protegidas pela RLS).
- No fim de cada fase: um resumo curto do que mudou e do que testar.
