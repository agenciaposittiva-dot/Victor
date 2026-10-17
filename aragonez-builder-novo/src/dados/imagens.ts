/** Fotos enviadas são reduzidas antes de gravar no navegador: o lado maior fica em até 2560 px (sobra para a
 *  exportação em 2×, que usa 2160 px de largura) e JPEG sai com qualidade 0,88. PNG continua PNG (pode ter
 *  transparência, como logos); WebP e AVIF saem em PNG se tiverem transparência e em JPEG se não tiverem. Se a
 *  versão nova não ficar menor, guarda o original. SVG e GIF não mudam.
 *  - A orientação gravada pelo celular (EXIF) é respeitada: a foto deitada no arquivo sai em pé como na galeria.
 *  - Fotos de 24 e 48 MP do iPhone: a redução desenha a foto direto num canvas já do tamanho final; nunca existe um
 *    canvas do tamanho original (o Safari recusa canvas acima de ~16,7 MP). */
export const LADO_MAXIMO = 2560;
const QUALIDADE_JPEG = 0.88;
const SEM_PROCESSAR = /^image\/(svg\+xml|gif)$/;
const RASTER = /^image\/(jpeg|png|webp|bmp|heic|heif|avif)$/;

export type ImagemPreparada = { blob: Blob; largura?: number; altura?: number; reduzida: boolean };

/** A imagem não pode ser lida neste navegador (ex.: HEIC no Chrome) ou não é imagem: não é gravada. */
export class ImagemIlegivel extends Error {
  constructor(mensagem = 'Este formato não abre neste navegador; envie em JPG ou PNG.') {
    super(mensagem);
    this.name = 'ImagemIlegivel';
  }
}

type Decodificada = { w: number; h: number; fonte: CanvasImageSource; liberar: () => void };

/** Decodifica a foto sem criar canvas: num <img> (largura e altura já na orientação do EXIF) ou, onde não há
 *  <img>.decode(), num ImageBitmap com imageOrientation: 'from-image'. */
async function decodificar(arquivo: Blob): Promise<Decodificada | null> {
  const temImg =
    typeof Image !== 'undefined' &&
    typeof HTMLImageElement !== 'undefined' &&
    'decode' in HTMLImageElement.prototype &&
    typeof URL.createObjectURL === 'function';
  if (temImg) {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    try {
      await img.decode();
    } catch {
      URL.revokeObjectURL(url);
      throw new ImagemIlegivel();
    }
    return { w: img.naturalWidth, h: img.naturalHeight, fonte: img, liberar: () => URL.revokeObjectURL(url) };
  }
  if (typeof createImageBitmap === 'undefined') return null;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    throw new ImagemIlegivel();
  }
  return { w: bmp.width, h: bmp.height, fonte: bmp, liberar: () => bmp.close() };
}

/** Algum pixel do canvas (já reduzido) tem transparência? */
function temTransparencia(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const d = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4) if (d[i]! < 255) return true;
  return false;
}

export async function prepararImagem(arquivo: Blob): Promise<ImagemPreparada> {
  if (SEM_PROCESSAR.test(arquivo.type)) return { blob: arquivo, reduzida: false };
  if (!RASTER.test(arquivo.type) && arquivo.type !== '')
    throw new ImagemIlegivel('Escolha uma imagem (JPG, PNG ou WebP).');
  const img = await decodificar(arquivo);
  if (!img) return { blob: arquivo, reduzida: false };
  try {
    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.w, img.h));
    const largura = Math.max(1, Math.round(img.w * escala));
    const altura = Math.max(1, Math.round(img.h * escala));
    const pequeno = escala === 1 && arquivo.size < 1.5 * 1024 * 1024 && arquivo.type !== 'image/bmp';
    // pequena: fica o original (o navegador já mostra na orientação do EXIF)
    if (pequeno) return { blob: arquivo, largura, altura, reduzida: false };
    // canvas já no tamanho final: a foto grande é desenhada reduzida direto nele
    const c = document.createElement('canvas');
    c.width = largura;
    c.height = altura;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.fonte, 0, 0, largura, altura);
    // PNG continua PNG. WebP e AVIF (logos baixados da internet costumam ser WebP) saem em PNG só se tiverem
    // transparência (o Safari não gera WebP no toBlob); sem transparência, em JPEG. JPEG, HEIC e BMP: JPEG.
    const tipo =
      arquivo.type === 'image/png' ||
      (/^image\/(webp|avif)$/.test(arquivo.type) && temTransparencia(ctx, largura, altura))
        ? 'image/png'
        : 'image/jpeg';
    const blob = await new Promise<Blob | null>((ok) =>
      c.toBlob(ok, tipo, tipo === 'image/jpeg' ? QUALIDADE_JPEG : undefined),
    );
    c.width = 0;
    c.height = 0;
    if (!blob) return { blob: arquivo, largura, altura, reduzida: false };
    // a versão nova já sai em pé (sem EXIF); só fica o original se ele for menor e não precisar reduzir
    if (blob.size >= arquivo.size && escala === 1) return { blob: arquivo, largura, altura, reduzida: false };
    return { blob, largura, altura, reduzida: true };
  } finally {
    img.liberar();
  }
}
