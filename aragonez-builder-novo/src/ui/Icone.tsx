import type { SVGProps } from 'react';

/** Ícones da interface (traço 1,8, herdam a cor do texto). */
const CAMINHOS = {
  painel: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  biblioteca: 'M4 5h4v14H4zM10 5h4v14h-4zM16.5 5.5l3.5 1-3.5 13-3.5-1z',
  editor: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  kits: 'M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-1.3-1.2-1.6-1.2-2.8 0-.9.7-1.6 1.7-1.6H17a4 4 0 0 0 4-4C21 6.2 17 3 12 3zM7.5 11a1 1 0 1 0 0-.01M10 7a1 1 0 1 0 0-.01M15 7a1 1 0 1 0 0-.01',
  mais: 'M12 5v14M5 12h14',
  nuvem: 'M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18z',
  local: 'M4 6h16v10H4zM2 19h20M9 16v3M15 16v3',
  busca: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  menu: 'M4 7h16M4 12h16M4 17h16',
  fechar: 'M6 6l12 12M18 6 6 18',
  imagem: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9a1 1 0 1 0 0-.01',
  faisca:
    'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  exportar: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  ajuda: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17v.01',
  alerta: 'M12 4 2.5 20h19zM12 10v4.5M12 17.5v.01',
  voltar: 'M15 5l-7 7 7 7',
  avancar: 'M9 5l7 7-7 7',
  desfazer: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  refazer: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  copiar: 'M8 8h11v11H8zM5 16V5h11',
  lixeira: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  lapis: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  menos: 'M5 12h14',
  ajustar: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  enviar: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  baixar: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  pastas: 'M3 7h6l2 2h10v10H3z',
  texto: 'M5 6h14M12 6v13M9 19h6',
  arrastar: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
} as const;

export type NomeIcone = keyof typeof CAMINHOS;

export function Icone({
  nome,
  tamanho = 20,
  ...resto
}: { nome: NomeIcone; tamanho?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...resto}
    >
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}
