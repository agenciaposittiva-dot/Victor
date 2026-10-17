/** Canvas → arquivo. JPG não tem transparência: o fundo do slide é pintado antes. */
export async function canvasParaBlob(
  canvas: HTMLCanvasElement,
  tipo: 'jpg' | 'png',
  opcoes: { qualidade?: number; fundo?: string } = {},
): Promise<Blob> {
  let origem = canvas;
  if (tipo === 'jpg') {
    origem = document.createElement('canvas');
    origem.width = canvas.width;
    origem.height = canvas.height;
    const ctx = origem.getContext('2d')!;
    ctx.fillStyle = opcoes.fundo ?? '#ffffff';
    ctx.fillRect(0, 0, origem.width, origem.height);
    ctx.drawImage(canvas, 0, 0);
  }
  try {
    return await new Promise((ok, falha) =>
      origem.toBlob(
        (b) => (b ? ok(b) : falha(new Error('Não consegui gerar a imagem (memória do navegador cheia?).'))),
        tipo === 'jpg' ? 'image/jpeg' : 'image/png',
        opcoes.qualidade ?? 0.92,
      ),
    );
  } finally {
    if (origem !== canvas) liberarCanvas(origem);
  }
}

/** Devolve a memória do canvas na hora (o Safari do iPhone tem limite total de memória de canvas). */
export function liberarCanvas(c: HTMLCanvasElement): void {
  c.width = 0;
  c.height = 0;
}

/** PDF montado página a página: cada slide entra assim que fica pronto (sem guardar todos na memória). */
export async function criarPdf(w: number, h: number) {
  const { jsPDF } = await import('jspdf');
  const orientacao = w > h ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    unit: 'px',
    format: [w, h],
    orientation: orientacao,
    hotfixes: ['px_scaling'],
    compress: true,
  });
  let paginas = 0;
  return {
    async adicionar(pagina: Blob) {
      if (paginas > 0) pdf.addPage([w, h], orientacao);
      pdf.addImage(
        new Uint8Array(await pagina.arrayBuffer()),
        pagina.type === 'image/png' ? 'PNG' : 'JPEG',
        0,
        0,
        w,
        h,
        undefined,
        'NONE',
      );
      paginas++;
    },
    finalizar: (): Blob => pdf.output('blob'),
  };
}

export async function criarZip() {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  return {
    adicionar: (nome: string, blob: Blob) => void zip.file(nome, blob),
    finalizar: () => zip.generateAsync({ type: 'blob', compression: 'STORE' }),
  };
}

export function baixar(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const blobParaDataUrl = (b: Blob) =>
  new Promise<string>((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => falha(r.error);
    r.readAsDataURL(b);
  });
