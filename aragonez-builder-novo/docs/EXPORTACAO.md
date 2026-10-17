# Exportação: como funciona e por que é fiel

## Um renderizador só

Cada slide é desenhado pelo mesmo componente React (`src/render/`) no editor, nas miniaturas e na exportação. Na exportação, o slide é renderizado fora da tela **em tamanho real** (1080 de largura) e capturado.

Antes de capturar, a exportação:

1. carrega as fontes usadas pelos **slides montados** (inclusive fontes trocadas por ajuste do projeto ou dentro de componentes) e espera cada uma ficar pronta;
2. espera todas as imagens carregarem e decodificarem;
3. espera dois quadros de animação para o layout assentar.

As fontes são servidas pelo próprio site (`@fontsource`): a captura consegue embuti-las e o arquivo sai com a fonte certa, mesmo sem internet. Se alguma fonte não carregar, a tela avisa ("A fonte X não carregou; o arquivo saiu com fonte substituta") e o teste de pixels falha.

## Motor de captura: modern-screenshot (escolhido) × html-to-image

Medido pelo teste `tests/e2e/exportacao.spec.ts`. Cada slide exportado é comparado, pixel a pixel, com o render real do navegador (pixelmatch com limiar 0,12). O teste falha acima de 1% de diferença.

| Slide do layout de teste                                                   | modern-screenshot | html-to-image |
| -------------------------------------------------------------------------- | ----------------- | ------------- |
| 01 Capa (foto com filtro, borda, destaque em serif, componente)            | **0,12%**         | 0,27%         |
| 02 Conteúdo (contorno + sombra em Montserrat 900, caixa com sombra, ícone) | **0,04%**         | 0,06%         |
| 03 CTA (gradiente, componente ampliado, texto com transparência)           | **0,05%**         | 0,26%         |

O modern-screenshot ficou mais fiel nos três slides. É o padrão (`MOTOR_PADRAO`). O html-to-image continua disponível no laboratório só para comparação.

A diferença que sobra fica no antisserrilhado das bordas do texto e das curvas.

## Escolhas que garantem a fidelidade

- **Brilhos sem `filter: blur`.** São gradientes radiais em várias paradas, e o resultado sai idêntico no preview e no arquivo.
- **Linha de luz sem filtro SVG.** São quatro traços com espessura e opacidade diferentes.
- **Sombras.** `box-shadow` nas formas e imagens, `text-shadow` no texto.
- **Contorno de texto por fora da letra.** `-webkit-text-stroke` com `paint-order: stroke fill`.
- **JPG sem transparência.** A cor de base de cada slide é pintada por baixo antes de gerar o JPG.

## Carrossel contínuo

- **Estratégia padrão: slide a slide.** Cada slide é capturado pela sua "janela" na faixa, com deslocamento inteiro (`−i × 1080`), sem sobra nem falta de 1px.
- **Só desenha o que aparece na janela.** A janela desenha apenas os slides cujas camadas cruzam a janela, calculados pela área de cada camada com margem para rotação, sombra e contorno. Em geral são o próprio slide e os vizinhos. Um elemento que atravessa mais de um slide continua aparecendo inteiro.
- **Faixa inteira e fatiar: só para diagnóstico.** O canvas gigante passa do limite de área do iPhone (cerca de 16,7 milhões de pixels) e sai em branco. O teste confere que as duas estratégias dão o mesmo resultado.

## Memória e progresso

- Cada slide capturado vira arquivo na hora e o canvas é liberado (`width = height = 0`) antes do próximo. Por isso a memória não cresce com a quantidade de slides.
- Teste com 20 slides em 2× (2160 × 2700): ZIP de 5,7 MB em cerca de 9 s no Chromium. Os 20 arquivos saem com conteúdo e o progresso vai de 0/20 a 20/20.
- A exportação aceita `aoProgredir(feitos, total)`. O laboratório mostra "Exportando 3 de 20…", e o editor vai mostrar o mesmo.

## Formatos

- **JPG** (qualidade padrão 92%) e **PNG**, em 1× (1080) ou 2× (2160).
- **ZIP com todos os slides.** É o padrão para mais de um slide: JPG ou PNG de vários slides também sai em ZIP, porque o Chrome pede permissão para baixar vários arquivos soltos e o iPhone só baixa o primeiro.
- **PDF com uma página por slide.** Montado página a página.
- **Copiar slide.** O `ClipboardItem` é criado no clique com a Promise do PNG, como o Safari exige.
- **Nomes.** `{projeto}-{NN}-{tipo}.jpg`, por exemplo `prompt-bonito-nao-paga-boleto-01-capa.jpg`.
