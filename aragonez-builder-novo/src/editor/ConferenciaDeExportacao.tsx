import { useRef } from 'react';
import type { Conferencia } from '@/exportar/exportar';
import { Botao } from '@/ui/Botao';
import { Dialogo } from '@/ui/Dialogo';
import { Icone } from '@/ui/Icone';
import {
  irAoCampo,
  irAoSlide,
  temProblema,
  textoDaFalta,
  textoDaVazia,
  textoDoExemplo,
  textosDoKit,
} from './conferencia';
import css from './Editor.module.css';

type Item = { texto: string; ir: () => void };

/** Pergunta antes de exportar quando alguma foto falta, um campo de foto está vazio ou o kit não tem uma cor ou o
 *  handle: o foco começa em "Voltar e corrigir" (Enter ao abrir não exporta). A foto de exemplo do layout que o
 *  projeto não trocou entra como lembrete; se for só isso, o foco começa em "Exportar". Cada item leva ao campo. */
export function ConferenciaDeExportacao({
  conferencia,
  nomeDoKit,
  aoVoltar,
  aoExportar,
}: {
  conferencia: Conferencia;
  nomeDoKit: string;
  aoVoltar: () => void;
  aoExportar: () => void;
}) {
  // destino de cada aviso do kit, na ordem de textosDoKit (cores e depois o handle)
  const destinosDoKit = [
    ...conferencia.problemasDoKit.cores.map((c) => c.slides),
    ...(conferencia.problemasDoKit.handle ? [conferencia.problemasDoKit.handle] : []),
  ];
  const problemas: Item[] = [
    ...conferencia.faltando.map((f) => ({ texto: textoDaFalta(f), ir: () => irAoCampo(f) })),
    ...conferencia.vazias.map((v) => ({ texto: textoDaVazia(v), ir: () => irAoCampo(v) })),
    ...textosDoKit(conferencia.problemasDoKit, nomeDoKit).map((texto, i) => ({
      texto,
      ir: () => irAoSlide(destinosDoKit[i]!),
    })),
  ];
  const lembretes: Item[] = conferencia.deExemplo.map((e) => ({ texto: textoDoExemplo(e), ir: () => irAoCampo(e) }));
  const bloqueia = temProblema(conferencia);
  // com problema, o foco começa em "Voltar e corrigir" (Enter não exporta); só lembrete, em "Exportar"
  const primeiro = useRef<HTMLButtonElement>(null);
  const um = problemas.length + lembretes.length === 1;
  const lista = (itens: Item[], icone: 'alerta' | 'ajuda', testid: string) => (
    <ul className={css.conferenciaLista} data-testid={testid}>
      {itens.map((it, i) => (
        <li key={i} className={icone === 'ajuda' ? css.lembrete : undefined}>
          <button
            type="button"
            onClick={() => {
              aoVoltar();
              it.ir();
            }}
          >
            <Icone nome={icone} tamanho={16} />
            <span>{um ? `${it.texto}: exportar mesmo assim?` : it.texto}</span>
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <Dialogo
      aberto
      titulo={bloqueia ? 'Exportar mesmo assim?' : 'Lembrete antes de exportar'}
      aoFechar={aoVoltar}
      focoInicial={primeiro}
      acoes={
        bloqueia ? (
          <>
            <Botao variante="fantasma" onClick={aoExportar} data-testid="exportar-mesmo-assim">
              Exportar mesmo assim
            </Botao>
            <Botao variante="primario" onClick={aoVoltar} ref={primeiro}>
              Voltar e corrigir
            </Botao>
          </>
        ) : (
          <>
            <Botao variante="fantasma" onClick={aoVoltar}>
              Voltar e trocar
            </Botao>
            <Botao variante="primario" onClick={aoExportar} data-testid="exportar-mesmo-assim" ref={primeiro}>
              Exportar
            </Botao>
          </>
        )
      }
    >
      <p className={css.conferenciaTexto}>
        {um ? 'Antes de exportar, confira:' : 'Antes de exportar, confira. Toque em um item para ir até o campo.'}
      </p>
      {problemas.length > 0 && lista(problemas, 'alerta', 'conferencia')}
      {lembretes.length > 0 && (
        <>
          {problemas.length > 0 && <h3 className={css.conferenciaSubtitulo}>Lembrete</h3>}
          {lista(lembretes, 'ajuda', 'conferencia-lembretes')}
        </>
      )}
      {bloqueia && (
        <p className={css.conferenciaNota}>
          Foto que falta ou campo vazio sai como espaço vazio no arquivo; cor que o kit não tem sai em magenta.
        </p>
      )}
    </Dialogo>
  );
}
