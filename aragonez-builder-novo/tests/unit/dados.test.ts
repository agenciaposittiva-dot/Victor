// Arquivos (Blob) e .zip: ambiente node, com Blob nativo (o Blob do jsdom não passa pelo structuredClone).
// @vitest-environment node
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { aplicarBackup, analisarBackup, exportarTudo } from '@/dados/backup';
import {
  acharKit,
  arquivarLayout,
  carregarCatalogo,
  criarProjeto,
  excluirLayout,
  kitsDoApp,
  layoutsDoApp,
} from '@/dados/catalogo';
import { ImagemIlegivel, prepararImagem } from '@/dados/imagens';
import { repo } from '@/dados/repositorio';
import { lerKitSalvo } from '@/dados/migracao';
import {
  ConflitoDeVersao,
  ouvirBanco,
  RepositorioLocal,
  RepositorioMemoria,
  type AvisoDoBanco,
  type Repositorio,
  versaoDe,
  zerarPedidoDePersistencia,
} from '@/dados/repositorio';
import { LAYOUT_EM_BRANCO } from '@/seeds/basicos';
import { KIT_TESTE, LAYOUT_TESTE } from '@/seeds/teste';

const novoLocal = () => new RepositorioLocal(new IDBFactory(), 'teste-' + Math.random());
const repos: [string, () => Repositorio][] = [
  ['IndexedDB', novoLocal],
  ['memória', () => new RepositorioMemoria()],
];

describe.each(repos)('repositório (%s)', (_nome, criar) => {
  it('salva, lista (mais recente primeiro), lê e exclui projetos', async () => {
    const r = criar();
    const a = criarProjeto(LAYOUT_TESTE, KIT_TESTE, 'Primeiro');
    const b = criarProjeto(LAYOUT_EM_BRANCO, KIT_TESTE, 'Segundo');
    await r.salvarProjeto(a);
    await r.salvarProjeto(b);
    const lista = await r.listarProjetos();
    expect(lista.map((p) => p.ok && p.valor.nome)).toEqual(['Segundo', 'Primeiro']);
    const lido = await r.lerProjeto(a.id);
    expect(lido?.ok && lido.valor.slides.map((s) => s.tipoId)).toEqual(['capa', 'conteudo', 'cta']);
    await r.excluirProjeto(a.id);
    expect(await r.lerProjeto(a.id)).toBeUndefined();
  });

  it('guarda layouts, kits e arquivos (Blob)', async () => {
    const r = criar();
    await r.salvarLayout({ ...LAYOUT_TESTE, id: 'meu' });
    await r.salvarKit({ ...KIT_TESTE, id: 'kit2', nome: 'Outro' });
    const id = await r.salvarArquivo(new Blob(['abc'], { type: 'image/png' }), 'foto.png');
    expect((await r.listarLayouts()).map((l) => l.ok && l.valor.id)).toEqual(['meu']);
    expect((await r.listarKits()).map((k) => k.ok && k.valor.nome)).toEqual(['Outro']);
    const blob = await r.lerArquivo(id);
    expect([blob?.type, await blob?.text()]).toEqual(['image/png', 'abc']);
  });

  it('registro inválido nunca some: migra pelo versaoSchema ou aparece como "precisa de atualização"', async () => {
    const r = criar();
    const ok = criarProjeto(LAYOUT_TESTE, KIT_TESTE, 'Bom');
    // salvo por uma versão antiga: sem versaoSchema e sem o campo "nome" (campo a menos)
    const { nome: _n, versaoSchema: _v, ...semNome } = criarProjeto(LAYOUT_TESTE, KIT_TESTE, 'x');
    // estragado de verdade: sem os slides
    const { slides: _s, ...semSlides } = criarProjeto(LAYOUT_TESTE, KIT_TESTE, 'Sem slides');
    await r.salvarProjeto(ok);
    await r.gravarBruto('projetos', { ...semNome });
    await r.gravarBruto('projetos', { ...semSlides });
    const lista = await r.listarProjetos();
    expect(lista).toHaveLength(3);
    const migrado = lista.find((p) => p.ok && p.valor.id === semNome.id);
    expect(migrado).toMatchObject({ ok: true, migrado: true, valor: { nome: 'Projeto sem nome', versaoSchema: 1 } });
    const ruim = lista.find((p) => !p.ok)!;
    expect(ruim).toMatchObject({ ok: false, id: semSlides.id, nome: 'Sem slides' });
    if (!ruim.ok) {
      expect(ruim.erros.join(' ')).toMatch(/slides/);
      expect(ruim.bruto).toMatchObject({ id: semSlides.id }); // o JSON bruto fica disponível para exportar
    }
    expect(await r.lerProjeto(semSlides.id)).toMatchObject({ ok: false });
  });

  it('conflito entre abas: salvar com a versão esperada antiga é recusado', async () => {
    const r = criar();
    const p = criarProjeto(LAYOUT_TESTE, KIT_TESTE, 'Aba');
    const v1 = await r.salvarProjeto(p);
    const v2 = await r.salvarProjeto({ ...p, nome: 'Salvo na outra aba' }, { esperado: v1 });
    expect(v2 > v1).toBe(true);
    // esta aba ainda acha que a versão é v1
    const tentativa = r.salvarProjeto({ ...p, nome: 'Minha versão' }, { esperado: v1 });
    await expect(tentativa).rejects.toBeInstanceOf(ConflitoDeVersao);
    await expect(tentativa).rejects.toMatchObject({ id: p.id, salvoEm: v2 });
    const lido = await r.lerProjeto(p.id);
    expect(lido?.ok && lido.valor.nome).toBe('Salvo na outra aba');
    // sem "esperado" (o usuário escolheu manter a dele), grava
    await r.salvarProjeto({ ...p, nome: 'Minha versão' });
    const depois = await r.lerProjeto(p.id);
    expect(depois?.ok && depois.valor.nome).toBe('Minha versão');
  });
});

describe('versão única de cada gravação', () => {
  it.each(repos)(
    'duas abas no mesmo milissegundo com a mesma versão esperada: a segunda dá ConflitoDeVersao (%s)',
    async (_n, criar) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-17T12:00:00.000Z'));
      try {
        const r = criar();
        const p = criarProjeto(LAYOUT_TESTE, KIT_TESTE, 'Mesmo instante');
        const aberta = await r.salvarProjeto(p);
        // as duas abas abriram a mesma versão e salvam "no mesmo milissegundo"
        await r.salvarProjeto({ ...p, nome: 'Aba 1' }, { esperado: aberta });
        await expect(r.salvarProjeto({ ...p, nome: 'Aba 2' }, { esperado: aberta })).rejects.toBeInstanceOf(
          ConflitoDeVersao,
        );
        const lido = await r.lerProjeto(p.id);
        expect(lido?.ok && lido.valor.nome).toBe('Aba 1');
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it.each(repos)(
    'projeto, layout e kit: salvar, ler (passando pelo Zod) e salvar de novo com a versão lida não dá conflito (%s)',
    async (_n, criar) => {
      const r = criar();
      const p = criarProjeto(LAYOUT_TESTE, KIT_TESTE, 'P');
      await r.salvarProjeto(p);
      const lp = (await r.lerProjeto(p.id))!;
      expect(lp.ok && lp.valor.versao).toBeTruthy();
      await r.salvarProjeto(lp.ok ? lp.valor : p, { esperado: versaoDe(lp.ok ? lp.valor : undefined) });
      await r.salvarLayout({ ...LAYOUT_TESTE, id: 'l1' });
      const ll = (await r.lerLayout('l1'))!;
      expect(ll.ok && ll.valor.versao).toBeTruthy();
      await r.salvarLayout(ll.ok ? ll.valor : LAYOUT_TESTE, { esperado: versaoDe(ll.ok ? ll.valor : undefined) });
      await r.salvarKit({ ...KIT_TESTE, id: 'k1' });
      const lk = (await r.listarKits()).find((k) => k.ok && k.valor.id === 'k1')!;
      expect(lk.ok && lk.valor.versao).toBeTruthy();
      await expect(
        r.salvarKit(lk.ok ? lk.valor : KIT_TESTE, { esperado: versaoDe(lk.ok ? lk.valor : undefined) }),
      ).resolves.toBeTruthy();
    },
  );
  it('a ordem da lista não depende de os salvamentos caírem em milissegundos diferentes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T12:00:00.000Z'));
    try {
      const r = new RepositorioMemoria();
      for (const n of ['1', '2', '3']) await r.salvarProjeto(criarProjeto(LAYOUT_TESTE, KIT_TESTE, n));
      expect((await r.listarProjetos()).map((x) => x.ok && x.valor.nome)).toEqual(['3', '2', '1']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('IndexedDB: atualização do banco com outra aba aberta', () => {
  it('fecha a conexão e avisa quando outra aba atualiza o banco (onversionchange)', async () => {
    const fabrica = new IDBFactory();
    const r = new RepositorioLocal(fabrica, 'versoes');
    await r.listarProjetos(); // abre a conexão
    const avisos: AvisoDoBanco[] = [];
    const parar = ouvirBanco((a) => avisos.push(a));
    const outra = new RepositorioLocal(fabrica, 'versoes', 2);
    await outra.listarProjetos(); // só abre porque a primeira fechou
    parar();
    expect(avisos).toContainEqual({ tipo: 'banco-atualizado' });
  });
});

describe('armazenamento persistente', () => {
  it('pede navigator.storage.persist() no primeiro salvamento', async () => {
    const persist = vi.fn(async () => true);
    zerarPedidoDePersistencia();
    vi.stubGlobal('navigator', { ...navigator, storage: { persist } });
    try {
      const r = new RepositorioMemoria();
      await r.salvarProjeto(criarProjeto(LAYOUT_TESTE, KIT_TESTE, 'P'));
      await r.salvarProjeto(criarProjeto(LAYOUT_TESTE, KIT_TESTE, 'Q'));
      expect(persist).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('backup: Exportar tudo e Importar', () => {
  async function preparar() {
    const r = new RepositorioMemoria();
    const p = criarProjeto(LAYOUT_TESTE, KIT_TESTE, 'Com foto');
    const arq = await r.salvarArquivo(new Blob(['dados da foto'], { type: 'image/jpeg' }), 'foto.jpg');
    p.slides[0]!.conteudo = { foto: { assetId: arq } };
    await r.salvarProjeto(p);
    await r.salvarLayout({ ...LAYOUT_TESTE, id: 'meu-layout', nome: 'Meu layout' });
    await r.salvarKit({ ...KIT_TESTE, id: 'kit-2', nome: 'Kit 2' });
    return { r, p, arq };
  }

  it('exporta e importa tudo num navegador vazio (projetos, layouts, kits e arquivos)', async () => {
    const { r, p, arq } = await preparar();
    const zip = await exportarTudo(r);
    const destino = new RepositorioMemoria();
    const analise = await analisarBackup(destino, zip);
    expect(analise.manifesto.contagem).toEqual({ projetos: 1, layouts: 1, kits: 1, arquivos: 1 });
    expect(analise.conflitos).toEqual([]);
    const resumo = await aplicarBackup(destino, analise, {});
    expect(resumo.gravados).toEqual({ projetos: 1, layouts: 1, kits: 1, arquivos: 1 });
    expect(await destino.lerProjeto(p.id)).toEqual(await r.lerProjeto(p.id));
    expect(await (await destino.lerArquivo(arq))?.text()).toBe('dados da foto');
    expect((await destino.listarLayouts()).map((l) => l.ok && l.valor.nome)).toEqual(['Meu layout']);
  });

  it('mesmo id já existe: pergunta, mostra o mais recente e nunca sobrescreve sem decisão', async () => {
    const { r, p } = await preparar();
    const zip = await exportarTudo(r);
    // depois do backup, projeto, layout e kit foram alterados aqui (ficam mais recentes que os do backup)
    await r.salvarProjeto({ ...p, nome: 'Alterado depois do backup' });
    await r.salvarLayout({ ...LAYOUT_TESTE, id: 'meu-layout', nome: 'Meu layout alterado' });
    await r.salvarKit({ ...KIT_TESTE, id: 'kit-2', nome: 'Kit 2 alterado' });
    const analise = await analisarBackup(r, zip);
    const conflito = analise.conflitos.find((c) => c.loja === 'projetos')!;
    expect(conflito).toMatchObject({ id: p.id, maisRecente: 'aqui' });
    expect(analise.conflitos.map((c) => c.loja).sort()).toEqual(['kits', 'layouts', 'projetos']);
    expect(analise.conflitos.every((c) => c.maisRecente === 'aqui')).toBe(true);
    expect(analise.identicos).toBe(0);
    await expect(aplicarBackup(r, analise, {})).rejects.toThrow(/Escolha o que fazer/);
    const ainda = await r.lerProjeto(p.id);
    expect(ainda?.ok && ainda.valor.nome).toBe('Alterado depois do backup');
    const layoutAinda = await r.lerLayout('meu-layout');
    expect(layoutAinda?.ok && layoutAinda.valor.nome).toBe('Meu layout alterado');
  });

  it('decisões: pular, substituir e manter os dois (projetos do backup passam a usar a cópia do layout)', async () => {
    const { r, p } = await preparar();
    const projetoQueUsaOLayout = { ...criarProjeto(LAYOUT_TESTE, KIT_TESTE, 'Usa meu layout'), layoutId: 'meu-layout' };
    await r.salvarProjeto(projetoQueUsaOLayout);
    const zip = await exportarTudo(r);
    // tudo muda aqui depois do backup (senão seriam idênticos e não haveria o que decidir)
    await r.salvarProjeto({ ...p, nome: 'Aqui' });
    await r.salvarProjeto({ ...projetoQueUsaOLayout, nome: 'Usa meu layout (mudado)' });
    await r.salvarLayout({ ...LAYOUT_TESTE, id: 'meu-layout', nome: 'Meu layout (mudado)' });
    await r.salvarKit({ ...KIT_TESTE, id: 'kit-2', nome: 'Kit 2 (mudado)' });
    const analise = await analisarBackup(r, zip);
    expect(analise.conflitos).toHaveLength(4);
    const resumo = await aplicarBackup(r, analise, {
      [`projetos:${p.id}`]: 'substituir',
      [`projetos:${projetoQueUsaOLayout.id}`]: 'pular',
      'layouts:meu-layout': 'manter-os-dois',
      'kits:kit-2': 'pular',
    });
    expect(resumo).toMatchObject({ substituidos: 1, copias: 1, pulados: 2 });
    const substituido = await r.lerProjeto(p.id);
    expect(substituido?.ok && substituido.valor.nome).toBe('Com foto');
    const layouts = (await r.listarLayouts()).flatMap((l) => (l.ok ? [l.valor] : []));
    expect(layouts.map((l) => l.nome).sort()).toEqual(['Meu layout (importado)', 'Meu layout (mudado)']);
    // manter os dois num projeto: a cópia ganha id novo
    const analise2 = await analisarBackup(r, zip);
    await aplicarBackup(
      r,
      analise2,
      Object.fromEntries(analise2.conflitos.map((c) => [c.chave, 'manter-os-dois' as const])),
    );
    const copias = (await r.listarProjetos())
      .flatMap((x) => (x.ok ? [x.valor] : []))
      .filter((x) => x.nome.endsWith('(importado)'));
    expect(copias.find((x) => x.nome === 'Usa meu layout (importado)')!.layoutId).not.toBe('meu-layout');
  });

  it('exportar, apagar tudo, importar: tudo volta igual; importar de novo o mesmo backup não pergunta nada', async () => {
    const { r } = await preparar();
    const antes = {
      projetos: await r.brutos('projetos'),
      layouts: await r.brutos('layouts'),
      kits: await r.brutos('kits'),
      arquivos: await r.brutos('arquivos'),
    };
    const zip = await exportarTudo(r);
    for (const loja of ['projetos', 'layouts', 'kits'] as const)
      for (const x of antes[loja])
        await (loja === 'projetos'
          ? r.excluirProjeto(x.id)
          : loja === 'layouts'
            ? r.excluirLayout(x.id)
            : r.gravarBruto(loja, { id: x.id }));
    // (kits não têm excluir na interface: o registro foi esvaziado e volta pelo backup)
    const a1 = await analisarBackup(r, zip);
    expect(a1.conflitos.map((c) => c.loja)).toEqual(['kits']);
    await aplicarBackup(r, a1, { [a1.conflitos[0]!.chave]: 'substituir' });
    expect(await r.brutos('projetos')).toEqual(antes.projetos);
    expect(await r.brutos('layouts')).toEqual(antes.layouts);
    expect(await r.brutos('kits')).toEqual(antes.kits);
    expect((await r.brutos('arquivos')).length).toBe(antes.arquivos.length);
    // de novo: nada a perguntar, tudo idêntico
    const a2 = await analisarBackup(r, zip);
    expect(a2.conflitos).toEqual([]);
    expect(a2.identicos).toBe(3);
    expect(a2.registros).toEqual([]);
    const resumo = await aplicarBackup(r, a2, {});
    expect(resumo).toMatchObject({ identicos: 3, gravados: { projetos: 0, layouts: 0, kits: 0, arquivos: 0 } });
  });

  it('item com JSON estragado é pulado e listado; o resto entra', async () => {
    const { r } = await preparar();
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await (await exportarTudo(r)).arrayBuffer());
    zip.file('projetos/estragado.json', '{ isto não é json');
    const comDefeito = await zip.generateAsync({ type: 'blob' });
    const destino = new RepositorioMemoria();
    const analise = await analisarBackup(destino, comDefeito);
    expect(analise.ilegiveis).toEqual(['projetos/estragado.json']);
    const resumo = await aplicarBackup(destino, analise, {});
    expect(resumo.ilegiveis).toHaveLength(1);
    expect(resumo.gravados).toEqual({ projetos: 1, layouts: 1, kits: 1, arquivos: 1 });
  });

  it('manter os dois remapeia as referências cruzadas: layout → kit e kit → layout', async () => {
    const r = new RepositorioMemoria();
    await r.salvarKit({ ...KIT_TESTE, id: 'kit-x', nome: 'Kit X', layoutPadraoId: 'lay-x' });
    await r.salvarLayout({ ...LAYOUT_TESTE, id: 'lay-x', nome: 'Layout X', brandKitId: 'kit-x' });
    const zip = await exportarTudo(r);
    await r.salvarKit({ ...KIT_TESTE, id: 'kit-x', nome: 'Kit X mudado aqui', layoutPadraoId: 'lay-x' });
    await r.salvarLayout({ ...LAYOUT_TESTE, id: 'lay-x', nome: 'Layout X mudado aqui', brandKitId: 'kit-x' });
    const analise = await analisarBackup(r, zip);
    await aplicarBackup(
      r,
      analise,
      Object.fromEntries(analise.conflitos.map((c) => [c.chave, 'manter-os-dois' as const])),
    );
    const kits = (await r.listarKits()).flatMap((k) => (k.ok ? [k.valor] : []));
    const layouts = (await r.listarLayouts()).flatMap((l) => (l.ok ? [l.valor] : []));
    const kitCopia = kits.find((k) => k.nome === 'Kit X (importado)')!;
    const layCopia = layouts.find((l) => l.nome === 'Layout X (importado)')!;
    expect(kitCopia.layoutPadraoId).toBe(layCopia.id);
    expect(layCopia.brandKitId).toBe(kitCopia.id);
    // os originais daqui continuam apontando um para o outro
    expect(kits.find((k) => k.id === 'kit-x')!.layoutPadraoId).toBe('lay-x');
    expect(layouts.find((l) => l.id === 'lay-x')!.brandKitId).toBe('kit-x');
  });

  it('recusa arquivo que não é backup do app', async () => {
    await expect(analisarBackup(new RepositorioMemoria(), new Blob(['oi']))).rejects.toThrow(/não é um backup/);
  });
});

describe('Brand Kit com versaoSchema', () => {
  it('kit antigo (sem versaoSchema) passa pela migração; kit estragado aparece para atualizar', () => {
    const { versaoSchema: _v, ...antigo } = KIT_TESTE;
    expect(lerKitSalvo(antigo)).toMatchObject({ ok: true, migrado: true, valor: { versaoSchema: 1 } });
    const { fontes: _f, ...semFontes } = KIT_TESTE;
    expect(lerKitSalvo(semFontes)).toMatchObject({ ok: false, nome: 'Victor Aragonez' });
  });
});

describe('catálogo e exclusão de layout', () => {
  it('layout e kit de teste só no modo de desenvolvimento (testes rodam como desenvolvimento)', () => {
    expect(import.meta.env.DEV).toBe(true);
    expect(layoutsDoApp().map((l) => l.id)).toEqual(['em-branco', 'em-branco-continuo', 'teste-exportacao']);
    expect(kitsDoApp().map((k) => k.id)).toEqual(['kit-neutro', 'kit-teste']);
  });
  it('kit que não existe: acharKit não troca por outro em silêncio', async () => {
    const original = repo.atual;
    repo.atual = new RepositorioMemoria();
    try {
      const c = await carregarCatalogo();
      expect(acharKit(c, 'kit-neutro')?.nome).toBe('Neutro');
      expect(acharKit(c, 'kit-apagado')).toBeUndefined();
    } finally {
      repo.atual = original;
    }
  });
  it('não exclui layout usado por projetos: mostra quais são; arquivar mantém salvo', async () => {
    const r = new RepositorioMemoria();
    await r.salvarLayout({ ...LAYOUT_TESTE, id: 'usado', nome: 'Usado' });
    const p = { ...criarProjeto(LAYOUT_TESTE, KIT_TESTE, 'Projeto que usa'), layoutId: 'usado' };
    await r.salvarProjeto(p);
    expect(await excluirLayout(r, 'usado')).toEqual({
      excluido: false,
      projetos: [{ id: p.id, nome: 'Projeto que usa' }],
    });
    expect(await r.lerLayout('usado')).toMatchObject({ ok: true });
    await arquivarLayout(r, 'usado');
    expect(await r.lerLayout('usado')).toMatchObject({ ok: true, valor: { status: 'arquivado' } });
    await r.excluirProjeto(p.id);
    // projeto que não valida (precisa de atualização) também segura o layout
    const { slides: _s, ...semSlides } = { ...criarProjeto(LAYOUT_TESTE, KIT_TESTE, 'Quebrado'), layoutId: 'usado' };
    await r.gravarBruto('projetos', semSlides);
    expect(await excluirLayout(r, 'usado')).toEqual({
      excluido: false,
      projetos: [{ id: semSlides.id, nome: 'Quebrado (precisa de atualização)' }],
    });
    await r.excluirProjeto(semSlides.id);
    expect(await excluirLayout(r, 'usado')).toEqual({ excluido: true });
    expect(await r.lerLayout('usado')).toBeUndefined();
  });
});

describe('prepararImagem (fora do navegador)', () => {
  it('formato que o navegador não abre não é gravado: avisa para enviar JPG ou PNG', async () => {
    vi.stubGlobal('createImageBitmap', async () => {
      throw new Error('não decodifica');
    });
    try {
      const heic = new Blob([new Uint8Array([0, 0, 0, 24])], { type: 'image/heic' });
      await expect(prepararImagem(heic)).rejects.toBeInstanceOf(ImagemIlegivel);
      await expect(prepararImagem(heic)).rejects.toThrow('Este formato não abre neste navegador; envie em JPG ou PNG.');
      await expect(prepararImagem(new Blob(['x'], { type: 'application/pdf' }))).rejects.toThrow(/Escolha uma imagem/);
      const svg = new Blob(['<svg/>'], { type: 'image/svg+xml' });
      expect((await prepararImagem(svg)).blob).toBe(svg);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
