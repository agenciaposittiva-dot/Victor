import { igual } from '@/dominio/edicao';
import { novoId, type Arquivo, type Loja, type Registro, type Repositorio } from './repositorio';

/** Backup do modo local: "Exportar tudo" junta projetos, layouts, kits e arquivos (fotos, logos) num .zip;
 *  "Importar" lê o .zip e, para cada registro que já existe com o mesmo id e conteúdo diferente, pergunta o que
 *  fazer (substituir, manter os dois ou pular), mostrando qual é o mais recente. Nada é sobrescrito em silêncio.
 *  Itens idênticos são pulados sozinhos (importar o mesmo backup duas vezes não pergunta nada) e um item ilegível
 *  é pulado sem derrubar a importação. */
export const FORMATO_BACKUP = 1;
const LOJAS_DE_DADOS = ['projetos', 'layouts', 'kits'] as const;
type LojaDeDados = (typeof LOJAS_DE_DADOS)[number];

type Manifesto = {
  app: 'aragonez-builder';
  formato: number;
  criadoEm: string;
  contagem: Record<Loja, number>;
};
type InfoArquivo = Omit<Arquivo, 'blob'>;

export async function exportarTudo(repo: Repositorio): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const contagem = { projetos: 0, layouts: 0, kits: 0, arquivos: 0 } as Record<Loja, number>;
  for (const loja of LOJAS_DE_DADOS) {
    for (const r of await repo.brutos(loja)) {
      zip.file(`${loja}/${r.id}.json`, JSON.stringify(r, null, 2));
      contagem[loja]++;
    }
  }
  const infos: InfoArquivo[] = [];
  for (const r of (await repo.brutos('arquivos')) as unknown as Arquivo[]) {
    const { blob, ...info } = r;
    // ArrayBuffer em vez de Blob: funciona em qualquer navegador e nos testes
    zip.file(`arquivos/${r.id}`, await blob.arrayBuffer());
    infos.push(info);
    contagem.arquivos++;
  }
  zip.file('arquivos.json', JSON.stringify(infos, null, 2));
  const manifesto: Manifesto = {
    app: 'aragonez-builder',
    formato: FORMATO_BACKUP,
    criadoEm: new Date().toISOString(),
    contagem,
  };
  zip.file('manifesto.json', JSON.stringify(manifesto, null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export type Conflito = {
  chave: string;
  loja: LojaDeDados;
  id: string;
  nome: string;
  atualizadoEmAqui?: string;
  atualizadoEmBackup?: string;
  /** qual versão é a mais recente pelo atualizadoEm. */
  maisRecente: 'backup' | 'aqui' | 'iguais';
};
export type DecisaoDeConflito = 'substituir' | 'manter-os-dois' | 'pular';

export type AnaliseDeBackup = {
  manifesto: Manifesto;
  /** registros a gravar (os idênticos aos daqui já ficaram de fora). */
  registros: { loja: LojaDeDados; registro: Registro }[];
  arquivos: (InfoArquivo & { blob: Blob })[];
  conflitos: Conflito[];
  /** iguais aos que já existem aqui (mesmo atualizadoEm e mesmo conteúdo): pulados sem perguntar. */
  identicos: number;
  /** nomes dos itens do .zip que não deu para ler. */
  ilegiveis: string[];
};

const nomeDe = (r: Registro) => (typeof r.nome === 'string' && r.nome ? r.nome : r.id);
const dataDe = (r: Registro | undefined) => (typeof r?.atualizadoEm === 'string' ? r.atualizadoEm : undefined);

/** Lê o .zip e aponta os conflitos (sem gravar nada). */
export async function analisarBackup(repo: Repositorio, arquivo: Blob): Promise<AnaliseDeBackup> {
  const { default: JSZip } = await import('jszip');
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    zip = await JSZip.loadAsync(await arquivo.arrayBuffer());
  } catch {
    throw new Error('Este arquivo não é um backup do Aragonez Builder (.zip).');
  }
  const m = zip.file('manifesto.json');
  if (!m) throw new Error('Este arquivo não é um backup do Aragonez Builder: falta o manifesto.json.');
  let manifesto: Manifesto;
  try {
    manifesto = JSON.parse(await m.async('string')) as Manifesto;
  } catch {
    throw new Error('O manifesto do backup está estragado.');
  }
  if (manifesto.app !== 'aragonez-builder') throw new Error('Este .zip não veio do Aragonez Builder.');
  if (manifesto.formato > FORMATO_BACKUP)
    throw new Error('Backup feito numa versão mais nova do app. Atualize a página e tente de novo.');
  const registros: AnaliseDeBackup['registros'] = [];
  const conflitos: Conflito[] = [];
  const ilegiveis: string[] = [];
  let identicos = 0;
  for (const loja of LOJAS_DE_DADOS) {
    const aqui = new Map((await repo.brutos(loja)).map((r) => [r.id, r]));
    const nomes = Object.keys(zip.files)
      .filter((n) => n.startsWith(`${loja}/`) && n.endsWith('.json'))
      .sort();
    for (const nome of nomes) {
      let registro: Registro;
      try {
        registro = JSON.parse(await zip.file(nome)!.async('string')) as Registro;
        if (typeof registro?.id !== 'string' || !registro.id) throw new Error('sem id');
      } catch {
        ilegiveis.push(nome);
        continue;
      }
      const atual = aqui.get(registro.id);
      if (atual && igual(atual, registro)) {
        identicos++;
        continue;
      }
      registros.push({ loja, registro });
      if (!atual) continue;
      const a = dataDe(atual);
      const b = dataDe(registro);
      conflitos.push({
        chave: `${loja}:${registro.id}`,
        loja,
        id: registro.id,
        nome: nomeDe(registro),
        atualizadoEmAqui: a,
        atualizadoEmBackup: b,
        maisRecente: a === b ? 'iguais' : (b ?? '') > (a ?? '') ? 'backup' : 'aqui',
      });
    }
  }
  let infos: InfoArquivo[] = [];
  try {
    infos = JSON.parse((await zip.file('arquivos.json')?.async('string')) ?? '[]') as InfoArquivo[];
  } catch {
    ilegiveis.push('arquivos.json');
  }
  const arquivos: AnaliseDeBackup['arquivos'] = [];
  for (const info of infos) {
    const f = info?.id ? zip.file(`arquivos/${info.id}`) : null;
    if (!f) {
      ilegiveis.push(`arquivos/${info?.id ?? '?'}`);
      continue;
    }
    arquivos.push({ ...info, blob: new Blob([await f.async('arraybuffer')], { type: info.tipo }) });
  }
  return { manifesto, registros, arquivos, conflitos, identicos, ilegiveis };
}

export type ResumoDaImportacao = {
  gravados: Record<LojaDeDados | 'arquivos', number>;
  substituidos: number;
  copias: number;
  pulados: number;
  identicos: number;
  ilegiveis: string[];
};

/** Grava o backup analisado. Todo conflito precisa de decisão (senão nada é gravado). "manter-os-dois" grava o
 *  registro do backup com id novo, e as referências cruzadas do backup passam a apontar para as cópias: projetos
 *  (layoutId, brandKitId), layouts (brandKitId) e kits (layoutPadraoId). */
export async function aplicarBackup(
  repo: Repositorio,
  analise: AnaliseDeBackup,
  decisoes: Record<string, DecisaoDeConflito>,
): Promise<ResumoDaImportacao> {
  const semDecisao = analise.conflitos.filter((c) => !decisoes[c.chave]);
  if (semDecisao.length) throw new Error(`Escolha o que fazer com: ${semDecisao.map((c) => c.nome).join(', ')}.`);
  const resumo: ResumoDaImportacao = {
    gravados: { projetos: 0, layouts: 0, kits: 0, arquivos: 0 },
    substituidos: 0,
    copias: 0,
    pulados: 0,
    identicos: analise.identicos,
    ilegiveis: [...analise.ilegiveis],
  };
  // 1ª passada: ids novos de todas as cópias (para remapear referências em qualquer direção)
  const novos: Record<LojaDeDados, Map<string, string>> = { projetos: new Map(), layouts: new Map(), kits: new Map() };
  for (const { loja, registro } of analise.registros)
    if (decisoes[`${loja}:${registro.id}`] === 'manter-os-dois')
      novos[loja].set(registro.id, novoId(loja === 'projetos' ? 'p' : loja === 'layouts' ? 'l' : 'k'));
  const trocar = (r: Registro, campo: string, mapa: Map<string, string>) => {
    const v = r[campo];
    if (typeof v === 'string' && mapa.has(v)) r[campo] = mapa.get(v);
  };
  // 2ª passada: grava com as referências remapeadas
  for (const { loja, registro } of analise.registros) {
    const decisao = decisoes[`${loja}:${registro.id}`];
    if (decisao === 'pular') {
      resumo.pulados++;
      continue;
    }
    const r: Registro = structuredClone(registro);
    const idNovo = novos[loja].get(r.id);
    if (idNovo) {
      r.id = idNovo;
      r.nome = `${nomeDe(registro)} (importado)`;
      resumo.copias++;
    } else if (decisao === 'substituir') resumo.substituidos++;
    if (loja === 'projetos') {
      trocar(r, 'layoutId', novos.layouts);
      trocar(r, 'brandKitId', novos.kits);
    } else if (loja === 'layouts') trocar(r, 'brandKitId', novos.kits);
    else trocar(r, 'layoutPadraoId', novos.layouts);
    await repo.gravarBruto(loja, r);
    resumo.gravados[loja]++;
  }
  // arquivos têm id único e não mudam: o que já existe fica como está
  const existentes = new Set((await repo.brutos('arquivos')).map((a) => a.id));
  for (const a of analise.arquivos) {
    if (existentes.has(a.id)) continue;
    await repo.gravarBruto('arquivos', a as unknown as Registro);
    resumo.gravados.arquivos++;
  }
  return resumo;
}
