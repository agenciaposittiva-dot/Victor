import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { carregarCatalogo, type Catalogo } from '@/dados/catalogo';
import { AvisoFixo } from '@/ui/AvisoFixo';
import { Botao } from '@/ui/Botao';
import { Dialogo } from '@/ui/Dialogo';
import { editor, useEditor } from './estado';
import { exportarBackupEBaixar } from '@/projetos/backupEmArquivo';
import { avisar } from '@/ui/toast';
import {
  abrirVersaoSalva,
  ERRO_ARMAZENAMENTO_CHEIO,
  fecharSemSalvar,
  manterEstaVersao,
  salvarAgora,
  salvarComoCopia,
} from './salvamento';

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

  const copiar = async () => {
    const id = await salvarComoCopia();
    if (id) navegar(`/editor/${id}`, { replace: true });
  };

  return (
    <>
      {excluido && (
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
      )}
      {salvamento === 'conflito' && !excluido && (
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
      )}
      {outraAba && salvamento !== 'conflito' && (
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
      )}
      {!kit && (
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
      )}
      {salvamento === 'erro' && erro === ERRO_ARMAZENAMENTO_CHEIO && (
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
      )}
      {salvamento === 'erro' && erro !== ERRO_ARMAZENAMENTO_CHEIO && (
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
      )}
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
