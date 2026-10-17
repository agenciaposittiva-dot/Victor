import { useRef, useState } from 'react';
import { aplicarBackup, analisarBackup, type AnaliseDeBackup, type DecisaoDeConflito } from '@/dados/backup';
import { repo } from '@/dados/repositorio';
import { AvisoFixo } from '@/ui/AvisoFixo';
import { Botao } from '@/ui/Botao';
import { Dialogo } from '@/ui/Dialogo';
import { avisar } from '@/ui/toast';
import { apagaDadosSemUso } from '@/dados/navegador';
import { exportarBackupEBaixar, useUltimoBackup } from './backupEmArquivo';
import css from './Projetos.module.css';

const ehSafari = () => apagaDadosSemUso();
const data = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const LOJA: Record<string, string> = { projetos: 'Projeto', layouts: 'Layout', kits: 'Brand Kit' };

/** Modo local: avisa que os dados ficam só neste navegador e oferece o backup (Exportar tudo / Importar). */
export function Backup({ aoImportar }: { aoImportar?: () => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [analise, setAnalise] = useState<AnaliseDeBackup | null>(null);
  const [decisoes, setDecisoes] = useState<Record<string, DecisaoDeConflito>>({});
  const [ocupado, setOcupado] = useState(false);
  const ultimoBackup = useUltimoBackup();
  const safari = ehSafari();

  const exportar = async () => {
    setOcupado(true);
    try {
      await exportarBackupEBaixar();
      avisar('Backup exportado.', 'ok');
    } catch (e) {
      avisar('Não consegui exportar o backup: ' + (e instanceof Error ? e.message : String(e)), 'erro');
    } finally {
      setOcupado(false);
    }
  };

  const aplicar = async (a: AnaliseDeBackup, d: Record<string, DecisaoDeConflito>) => {
    setOcupado(true);
    try {
      const r = await aplicarBackup(repo.atual, a, d);
      const total = r.gravados.projetos + r.gravados.layouts + r.gravados.kits;
      const partes = [
        `${total} ${total === 1 ? 'item importado' : 'itens importados'}`,
        r.identicos && `${r.identicos} ${r.identicos === 1 ? 'igual' : 'iguais'} aos daqui (pulados)`,
        r.pulados && `${r.pulados} pulado${r.pulados === 1 ? '' : 's'}`,
        r.ilegiveis.length && `${r.ilegiveis.length} ilegíve${r.ilegiveis.length === 1 ? 'l' : 'is'}`,
      ].filter(Boolean);
      avisar(partes.join(' · ') + '.', r.ilegiveis.length ? 'erro' : 'ok');
      setAnalise(null);
      aoImportar?.();
    } catch (e) {
      avisar('Não consegui importar: ' + (e instanceof Error ? e.message : String(e)), 'erro');
    } finally {
      setOcupado(false);
    }
  };

  const escolherArquivo = async (f: File | undefined) => {
    if (!f) return;
    try {
      const a = await analisarBackup(repo.atual, f);
      if (!a.conflitos.length) return void aplicar(a, {});
      setDecisoes(
        Object.fromEntries(a.conflitos.map((c) => [c.chave, c.maisRecente === 'backup' ? 'substituir' : 'pular'])),
      );
      setAnalise(a);
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'erro');
    } finally {
      if (entrada.current) entrada.current.value = '';
    }
  };

  return (
    <>
      <AvisoFixo
        tipo={safari ? 'aviso' : 'info'}
        titulo="Modo local: seus projetos ficam só neste navegador"
        testid="aviso-modo-local"
        acoes={
          <>
            <Botao tamanho="pequeno" icone="baixar" disabled={ocupado} onClick={exportar}>
              Exportar tudo
            </Botao>
            <Botao
              tamanho="pequeno"
              variante="fantasma"
              icone="enviar"
              disabled={ocupado}
              onClick={() => entrada.current?.click()}
            >
              Importar
            </Botao>
            <input
              ref={entrada}
              type="file"
              accept=".zip,application/zip"
              hidden
              aria-label="Arquivo de backup (.zip)"
              onChange={(e) => void escolherArquivo(e.target.files?.[0])}
            />
          </>
        }
      >
        {safari
          ? 'No Safari (e em qualquer navegador do iPhone e do iPad), o navegador pode apagar os dados do site depois de uns 7 dias sem abrir o app. Faça um backup (.zip) com frequência.'
          : 'Limpar os dados do navegador apaga tudo. Faça um backup (.zip) de vez em quando.'}{' '}
        <span data-testid="ultimo-backup">Último backup: {ultimoBackup ? data(ultimoBackup) : 'nunca'}.</span>
      </AvisoFixo>
      <Dialogo
        aberto={!!analise}
        titulo="Já existe aqui: o que fazer?"
        aoFechar={() => setAnalise(null)}
        largura={720}
        acoes={
          <>
            <Botao variante="fantasma" onClick={() => setAnalise(null)}>
              Cancelar
            </Botao>
            <Botao variante="primario" disabled={ocupado} onClick={() => analise && void aplicar(analise, decisoes)}>
              Importar
            </Botao>
          </>
        }
      >
        {analise && (
          <div className={css.conflitos}>
            <p>
              {analise.conflitos.length}{' '}
              {analise.conflitos.length === 1 ? 'item do backup já existe' : 'itens do backup já existem'} neste
              navegador com outra versão.
              {analise.identicos > 0 && ` ${analise.identicos} iguais aos daqui serão pulados.`}
            </p>
            <div className={css.lote}>
              Para todos:
              {(['substituir', 'manter-os-dois', 'pular'] as const).map((d) => (
                <Botao
                  key={d}
                  tamanho="pequeno"
                  variante="fantasma"
                  onClick={() => setDecisoes(Object.fromEntries(analise.conflitos.map((c) => [c.chave, d])))}
                >
                  {d === 'substituir' ? 'Substituir' : d === 'manter-os-dois' ? 'Manter os dois' : 'Pular'}
                </Botao>
              ))}
            </div>
            <ul>
              {analise.conflitos.map((c) => (
                <li key={c.chave}>
                  <div>
                    <b>
                      {LOJA[c.loja]}: {c.nome}
                    </b>
                    <small>
                      Aqui: {data(c.atualizadoEmAqui)} · Backup: {data(c.atualizadoEmBackup)} ·{' '}
                      {c.maisRecente === 'iguais'
                        ? 'mesma data'
                        : c.maisRecente === 'backup'
                          ? 'o do backup é mais recente'
                          : 'o daqui é mais recente'}
                    </small>
                  </div>
                  <select
                    aria-label={`O que fazer com ${c.nome}`}
                    value={decisoes[c.chave]}
                    onChange={(e) => setDecisoes({ ...decisoes, [c.chave]: e.target.value as DecisaoDeConflito })}
                  >
                    <option value="substituir">Substituir pelo do backup</option>
                    <option value="manter-os-dois">Manter os dois</option>
                    <option value="pular">Pular (fica o daqui)</option>
                  </select>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Dialogo>
    </>
  );
}
