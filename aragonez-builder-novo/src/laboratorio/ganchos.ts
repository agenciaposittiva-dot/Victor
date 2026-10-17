import { aplicarBackup, analisarBackup, exportarTudo, type DecisaoDeConflito } from '@/dados/backup';
import { criarProjeto } from '@/dados/catalogo';
import { prepararImagem } from '@/dados/imagens';
import { repo } from '@/dados/repositorio';
import { KIT_TESTE, LAYOUT_TESTE } from '@/seeds/teste';

/** Ganchos para os testes automáticos no navegador de verdade (Blob, IndexedDB e canvas reais).
 *  Só existem no laboratório com ?teste (ferramenta de desenvolvimento). */
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
