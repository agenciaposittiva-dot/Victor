/** Fotos enviadas são reduzidas antes de gravar no navegador: o lado maior fica em até 2560 px (sobra para a
 *  exportação em 2×, que usa 2160 px de largura) e JPEG sai com qualidade 0,88. PNG continua PNG (pode ter
 *  transparência, como logos). Se a versão nova não ficar menor, guarda o original. SVG e GIF não mudam.
 *  A orientação gravada pelo celular (EXIF) é respeitada: a foto deitada no arquivo sai em pé como na galeria. */
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

export async function prepararImagem(arquivo: Blob): Promise<ImagemPreparada> {
  if (SEM_PROCESSAR.test(arquivo.type)) return { blob: arquivo, reduzida: false };
  if (!RASTER.test(arquivo.type) && arquivo.type !== '')
    throw new ImagemIlegivel('Escolha uma imagem (JPG, PNG ou WebP).');
  if (typeof createImageBitmap === 'undefined') return { blob: arquivo, reduzida: false };
  let img: ImageBitmap;
  try {
    img = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    throw new ImagemIlegivel();
  }
  const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height));
  const largura = Math.round(img.width * escala);
  const altura = Math.round(img.height * escala);
  const pequeno = escala === 1 && arquivo.size < 1.5 * 1024 * 1024 && arquivo.type !== 'image/bmp';
  if (pequeno) {
    // fica o original: o navegador já mostra na orientação do EXIF (image-orientation: from-image)
    img.close();
    return { blob: arquivo, largura, altura, reduzida: false };
  }
  const c = document.createElement('canvas');
  c.width = largura;
  c.height = altura;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, largura, altura);
  img.close();
  const tipo = arquivo.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((ok) =>
    c.toBlob(ok, tipo, tipo === 'image/jpeg' ? QUALIDADE_JPEG : undefined),
  );
  c.width = 0;
  c.height = 0;
  // a versão nova já sai girada (sem EXIF); só fica o original se ele for menor E não precisar girar
  if (!blob) return { blob: arquivo, largura, altura, reduzida: false };
  if (blob.size >= arquivo.size && escala === 1) return { blob: arquivo, largura, altura, reduzida: false };
  return { blob, largura, altura, reduzida: true };
}
