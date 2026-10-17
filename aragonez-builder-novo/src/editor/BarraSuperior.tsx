import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { urlDoArquivo } from '@/dados/arquivos';
import { baixar, criarZip } from '@/exportar/arquivos';
import { exportar, gerarArquivos } from '@/exportar/exportar';
import { slug } from '@/exportar/nomes';
import { Botao } from '@/ui/Botao';
import { avisarFontes } from '@/ui/avisarFontes';
import { Icone } from '@/ui/Icone';
import { avisar } from '@/ui/toast';
import { editor, projetoAtual, useEditor, type EstadoSalvamento } from './estado';
import css from './Editor.module.css';

const ROTULO_SALVAMENTO: Record<EstadoSalvamento, string> = {
  salvo: 'Salvo',
  pendente: 'Alterações não salvas',
  salvando: 'Salvando…',
  erro: 'Erro ao salvar',
  conflito: 'Conflito: veja o aviso',
};

export function BarraSuperior() {
  const nome = useEditor((s) => s.nome);
  const salvamento = useEditor((s) => s.salvamento);
  const modo = useEditor((s) => s.modo);
  const passado = useEditor((s) => s.passado);
  const futuro = useEditor((s) => s.futuro);
  const kit = useEditor((s) => s.kit);
  const [exportando, setExportando] = useState('');
  const [paraCompartilhar, setParaCompartilhar] = useState<File[] | null>(null);
  const [nomeAoFocar, setNomeAoFocar] = useState('');
  // os arquivos prontos para compartilhar ficam velhos quando o projeto muda: o botão some e a pessoa exporta de novo
  useEffect(
    () =>
      useEditor.subscribe((s, ant) => {
        if (s.doc !== ant.doc || s.nome !== ant.nome || s.kit !== ant.kit) setParaCompartilhar(null);
      }),
    [],
  );

  /** Exporta os slides em JPG 2×. No celular (navigator.canShare aceita arquivos), oferece depois "Salvar nas
   *  Fotos / Compartilhar" num segundo toque (depois do await a permissão do primeiro toque já expirou); o ZIP
   *  continua disponível. Nos outros, baixa o ZIP direto. */
  const exportarSlides = async () => {
    const s = useEditor.getState();
    const projeto = projetoAtual(s);
    if (!projeto || !s.layout || !s.kit) return;
    setExportando('Preparando…');
    setParaCompartilhar(null);
    try {
      const op = {
        layout: s.layout,
        kit: s.kit,
        projeto,
        escala: 2 as const,
        urlDoAsset: urlDoArquivo,
        aoProgredir: (f: number, t: number) =>
          setExportando(f < t ? `Exportando ${f + 1} de ${t}…` : 'Montando o arquivo…'),
      };
      // compartilhar só em aparelho de toque (celular, tablet); no computador, "Exportar" baixa o ZIP direto
      const toque = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
      const podeCompartilhar = toque && typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';
      if (podeCompartilhar) {
        const r = await gerarArquivos({ ...op, formato: 'jpg', separados: true });
        avisarFontes(r.fontesFaltando);
        const arquivos = r.arquivos.map((a) => new File([a.blob], a.nome, { type: 'image/jpeg' }));
        if (navigator.canShare({ files: arquivos })) {
          setParaCompartilhar(arquivos);
          avisar('Slides prontos: toque em “Salvar nas Fotos / Compartilhar” ou baixe o ZIP.', 'ok');
          return;
        }
        const zip = await criarZip();
        arquivos.forEach((a) => zip.adicionar(a.name, a));
        baixar(await zip.finalizar(), `${slug(projeto.nome)}-jpg.zip`);
        avisar('ZIP pronto.', 'ok');
        return;
      }
      const r = await exportar({ ...op, formato: 'zip' });
      avisarFontes(r.fontesFaltando);
      avisar(`${r.arquivos.map((a) => a.nome).join(', ')} pronto.`, 'ok');
    } catch (e) {
      avisar('Não consegui exportar: ' + (e instanceof Error ? e.message : String(e)), 'erro');
    } finally {
      setExportando('');
    }
  };
  const compartilhar = async () => {
    if (!paraCompartilhar) return;
    try {
      await navigator.share({ files: paraCompartilhar, title: useEditor.getState().nome });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError'))
        avisar('Não consegui compartilhar: ' + (e instanceof Error ? e.message : String(e)), 'erro');
    }
  };
  const baixarZipDoCompartilhar = async () => {
    if (!paraCompartilhar) return;
    const zip = await criarZip();
    paraCompartilhar.forEach((a) => zip.adicionar(a.name, a));
    baixar(await zip.finalizar(), `${slug(useEditor.getState().nome)}-jpg.zip`);
  };

  return (
    <header className={css.barra}>
      <Link to="/editor" className={css.voltar} aria-label="Voltar aos projetos" title="Voltar aos projetos">
        <Icone nome="voltar" />
      </Link>
      <div className={css.titulo}>
        <input
          className={css.nome}
          value={nome}
          aria-label="Nome do projeto"
          data-historico
          onFocus={() => setNomeAoFocar(nome)}
          onChange={(e) => editor.editar('Renomear', (d) => void (d.nome = e.target.value), 'nome')}
          onBlur={() => {
            // nome vazio volta ao nome anterior
            if (!useEditor.getState().nome.trim())
              editor.editar('Renomear', (d) => void (d.nome = nomeAoFocar || 'Projeto sem nome'));
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <span
          className={[css.salvamento, css['s-' + salvamento]].join(' ')}
          data-testid="salvamento"
          aria-live="polite"
        >
          {ROTULO_SALVAMENTO[salvamento]}
        </span>
      </div>
      <div className={css.modos} role="radiogroup" aria-label="Modo do editor">
        <button
          type="button"
          role="radio"
          aria-checked={modo === 'conteudo'}
          onClick={() => editor.definirModo('conteudo')}
        >
          Conteúdo
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={modo === 'design'}
          disabled
          title="Chega na próxima etapa da Fase 3"
        >
          Design
        </button>
      </div>
      <div className={css.acoesBarra}>
        <Botao
          variante="fantasma"
          tamanho="pequeno"
          icone="desfazer"
          disabled={!passado.length}
          onClick={() => editor.desfazer()}
          aria-label="Desfazer"
          title={passado.length ? `Desfazer: ${passado.at(-1)!.rotulo} (Ctrl+Z)` : 'Nada para desfazer'}
        />
        <Botao
          variante="fantasma"
          tamanho="pequeno"
          icone="refazer"
          disabled={!futuro.length}
          onClick={() => editor.refazer()}
          aria-label="Refazer"
          title={futuro.length ? `Refazer: ${futuro.at(-1)!.rotulo} (Ctrl+Shift+Z)` : 'Nada para refazer'}
        />
        {paraCompartilhar && (
          <>
            <Botao
              variante="primario"
              tamanho="pequeno"
              icone="enviar"
              onClick={() => void compartilhar()}
              data-testid="compartilhar"
            >
              Salvar nas Fotos / Compartilhar
            </Botao>
            <Botao variante="fantasma" tamanho="pequeno" icone="baixar" onClick={() => void baixarZipDoCompartilhar()}>
              ZIP
            </Botao>
          </>
        )}
        <Botao
          variante={paraCompartilhar ? 'secundario' : 'primario'}
          tamanho="pequeno"
          icone="exportar"
          disabled={!!exportando || !kit}
          onClick={() => void exportarSlides()}
          title={kit ? 'Baixar todos os slides em ZIP (JPG 2×)' : 'Escolha um Brand Kit para exportar'}
          data-testid="exportar"
        >
          {exportando || 'Exportar'}
        </Botao>
      </div>
    </header>
  );
}
