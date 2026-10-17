# Teste no iPhone e no Safari do Mac

Roteiro para seguir com o aparelho na mão. Cada passo diz o que fazer e o que deve acontecer. Marque a caixinha quando der certo. Se algo não sair como está escrito, anote o número do passo e o que apareceu (uma captura de tela ajuda) e me mande.

Os testes automáticos rodam só no Chromium, porque nesta sessão a rede não deixou baixar o Safari de teste (item T2 do `PENDENCIAS.md`). Por isso estes passos são feitos à mão.

## Antes de começar

1. [ ] No computador, abra o terminal na pasta `aragonez-builder-novo` e rode `npm run dev -- --host`.
       Deve aparecer um endereço "Network" (exemplo: `http://192.168.0.10:5173`).
2. [ ] Ligue o iPhone na mesma rede Wi-Fi do computador e abra esse endereço no Safari.
       Deve abrir o Dashboard do Aragonez Builder.

## No iPhone

### Abrir, criar um projeto e editar texto

3. [ ] Toque em "Editor" no menu (ou em "Novo projeto" no Dashboard). Toque em "Novo projeto", escolha o layout "Teste de exportação (contínuo)" e o kit "Victor Aragonez", dê um nome e crie.
       O editor abre no slide 1, com o slide em cima e os campos embaixo.
4. [ ] Toque no campo "Título", embaixo do slide.
       O teclado abre e a página **não** amplia sozinha (sem zoom ao tocar no campo).
5. [ ] Digite uma palavra.
       O slide mostra o texto novo enquanto você digita, e continua visível em cima do teclado.

### Tocar num campo do slide

6. [ ] Feche o teclado. Toque no título **dentro do slide**.
       O campo "Título" do painel fica marcado, o teclado abre e o slide continua visível.

### Pinça no slide

7. [ ] Com dois dedos sobre o slide, afaste os dedos devagar.
       O slide aumenta junto com os dedos, na mesma medida: se a distância entre os dedos dobra, o slide fica com o dobro do tamanho, e **não** quatro vezes maior (zoom normal, não em dobro). O resto da página não amplia.
8. [ ] Aproxime os dedos.
       O slide diminui. A barra de cima e o painel de campos continuam do mesmo tamanho.

### Foto da câmera

9. [ ] No campo "Foto", toque em "Trocar foto" e tire uma foto **em pé** com a câmera (ou escolha na galeria uma foto de 24 MP ou de 48 MP).
       Em poucos segundos a foto aparece **em pé** no slide (não deitada), sem mensagem de erro.
10. [ ] Repita com uma foto **deitada** (paisagem).
        Ela aparece deitada, igual à galeria.

### Exportar e salvar nas Fotos

11. [ ] Role a página um pouco para cima, para a barra de endereço do Safari aparecer. Toque em "Exportar".
        Se abrir o diálogo ("Lembrete antes de exportar" ou "Exportar mesmo assim?"), os botões do rodapé aparecem **inteiros**, sem ficar atrás da barra do Safari. Se a lista for grande, ela rola dentro do diálogo.
12. [ ] No diálogo, toque em "Exportar" (ou "Exportar mesmo assim").
        Aparece "Exportando 1 de 3…", "2 de 3…" e depois o botão "Salvar nas Fotos / Compartilhar".
13. [ ] Toque em "Salvar nas Fotos / Compartilhar" e escolha "Salvar imagens".
        As imagens aparecem no app Fotos, em pé, com o texto e a foto certos.
14. [ ] Volte ao editor e mude qualquer texto.
        O botão "Salvar nas Fotos / Compartilhar" some (aqueles arquivos ficaram velhos). Exportar de novo gera os novos.

### Fechar o app no meio de uma edição

15. [ ] Digite um texto novo no título e, **logo em seguida**, vá para a tela inicial e feche o Safari pelo seletor de apps (deslize o Safari para cima).
16. [ ] Abra o Safari de novo, entre no app e abra o mesmo projeto.
        O texto que você digitou está lá. Nada foi perdido.

### Aviso do Modo local

17. [ ] Volte para a lista de projetos (menu "Editor").
        O quadro de backup avisa que o Safari pode apagar os dados do site depois de uns 7 dias sem abrir, e mostra a data do último backup (ou diz que ainda não há backup).
18. [ ] Toque em "Exportar tudo".
        Um arquivo .zip é baixado (app Arquivos, pasta Downloads), e a data do último backup muda para hoje.

## No Safari do Mac

19. [ ] No Mac, rode `npm run dev` e abra `http://localhost:5173` no Safari. Abra um projeto do layout "Teste de exportação (contínuo)".
        O editor abre com o slide no meio da tela.
20. [ ] Faça pinça no trackpad em cima do slide.
        Só o slide amplia (a página não), e o zoom acompanha os dedos.
21. [ ] Remova a foto do slide 1 (botão "Remover" no campo "Foto") e clique em "Exportar".
        Abre "Exportar mesmo assim?" com "Foto, slide 1 está vazia". O botão "Voltar e corrigir" já vem marcado: apertar Enter só fecha o diálogo, **não** exporta.
22. [ ] Clique em "Exportar" de novo e, no diálogo, clique no item "Foto, slide 1 está vazia".
        O diálogo fecha, o slide 1 fica ativo e o campo "Foto" fica marcado no painel.
23. [ ] Troque a foto por um arquivo **.svg** (um logo; de preferência um SVG só com `viewBox`, sem largura e altura, como os que saem de otimizadores) e exporte.
        O ZIP é baixado e **não** aparece o aviso "não apareceu no arquivo exportado". O logo aparece no JPG.
24. [ ] Na lista de projetos, confira o quadro de backup.
        Aparece o mesmo aviso dos 7 dias e a data do último backup (o Safari do Mac também apaga os dados de sites que ficam sem abrir).

## Quando terminar

Mande os números dos passos que falharam, com o que apareceu na tela. Se tudo passou, diga "Safari ok" com o modelo do iPhone e a versão do iOS e do macOS.
