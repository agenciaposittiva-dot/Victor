import { Fragment, useId, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CartaoDoBanco } from '@/app/AvisosDoBanco';
import { useAvisoDoBanco } from '@/app/avisoDoBanco';
import { carregarCatalogo, type Catalogo } from '@/dados/catalogo';
import { AvisoFixo } from '@/ui/AvisoFixo';
import { Botao } from '@/ui/Botao';
import { Dialogo } from '@/ui/Dialogo';
import { problemasDoKit } from '@/exportar/usosDosSlides';
import { irAoSlide, temProblemaDoKit, textosDoKit } from './conferencia';
import { editor, useEditor } from './estado';
import { exportarBackupEBaixar } from '@/projetos/backupEmArquivo';
import { avisar } from '@/ui/toast';
import { useTelaPequena } from '@/ui/useTelaPequena';
import {
  abrirVersaoSalva,
  ERRO_ARMAZENAMENTO_CHEIO,
  fecharSemSalvar,
  manterEstaVersao,
  salvarAgora,
  salvarComoCopia,
} from './salvamento';
import { useDocumento } from './useDocumento';
import css from './Editor.module.css';

async function exportarTudoAgora() {
  try {
    await exportarBackupEBaixar();
    avisar('Backup exportado.', 'ok');
  } catch (e) {
    avisar('Não consegui exportar o backup: ' + (e instanceof Error ? e.message : String(e)), 'erro');
  }
}

/** Abre a versão salva pela outra aba; se ela sumiu (projeto excluído lá), explica e mantém o aviso com a opção de cópia. */
async function abrirOuExplicar() {
  if (await abrirVersaoSalva()) return;
  avisar(
    'Não encontrei a versão da outra aba (o projeto pode ter sido excluído lá). Use “Salvar a minha como cópia” para não perder suas mudanças.',
    'erro',
  );
  useEditor.setState({ salvamento: 'conflito' });
}

/** Avisos fixos do editor: ficam na tela até a pessoa escolher (conflito com outra aba, salvo em outra aba, kit que
 *  não existe, erro ao salvar). */
export function AvisosDoEditor() {
  const navegar = useNavigate();
  const salvamento = useEditor((s) => s.salvamento);
  const erro = useEditor((s) => s.erroAoSalvar);
  const outraAba = useEditor((s) => s.alteradoEmOutraAba);
  const excluido = useEditor((s) => s.excluidoEmOutraAba);
  const kit = useEditor((s) => s.kit);
  const kitId = useEditor((s) => s.projeto?.brandKitId);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [escolhido, setEscolhido] = useState('');

  // a cópia primeiro; se falhar, o aviso de conflito continua e nada some em silêncio
  const copiar = async () => {
    try {
      const id = await salvarComoCopia();
      if (id) navegar(`/editor/${id}`, { replace: true });
    } catch (e) {
      avisar('Não consegui salvar a sua como cópia: ' + (e instanceof Error ? e.message : String(e)), 'erro');
    }
  };
  const banco = useAvisoDoBanco();
  const avisoDoKit = useAvisoDoKit();

  // por urgência: o armazenamento (com ele, nada é salvo), projeto excluído, conflito, erro ao salvar, salvo em outra
  // aba, kit ausente e cores do kit
  const itens: AvisoNaPilha[] = [];
  if (banco)
    itens.push({
      chave: 'banco',
      nome: banco === 'banco-atualizado' ? 'armazenamento atualizado em outra aba' : 'outra aba bloqueando',
      el: <CartaoDoBanco aviso={banco} />,
    });
  if (excluido)
    itens.push({
      chave: 'excluido',
      nome: 'projeto excluído',
      el: (
        <AvisoFixo
          tipo="erro"
          titulo="Este projeto foi excluído em outra aba"
          testid="aviso-excluido"
          acoes={
            <>
              <Botao
                tamanho="pequeno"
                variante="primario"
                onClick={async () => {
                  // a cópia primeiro (o editor.carregar dela já tira o aviso); se falhar, o aviso continua e nada
                  // é recriado em silêncio
                  try {
                    const id = await salvarComoCopia('recuperado');
                    if (id) navegar(`/editor/${id}`, { replace: true });
                  } catch (e) {
                    avisar(
                      'Não consegui salvar como projeto novo: ' + (e instanceof Error ? e.message : String(e)),
                      'erro',
                    );
                  }
                }}
              >
                Salvar como projeto novo
              </Botao>
              <Botao
                tamanho="pequeno"
                onClick={() => {
                  fecharSemSalvar();
                  navegar('/editor');
                }}
              >
                Fechar sem salvar
              </Botao>
            </>
          }
        >
          O salvamento automático parou para não recriar o projeto sem você querer.
        </AvisoFixo>
      ),
    });
  if (salvamento === 'conflito' && !excluido)
    itens.push({
      chave: 'conflito',
      nome: 'conflito com outra aba',
      el: (
        <AvisoFixo
          tipo="erro"
          titulo="Este projeto foi salvo em outra aba depois que você abriu"
          testid="aviso-conflito"
          acoes={
            <>
              <Botao tamanho="pequeno" onClick={() => setConfirmarDescarte(true)}>
                Abrir a versão da outra aba
              </Botao>
              <Botao tamanho="pequeno" variante="primario" onClick={() => void manterEstaVersao()}>
                Manter a minha (salvar por cima)
              </Botao>
              <Botao tamanho="pequeno" onClick={() => void copiar()}>
                Salvar a minha como cópia
              </Botao>
            </>
          }
        >
          Nada foi salvo por cima. Escolha o que fazer com as mudanças desta aba.
        </AvisoFixo>
      ),
    });
  if (salvamento === 'erro' && erro === ERRO_ARMAZENAMENTO_CHEIO)
    itens.push({
      chave: 'erro-cheio',
      nome: 'armazenamento cheio',
      el: (
        <AvisoFixo
          tipo="erro"
          titulo="O armazenamento deste navegador está cheio"
          testid="aviso-erro-salvar"
          acoes={
            <>
              <Botao tamanho="pequeno" icone="baixar" onClick={() => void exportarTudoAgora()}>
                Exportar tudo
              </Botao>
              <Botao tamanho="pequeno" onClick={() => navegar('/editor')}>
                Ver projetos
              </Botao>
              <Botao tamanho="pequeno" variante="primario" onClick={() => void salvarAgora()}>
                Tentar de novo
              </Botao>
            </>
          }
        >
          As últimas mudanças ainda não foram salvas. Faça um backup e exclua projetos que não usa mais para liberar
          espaço.
        </AvisoFixo>
      ),
    });
  if (salvamento === 'erro' && erro !== ERRO_ARMAZENAMENTO_CHEIO)
    itens.push({
      chave: 'erro-salvar',
      nome: 'erro ao salvar',
      el: (
        <AvisoFixo
          tipo="erro"
          titulo="Não consegui salvar"
          testid="aviso-erro-salvar"
          acoes={
            <Botao tamanho="pequeno" variante="primario" onClick={() => void salvarAgora()}>
              Tentar de novo
            </Botao>
          }
        >
          {erro}
        </AvisoFixo>
      ),
    });
  if (outraAba && salvamento !== 'conflito')
    itens.push({
      chave: 'outra-aba',
      nome: 'salvo em outra aba',
      el: (
        <AvisoFixo
          tipo="aviso"
          titulo="Este projeto foi salvo em outra aba"
          testid="aviso-outra-aba"
          acoes={
            <>
              <Botao
                tamanho="pequeno"
                variante="primario"
                onClick={() => (salvamento === 'salvo' ? void abrirOuExplicar() : setConfirmarDescarte(true))}
              >
                Abrir a versão mais nova
              </Botao>
              <Botao
                tamanho="pequeno"
                variante="fantasma"
                onClick={() => useEditor.setState({ alteradoEmOutraAba: false })}
              >
                Continuar aqui
              </Botao>
            </>
          }
        >
          Se você continuar editando aqui, vou perguntar antes de salvar por cima.
        </AvisoFixo>
      ),
    });
  if (!kit)
    itens.push({
      chave: 'kit-ausente',
      nome: 'kit ausente',
      el: (
        <AvisoFixo
          tipo="aviso"
          titulo={`O Brand Kit deste projeto (${kitId}) não existe neste navegador`}
          testid="aviso-kit"
          acoes={
            catalogo ? (
              <>
                <select aria-label="Brand Kit" value={escolhido} onChange={(e) => setEscolhido(e.target.value)}>
                  <option value="">Escolha um kit…</option>
                  {catalogo.kits.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nome}
                    </option>
                  ))}
                </select>
                <Botao
                  tamanho="pequeno"
                  variante="primario"
                  disabled={!escolhido}
                  onClick={() => {
                    const k = catalogo.kits.find((x) => x.id === escolhido);
                    if (k) editor.escolherKit(k);
                  }}
                >
                  Usar este kit
                </Botao>
              </>
            ) : (
              <Botao tamanho="pequeno" onClick={() => void carregarCatalogo().then(setCatalogo)}>
                Escolher um kit
              </Botao>
            )
          }
        >
          O preview usa o kit Neutro e a exportação está bloqueada até você escolher um kit.
        </AvisoFixo>
      ),
    });
  if (avisoDoKit) itens.push({ chave: 'cores-do-kit', nome: 'cores do kit', el: avisoDoKit });

  return (
    <>
      <PilhaDeAvisos itens={itens} />
      <Dialogo
        aberto={confirmarDescarte}
        titulo="Abrir a versão da outra aba?"
        aoFechar={() => setConfirmarDescarte(false)}
        acoes={
          <>
            <Botao variante="fantasma" onClick={() => setConfirmarDescarte(false)}>
              Cancelar
            </Botao>
            <Botao
              variante="perigo"
              onClick={() => {
                setConfirmarDescarte(false);
                void abrirOuExplicar();
              }}
            >
              Descartar as mudanças desta aba
            </Botao>
          </>
        }
      >
        <p>
          As mudanças feitas nesta aba depois do último salvamento serão perdidas. Para guardar as duas versões, use
          “Salvar a minha como cópia”.
        </p>
      </Dialogo>
    </>
  );
}

/** Cores pedidas pelo layout que o kit não tem (saem em magenta) e {handle} sem handle no kit: aviso fixo ao abrir
 *  ou trocar o kit. "Entendi" esconde até o kit mudar ou aparecer um problema novo. O problemasDoKit guarda o
 *  resultado por camada: digitar refaz só a camada editada. */
function useAvisoDoKit(): ReactNode {
  const { efetivo, montados, kit, kitFaltando } = useDocumento();
  const problemas = useMemo(() => problemasDoKit(efetivo, montados, kit), [efetivo, montados, kit]);
  const textos = textosDoKit(problemas, kit.nome);
  const chave = `${kit.id}|${textos.join('|')}`;
  const [dispensado, setDispensado] = useState('');
  // kit que não existe tem o próprio aviso (o preview usa o Neutro)
  if (kitFaltando || !temProblemaDoKit(problemas) || dispensado === chave) return null;
  const destinos = [...problemas.cores.map((c) => c.slides), ...(problemas.handle ? [problemas.handle] : [])];
  return (
    <AvisoFixo
      tipo="aviso"
      titulo={`O kit ${kit.nome} não tem tudo o que este layout usa`}
      testid="aviso-cores-do-kit"
      acoes={
        <Botao tamanho="pequeno" variante="fantasma" onClick={() => setDispensado(chave)}>
          Entendi
        </Botao>
      }
    >
      <ul>
        {textos.map((t, i) => (
          <li key={i}>
            <button type="button" onClick={() => irAoSlide(destinos[i]!)}>
              {t}
            </button>
          </li>
        ))}
      </ul>
    </AvisoFixo>
  );
}

type AvisoNaPilha = { chave: string; nome: string; el: ReactNode };

/** Avisos empilhados, já na ordem de urgência. No celular, só o mais urgente fica aberto e os outros cabem numa
 *  linha que diz quais são ("+2 avisos: kit ausente, cores do kit") e abre e fecha a lista (senão eles empurram o
 *  canvas para fora da tela). */
function PilhaDeAvisos({ itens }: { itens: AvisoNaPilha[] }) {
  const celular = useTelaPequena();
  const [aberta, setAberta] = useState(false);
  const idDosOutros = useId();
  if (!itens.length) return null;
  const [primeiro, ...outros] = itens;
  const juntos = !celular || aberta;
  return (
    <>
      {primeiro!.el}
      {celular && outros.length > 0 && (
        <button
          type="button"
          className={css.maisAvisos}
          aria-expanded={aberta}
          aria-controls={idDosOutros}
          data-testid="mais-avisos"
          onClick={() => setAberta((a) => !a)}
        >
          {aberta
            ? 'Mostrar só o mais urgente'
            : `+${outros.length} ${outros.length === 1 ? 'aviso' : 'avisos'}: ${outros.map((o) => o.nome).join(', ')}`}
        </button>
      )}
      {outros.length > 0 && (
        <div id={idDosOutros} className={css.outrosAvisos} hidden={!juntos}>
          {outros.map((i) => (
            <Fragment key={i.chave}>{i.el}</Fragment>
          ))}
        </div>
      )}
    </>
  );
}
