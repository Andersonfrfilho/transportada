# Spec 231 — O app do motorista tem tema claro

## Problema

O app do motorista nasceu só escuro: `color-scheme: dark` fixo, uma paleta só. Os prints de revisão
"em claro" das specs anteriores eram idênticos aos escuros — o `emulateMedia` não tinha o que acender.
O painel já tem tema claro (tokens com papéis invertidos, botão, repasse ao login — ADR-0060); o
motorista, que usa o celular ao ar livre, é quem mais precisa de um tema legível ao sol.

Pedido do usuário (03/10/2026): "precisa adicionar o tema claro".

## Decisões

- **D1 — Segue o sistema; o botão do Perfil troca e guarda.** Sem escolha guardada o app obedece
  `prefers-color-scheme`. O botão "Usar tema claro / escuro" fica no **Perfil** (seção "Aparência"),
  não no cabeçalho: o cabeçalho de 375 px já tem logo, nome, fila, sino e avatar. A escolha mora em
  `localStorage['transportada:color-theme']` — a mesma chave e o mesmo desenho do painel (cópia por
  valor, ADR-0075 §7: `colorTheme.constant`, `colorTheme.service`, `browserColorTheme.service`,
  `useColorTheme.hook`).
- **D2 — Os tokens são os do painel, com os mesmos nomes.** Os oito tokens de cor do app (`alert`,
  `asphalt`, `copper`, `fog`, `graphite`, `ink-on-accent`, `ready`, `slate`) ganham os valores claros do
  painel: asfalto vira papel, névoa vira tinta, o cobre escurece para ter contraste de texto. Nenhum
  arquivo de tela muda — só `styles/index.css`. Duas portas para o mesmo bloco (`data-theme='light'` e a
  media query); o contrato compara os dois.
- **D3 — A escolha vale antes de qualquer tela.** `main.tsx` aplica a escolha guardada no início de
  `start()`, antes do Keycloak e do React. Não há script inline em `index.html`: a CSP do app o proíbe.
- **D4 — A escolha viaja para a tela de login (ADR-0060).** `createLoginUrl` do Keycloak é sobrescrito
  na criação do cliente e leva `transportada_theme=dark|light`; o tema de login que já existe o aplica.
  A ADR-0060 ganhou a emenda: o app do motorista participa (as duas apps escrevem no mesmo espelho do
  Keycloak e vale a última entrada).
- **D5 — A barra do navegador acompanha.** `meta[name=theme-color]` troca para `#F2EFE9` no claro e
  `#0B1F2A` no escuro, no boot e ao tocar no botão.

## Fora de escopo

- **Manifesto do PWA** (`theme_color`/`background_color` da tela de abertura do app instalado): é
  estático e não aceita media query; segue escuro. Mudá-lo deixaria os usuários do escuro com uma
  abertura clara.
- **Cartão da câmera** e a grade de recorte da foto: cores sobre imagem, iguais nos dois temas.
- **Painel (`frontend-transportada`) e portal do contratante**: o painel já tem; o portal não ganha.

## Critérios de aceite

- **CA1** Com o sistema em claro e nenhuma escolha, o app pinta em papel e tinta.
- **CA2** O botão do Perfil troca o tema, guarda a escolha e ela sobrevive ao recarregar.
- **CA3** O tema escolhido vai na URL de login, mesmo com o sistema em outro.
- **CA4** Os dois blocos claros são idênticos e cobrem todos os tokens de cor usados.
