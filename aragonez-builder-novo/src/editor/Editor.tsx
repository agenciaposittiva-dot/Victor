import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { garantirArquivos } from '@/dados/arquivos';
import { acharKit, acharLayout, carregarCatalogo } from '@/dados/catalogo';
import type { Lido } from '@/dados/migracao';
import { repo, versaoDe } from '@/dados/repositorio';
import type { Projeto } from '@/dominio/schemas';
import { baixar } from '@/exportar/arquivos';
import { arquivosDosSlides, fontesDosSlides } from '@/exportar/usosDosSlides';
import { slug } from '@/exportar/nomes';
import { garantirFontes } from '@/render/fontes';
import { Botao } from '@/ui/Botao';
import { avisar } from '@/ui/toast';
import { Toasts } from '@/ui/Toasts';
import { Vazio } from '@/ui/Vazio';
import { AvisosDoEditor } from './AvisosDoEditor';
import { BarraSuperior } from './BarraSuperior';
import { Canvas } from './Canvas';
import { enquadrar } from './enquadramento';
import { editor, useEditor } from './estado';
import { FaixaDeSlides } from './FaixaDeSlides';
import { PainelConteudo } from './PainelConteudo';
import { registrarVersaoAberta, salvarAoSair, useSalvamentoAutomatico } from './salvamento';
import { useDocumento } from './useDocumento';
import css from './Editor.module.css';

type Abertura =
  | { estado: 'carregando' }
  | { estado: 'erro'; mensagem: string }
  | { estado: 'pronto' }
  | { estado: 'nao-encontrado' }
  | { estado: 'precisa-atualizar'; lido: Extract<Lido<Projeto>, { ok: false }> }
  | { estado: 'sem-layout'; projeto: Projeto };

/** Tela do editor (tela cheia): abre o projeto pelo endereço /editor/:projetoId. */
export default function Editor() {
  const { projetoId = '' } = useParams();
  const [abertura, setAbertura] = useState<Abertura>({ estado: 'carregando' });
  const [tentativa, setTentativa] = useState(0);

  // abrir e fechar no mesmo efeito: com o StrictMode (monta, desmonta e monta de novo) o projeto abre de novo, e
  // ao sair (voltar, trocar de projeto) a última edição é salva antes de o estado ser limpo
  useEffect(() => {
    let vivo = true;
    void (async () => {
      setAbertura({ estado: 'carregando' });
      try {
        const [lido, catalogo] = await Promise.all([repo.atual.lerProjeto(projetoId), carregarCatalogo()]);
        if (!vivo) return;
        if (!lido) return setAbertura({ estado: 'nao-encontrado' });
        if (!lido.ok) return setAbertura({ estado: 'precisa-atualizar', lido });
        const layout = acharLayout(catalogo, lido.valor.layoutId);
        if (!layout) return setAbertura({ estado: 'sem-layout', projeto: lido.valor });
        const kit = acharKit(catalogo, lido.valor.brandKitId) ?? null;
        const versao = versaoDe(lido.valor);
        editor.carregar({ projeto: lido.valor, layout, kit, versao });
        registrarVersaoAberta(lido.valor.id, versao);
        setAbertura({ estado: 'pronto' });
      } catch (e) {
        if (vivo) setAbertura({ estado: 'erro', mensagem: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      vivo = false;
      // lê o projeto na hora (antes de limpar) e grava depois dos salvamentos em andamento
      const salvando = salvarAoSair();
      editor.fechar();
      void salvando
        .then((r) => r.copia && avisar(`Suas mudanças foram salvas como cópia: ${r.copia}`, 'ok'))
        .catch((e: unknown) =>
          avisar('Não consegui salvar as últimas mudanças: ' + (e instanceof Error ? e.message : String(e)), 'erro'),
        );
    };
  }, [projetoId, tentativa]);

  if (abertura.estado === 'carregando')
    return (
      <p className={css.carregando} aria-busy="true">
        Abrindo o projeto…
      </p>
    );
  if (abertura.estado !== 'pronto')
    return (
      <div className={css.problema}>
        <Toasts />
        {abertura.estado === 'erro' && (
          <Vazio
            icone="editor"
            titulo="Não consegui abrir o projeto"
            texto={`Algo deu errado ao ler os dados deste navegador (${abertura.mensagem}).`}
            acoes={
              <>
                <Botao variante="primario" onClick={() => setTentativa((t) => t + 1)}>
                  Tentar de novo
                </Botao>
                <VoltarAosProjetos />
              </>
            }
          />
        )}
        {abertura.estado === 'nao-encontrado' && (
          <Vazio
            icone="editor"
            titulo="Este projeto não existe ou foi excluído"
            texto="Ele não está salvo neste navegador. Se tiver um backup (.zip), importe na tela de projetos."
            acoes={<VoltarAosProjetos />}
          />
        )}
        {abertura.estado === 'precisa-atualizar' && (
          <Vazio
            icone="editor"
            titulo={`“${abertura.lido.nome}” precisa de atualização`}
            texto={`Este projeto não abre nesta versão do app (${abertura.lido.erros.slice(0, 2).join('; ')}). Exporte o JSON bruto para não perder nada.`}
            acoes={
              <>
                <Botao
                  variante="primario"
                  icone="baixar"
                  onClick={() =>
                    baixar(
                      new Blob([JSON.stringify(abertura.lido.bruto, null, 2)], { type: 'application/json' }),
                      `${slug(abertura.lido.nome)}-bruto.json`,
                    )
                  }
                >
                  Exportar JSON
                </Botao>
                <VoltarAosProjetos />
              </>
            }
          />
        )}
        {abertura.estado === 'sem-layout' && (
          <Vazio
            icone="editor"
            titulo="O layout deste projeto não está neste navegador"
            texto={`“${abertura.projeto.nome}” usa o layout ${abertura.projeto.layoutId}, que não foi encontrado. Importe o backup que tem esse layout.`}
            acoes={
              <>
                <Botao
                  icone="baixar"
                  onClick={() =>
                    baixar(
                      new Blob([JSON.stringify(abertura.projeto, null, 2)], { type: 'application/json' }),
                      `${slug(abertura.projeto.nome)}.json`,
                    )
                  }
                >
                  Exportar JSON
                </Botao>
                <VoltarAosProjetos />
              </>
            }
          />
        )}
      </div>
    );
  return <AreaDoEditor />;
}

function VoltarAosProjetos() {
  const navegar = useNavigate();
  return (
    <Botao variante="secundario" icone="voltar" onClick={() => navegar('/editor')}>
      Ver projetos
    </Botao>
  );
}

function AreaDoEditor() {
  useSalvamentoAutomatico();
  useAtalhosBasicos();
  const { efetivo, montados, kit } = useDocumento();
  const modo = useEditor((s) => s.modo);
  // fontes usadas no documento: carrega quando o documento muda (o auto-ajuste mede de novo quando chegam)
  useEffect(() => {
    garantirFontes(fontesDosSlides(efetivo, montados, kit)).catch(() => undefined);
  }, [efetivo, montados, kit]);
  // fotos usadas no documento, a partir dos slides montados (o fundo do tipo entra mesmo quando o slide não tem um
  // próprio): carrega sempre que o documento muda (slide novo, troca de tipo, desfazer); as já carregadas são puladas
  const ids = useMemo(
    () => [...new Set(arquivosDosSlides(efetivo, montados, kit).arquivos.map((a) => a.assetId))].sort().join('\n'),
    [efetivo, montados, kit],
  );
  useEffect(() => {
    if (ids) void garantirArquivos(ids.split('\n'));
  }, [ids]);
  return (
    <div className={css.editor} data-testid="editor">
      <BarraSuperior />
      <div className={css.avisos}>
        <AvisosDoEditor />
      </div>
      <div className={css.corpo}>
        <aside className={css.painel} aria-label={modo === 'conteudo' ? 'Campos do slide' : 'Design'}>
          {modo === 'conteudo' ? (
            <PainelConteudo />
          ) : (
            <div className={css.emBreve}>
              <b>Modo Design</b>
              <p>Ferramentas, camadas, propriedades, réguas e guias chegam na próxima etapa da Fase 3.</p>
            </div>
          )}
        </aside>
        <Canvas />
      </div>
      <FaixaDeSlides />
      <Toasts />
    </div>
  );
}

/** Atalhos desta etapa: desfazer, refazer e zoom (o painel "?" com todos chega com o Modo Design).
 *  Campos ligados ao documento (data-historico) usam o desfazer do editor; os outros campos (busca, nome de
 *  arquivo) ficam com o desfazer do navegador. */
function useAtalhosBasicos() {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      const emCampo = alvo.closest('input, textarea, select, [contenteditable]');
      const doDocumento = !emCampo || alvo.closest('[data-historico]');
      const cmd = e.ctrlKey || e.metaKey;
      if (cmd && e.key.toLowerCase() === 'z' && doDocumento) {
        e.preventDefault();
        if (e.shiftKey) editor.refazer();
        else editor.desfazer();
      } else if (cmd && e.key.toLowerCase() === 'y' && doDocumento) {
        e.preventDefault();
        editor.refazer();
      } else if (e.shiftKey && e.code === 'Digit1' && !emCampo) enquadrar('slide');
      else if (e.shiftKey && e.code === 'Digit0' && !emCampo) enquadrar('tudo');
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);
}
