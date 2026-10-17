import { garantirArquivos, urlDoArquivo } from '@/dados/arquivos';
import { aplicarBackup, analisarBackup, exportarTudo, type DecisaoDeConflito } from '@/dados/backup';
import { acharKit, acharLayout, carregarCatalogo, criarProjeto } from '@/dados/catalogo';
import { prepararImagem } from '@/dados/imagens';
import { repo } from '@/dados/repositorio';
import { Layout, type LayoutEntrada, type Projeto } from '@/dominio/schemas';
import { gerarArquivos } from '@/exportar/exportar';
import { esperarImagens } from '@/exportar/motor';
import { KIT_TESTE, LAYOUT_TESTE } from '@/seeds/teste';

/** Ganchos para os testes automáticos e as capturas no navegador de verdade (Blob, IndexedDB e canvas reais).
 *  Só existem com ?teste na URL e as ferramentas de desenvolvimento ligadas (item T1 do PENDENCIAS). */
const paraBase64 = async (b: Blob) => {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const deBase64 = (b64: string, tipo: string) =>
  new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: tipo });

/** Foto de teste: metade esquerda vermelha, metade direita azul (para conferir a orientação). */
async function fotoDeTeste(w: number, h: number): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ff0000';
  g.fillRect(0, 0, w / 2, h);
  g.fillStyle = '#0000ff';
  g.fillRect(w / 2, 0, w / 2, h);
  return new Promise((ok) => c.toBlob((b) => ok(b!), 'image/jpeg', 0.95));
}

/** Põe no JPEG o EXIF de orientação 6 (o celular gravou deitado: girar 90° no sentido horário para ver em pé). */
async function comOrientacao6(jpg: Blob): Promise<Blob> {
  const b = new Uint8Array(await jpg.arrayBuffer());
  const app1 = [
    0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00,
    0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ];
  return new Blob([b.subarray(0, 2), new Uint8Array(app1), b.subarray(2)], { type: 'image/jpeg' });
}

async function medir(blob: Blob) {
  const img = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const px = (x: number, y: number) => [...g.getImageData(x, y, 1, 1).data.slice(0, 3)];
  const r = { w: img.width, h: img.height, topo: px(img.width / 2, 4), base: px(img.width / 2, img.height - 5) };
  img.close();
  return r;
}

/** Paisagem desenhada no navegador (céu em degradê, sol e morros), para as capturas de tela. */
async function paisagem(w: number, h: number): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const ceu = g.createLinearGradient(0, 0, 0, h);
  ceu.addColorStop(0, '#1d3557');
  ceu.addColorStop(0.55, '#f4a261');
  ceu.addColorStop(1, '#e76f51');
  g.fillStyle = ceu;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffd166';
  g.beginPath();
  g.arc(w * 0.62, h * 0.52, h * 0.14, 0, Math.PI * 2);
  g.fill();
  for (const [cor, base, amp] of [
    ['#3d405b', 0.72, 0.1],
    ['#2b2d42', 0.84, 0.08],
  ] as const) {
    g.fillStyle = cor;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += w / 24) g.lineTo(x, h * (base - amp * Math.sin((x / w) * Math.PI * 3)));
    g.lineTo(w, h);
    g.fill();
  }
  return new Promise((ok) => c.toBlob((b) => ok(b!), 'image/jpeg', 0.9));
}

/** Imagem gerada no navegador: metade esquerda vermelha e direita azul; com alfa, a metade direita é transparente. */
async function imagemDeTeste(w: number, h: number, tipo: 'image/jpeg' | 'image/webp', alfa = false): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ff0000';
  g.fillRect(0, 0, w / 2, h);
  if (!alfa) {
    g.fillStyle = '#0000ff';
    g.fillRect(w / 2, 0, w / 2, h);
  }
  const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, tipo, 0.92));
  c.width = 0;
  c.height = 0;
  return b!;
}

async function medirArquivo(blob: Blob) {
  const img = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const px = (x: number, y: number) => [...g.getImageData(Math.floor(x), Math.floor(y), 1, 1).data];
  const r = { tipo: blob.type, w: img.width, h: img.height, cantoDireito: px(img.width - 3, 3) };
  img.close();
  c.width = 0;
  c.height = 0;
  return r;
}

/** Layout de teste sem a faixa contínua (o fundo da faixa vira o fundo de cada tipo). */
const LAYOUT_TESTE_SOLTO = Layout.parse({
  ...LAYOUT_TESTE,
  id: 'teste-nao-continuo',
  nome: 'Teste (não contínuo)',
  continuo: false,
  faixa: undefined,
  tiposDeSlide: LAYOUT_TESTE.tiposDeSlide.map((t) => ({
    ...t,
    fundo: t.fundo.tipo === 'transparente' ? LAYOUT_TESTE.faixa!.fundo! : t.fundo,
  })),
} as LayoutEntrada);

async function lerProjetoValido(id: string): Promise<Projeto> {
  const p = await repo.atual.lerProjeto(id);
  if (!p?.ok) throw new Error(`Projeto ${id} não encontrado`);
  return p.valor;
}

/** Exporta um slide do projeto em PNG (1×) pelo caminho real, com as fotos guardadas. */
async function exportarSlide(projeto: Projeto, indice: number) {
  const catalogo = await carregarCatalogo();
  const layout = acharLayout(catalogo, projeto.layoutId)!;
  const kit = acharKit(catalogo, projeto.brandKitId) ?? KIT_TESTE;
  return gerarArquivos({
    layout,
    kit,
    projeto,
    indices: [indice],
    formato: 'png',
    escala: 1,
    urlDoAsset: urlDoArquivo,
    garantirArquivos,
  });
}

async function pixels(blob: Blob) {
  const img = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  img.close();
  return g.getImageData(0, 0, c.width, c.height);
}

export function registrarGanchosDeDados() {
  (window as unknown as { __dados: unknown }).__dados = {
    async salvarProjetoComFoto() {
      const foto = await fotoDeTeste(400, 300);
      const arquivoId = await repo.atual.salvarArquivo(foto, 'foto.jpg');
      const p = criarProjeto(LAYOUT_TESTE, KIT_TESTE, 'Projeto com foto');
      p.slides[0]!.conteudo = { foto: { assetId: arquivoId } };
      await repo.atual.salvarProjeto(p);
      return { projetoId: p.id, arquivoId, foto: await paraBase64(foto) };
    },
    async exportar() {
      return paraBase64(await exportarTudo(repo.atual));
    },
    async importar(b64: string, decisoes: Record<string, DecisaoDeConflito> = {}) {
      const analise = await analisarBackup(repo.atual, deBase64(b64, 'application/zip'));
      const resumo = await aplicarBackup(repo.atual, analise, decisoes);
      return { conflitos: analise.conflitos.length, ...resumo };
    },
    async lerProjeto(id: string) {
      const p = await repo.atual.lerProjeto(id);
      return p?.ok ? p.valor : null;
    },
    async lerArquivo(id: string) {
      const b = await repo.atual.lerArquivo(id);
      return b ? { tipo: b.type, base64: await paraBase64(b) } : null;
    },
    async prepararFotoGirada(w: number, h: number) {
      const original = await comOrientacao6(await fotoDeTeste(w, h));
      const r = await prepararImagem(original);
      return { largura: r.largura, altura: r.altura, reduzida: r.reduzida, saida: await medir(r.blob) };
    },
    /** Cria um projeto do layout de teste e devolve o id. tipos: os tipos dos slides; fotoVazia: slides com o campo
     *  Foto vazio; semKit: aponta para um kit que não existe; solto: o layout de teste sem a faixa contínua. */
    async criarProjetoDeTeste(
      op: { nome?: string; tipos?: string[]; fotoVazia?: number[]; semKit?: boolean; solto?: boolean } = {},
    ) {
      const layout = op.solto ? LAYOUT_TESTE_SOLTO : LAYOUT_TESTE;
      if (op.solto) await repo.atual.salvarLayout({ ...LAYOUT_TESTE_SOLTO, status: 'publicado' });
      const p = criarProjeto(layout, KIT_TESTE, op.nome ?? 'Projeto de teste');
      if (op.tipos) p.slides = op.tipos.map((tipoId, i) => ({ ...p.slides[0]!, id: `s${i}-${p.id}`, tipoId }));
      for (const i of op.fotoVazia ?? []) p.slides[i]!.overrides = { ...p.slides[i]!.overrides, foto: { url: null } };
      if (op.semKit) p.brandKitId = 'kit-que-sumiu';
      await repo.atual.salvarProjeto(p);
      return p.id;
    },
    /** Outra aba salva o projeto (muda o nome): a aba do editor recebe o aviso "salvo em outra aba". */
    async salvarComoOutraAba(id: string) {
      const p = await lerProjetoValido(id);
      await repo.atual.salvarProjeto({ ...p, nome: `${p.nome} (editado em outra aba)` });
    },
    /** Daqui em diante, salvar projeto falha com armazenamento cheio (QuotaExceededError). */
    simularArmazenamentoCheio() {
      repo.atual.salvarProjeto = () => Promise.reject(new DOMException('Sem espaço', 'QuotaExceededError'));
    },
    /** Gera uma foto e envia pelo campo de foto do painel (o mesmo caminho de quem escolhe um arquivo). */
    async enviarFotoNoCampo(op: {
      w: number;
      h: number;
      formato: 'jpeg' | 'webp' | 'heic';
      exif6?: boolean;
      alfa?: boolean;
      paisagem?: boolean;
    }) {
      let blob: Blob;
      let nome: string;
      if (op.paisagem) {
        blob = await paisagem(op.w, op.h);
        nome = 'paisagem.jpg';
      } else if (op.formato === 'heic') {
        blob = new Blob([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99])], { type: 'image/heic' });
        nome = 'foto.heic';
      } else {
        blob = await imagemDeTeste(op.w, op.h, op.formato === 'jpeg' ? 'image/jpeg' : 'image/webp', op.alfa);
        if (op.exif6) blob = await comOrientacao6(blob);
        nome = op.formato === 'jpeg' ? 'foto.jpg' : 'foto.webp';
      }
      const entrada = document.querySelector<HTMLInputElement>('input[type="file"][aria-label="Foto: Foto"]');
      if (!entrada) throw new Error('Campo de foto não encontrado');
      const dt = new DataTransfer();
      dt.items.add(new File([blob], nome, { type: blob.type }));
      entrada.files = dt.files;
      entrada.dispatchEvent(new Event('change', { bubbles: true }));
      return { bytes: blob.size, tipo: blob.type };
    },
    /** O arquivo guardado da foto de um slide (depois do salvamento automático): tipo, tamanho e o canto direito. */
    async arquivoDaFoto(id: string, slide = 0) {
      const p = await lerProjetoValido(id);
      const foto = p.slides[slide]?.conteudo.foto;
      const assetId = typeof foto === 'object' ? foto.assetId : undefined;
      const b = assetId ? await repo.atual.lerArquivo(assetId) : undefined;
      return b ? { assetId, ...(await medirArquivo(b)) } : null;
    },
    /** Cor (RGBA) de alguns pontos do slide exportado em PNG. */
    async pixelsDoSlide(id: string, indice: number, pontos: [number, number][]) {
      const r = await exportarSlide(await lerProjetoValido(id), indice);
      const d = await pixels(r.arquivos[0]!.blob);
      return {
        pontos: pontos.map(([x, y]) => [...d.data.slice((y * d.width + x) * 4, (y * d.width + x) * 4 + 4)]),
        arquivosFaltando: r.arquivosFaltando,
      };
    },
    /** Campo de foto vazio x a mesma camada removida: a fração de pixels diferentes no PNG exportado (0 = igual: o
     *  campo vazio não deixa texto "Imagem" nem listras no arquivo). */
    async compararCampoVazio(id: string, indice = 0) {
      const p = await lerProjetoValido(id);
      const removida = structuredClone(p);
      removida.slides[indice]!.overrides = { ...removida.slides[indice]!.overrides, foto: { removida: true } };
      const [a, b] = await Promise.all([exportarSlide(p, indice), exportarSlide(removida, indice)]);
      const [da, db] = await Promise.all([pixels(a.arquivos[0]!.blob), pixels(b.arquivos[0]!.blob)]);
      let diferentes = 0;
      for (let k = 0; k < da.data.length; k += 4)
        if (
          da.data[k] !== db.data[k] ||
          da.data[k + 1] !== db.data[k + 1] ||
          da.data[k + 2] !== db.data[k + 2] ||
          da.data[k + 3] !== db.data[k + 3]
        )
          diferentes++;
      return diferentes / (da.data.length / 4);
    },
    /** esperarImagens com um SVG só com viewBox (sem width/height) e um src quebrado: quando ainda carregam e
     *  quando já estão prontos ao começar. */
    async testarEsperarImagens() {
      const svg =
        'data:image/svg+xml,' +
        encodeURIComponent(
          "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><rect width='10' height='10' fill='red'/></svg>",
        );
      const quebrado = URL.createObjectURL(new Blob(['isto não é uma imagem'], { type: 'image/png' }));
      const montar = () => {
        const host = document.createElement('div');
        host.innerHTML = `<div data-camada="logo"><img data-asset="a-svg" alt=""></div><div data-camada="foto"><img data-asset="a-quebrado" alt=""></div>`;
        host.querySelector<HTMLImageElement>('[data-asset="a-svg"]')!.src = svg;
        host.querySelector<HTMLImageElement>('[data-asset="a-quebrado"]')!.src = quebrado;
        document.body.appendChild(host);
        return host;
      };
      const h1 = montar();
      const carregando = await esperarImagens(h1);
      // a segunda vez, as imagens já terminaram (prontas ao começar)
      const h2 = montar();
      await new Promise((ok) => setTimeout(ok, 300));
      const prontas = await esperarImagens(h2);
      h1.remove();
      h2.remove();
      URL.revokeObjectURL(quebrado);
      const resumo = (l: Awaited<ReturnType<typeof esperarImagens>>) =>
        l.map((e) => ({ camada: e.camada, asset: e.asset }));
      return { carregando: resumo(carregando), prontas: resumo(prontas) };
    },
    /** Exporta um layout com três fotos: um SVG válido (só viewBox), um arquivo que não abre e um apagado do banco,
     *  direto pelo gerarArquivos (sem conferência antes). Devolve as faltas (campo e slides). */
    async exportarComArquivosRuins() {
      const svg = new Blob(
        [
          "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><circle cx='5' cy='5' r='5' fill='#ff5a1f'/></svg>",
        ],
        { type: 'image/svg+xml' },
      );
      const logo = await repo.atual.salvarArquivo(svg, 'logo.svg');
      const estragada = await repo.atual.salvarArquivo(
        new Blob(['não é imagem'], { type: 'image/png' }),
        'estragada.png',
      );
      const apagada = await repo.atual.salvarArquivo(await imagemDeTeste(40, 40, 'image/jpeg'), 'apagada.jpg');
      await repo.atual.excluirArquivos([apagada]);
      const imagem = (id: string, rotulo: string, x: number, assetId: string) => ({
        id,
        tipo: 'imagem' as const,
        x,
        y: 100,
        w: 200,
        h: 200,
        assetId,
        rotulo,
      });
      const layout = Layout.parse({
        id: 'l-ruins',
        nome: 'Arquivos ruins',
        categoria: 'Teste',
        formato: { w: 1080, h: 1350 },
        tiposDeSlide: [
          {
            id: 's',
            nome: 'Slide',
            fundo: { tipo: 'cor', cor: '#ffffff' },
            camadas: [
              imagem('logo', 'Logo', 40, logo),
              imagem('foto', 'Foto', 300, estragada),
              imagem('selo', 'Selo', 560, apagada),
            ],
          },
        ],
      } as LayoutEntrada);
      const r = await gerarArquivos({
        layout,
        kit: KIT_TESTE,
        projeto: { nome: 'Ruins', slides: [{ id: 's1', tipoId: 's', conteudo: {}, overrides: {}, camadasExtras: [] }] },
        formato: 'png',
        urlDoAsset: urlDoArquivo,
        garantirArquivos,
      });
      return r.arquivosFaltando
        .map((f) => ({ campo: f.campo, slides: f.slides }))
        .sort((a, b) => a.campo.localeCompare(b.campo));
    },
    async prepararHeic() {
      try {
        await prepararImagem(
          new Blob([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99])], { type: 'image/heic' }),
        );
        return 'gravou';
      } catch (e) {
        return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      }
    },
  };
}
