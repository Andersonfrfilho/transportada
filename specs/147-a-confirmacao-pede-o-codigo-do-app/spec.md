# Feature 147 — A confirmação pede o código do app

## Problema e resultado

A spec 144 deixou o WhatsApp emitir CT-e e NFS-e com um toque em ✅ Confirmar. O toque vem de um
número verificado, a permissão é conferida a cada ação e a prévia é congelada. Mesmo assim, **o toque
é a única prova de intenção** antes de uma ação fiscal irreversível. Celular desbloqueado na mesa,
conversa aberta num aparelho emprestado ou número clonado: em todos esses casos o toque vale.

A revisão final da 144 (2026-09-13) achou outro sintoma do mesmo vão. A confirmação nunca exigiu
`billing.create`, e a liquidação sempre exigiu. Quem emite pelo bot sem poder faturar fica sem fatura
e **sem resumo nenhum** (achado B1). A decisão do usuário, no mesmo dia, foi:

> exigir um código que o app gera e que chega por push — de forma **configurável**, pelo **sino e
> pelo Web Push**.

O resultado desta feature é uma **segunda confirmação**. Antes de executar a operação, o bot pede um
código de 6 dígitos que só o app do próprio usuário recebe. Cada empresa decide em quais operações o
código é exigido. O código chega pelo sino do painel e, onde o navegador permitir, por notificação do
sistema com o app fechado.

⚠️ **Depende da spec 144 em staging.** As operações que esta feature interrompe só existem no branch
`work/spec-144`. Nada daqui se implementa antes de a 144 ser publicada.

## O que já existe e não se refaz

| peça                                                                                                        | onde                                                                                                   | estado                                              |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Geração e conferência de código de 6 dígitos (`randomInt`, sha256, `timingSafeEqual`, 5 tentativas, 10 min) | `whatsapp-commands/application/whatsapp-verification-code.service.ts` (T004 da 144)                    | pronto                                              |
| Código em claro **selado** com AAD e entregue por outbox                                                    | `identity/.../password-reset-code.service.ts` + outbox                                                 | pronto — é o molde para não expor o código          |
| Envio ao sino (`sendNotification` com `templateKey`, INBOX síncrono, SSE de contagem)                       | `main.ts:619-633`, `notification-catalog.constant.ts`                                                  | pronto, mas grava o corpo em texto puro             |
| Canal `PUSH` e a tabela `notification.devices` (`platform` inclui `web`)                                    | `@adatechnology/notification-module`                                                                   | existe, **sem driver Web Push** (só `expo` e `fcm`) |
| Configuração por empresa em enum com CHECK e painel posicionado                                             | `company_delivery_proof_settings` + `SETTINGS_PANEL_PLACEMENT`                                         | molde                                               |
| Parada da confirmação de emissão                                                                            | entre o recálculo do hash e `claimForConfirmation` (`confirm-document-selection.use-case.ts:~133-146`) | ponto de corte medido                               |

## Decisões

### D1 — Em quais operações o código é exigido é configuração da empresa

`company_whatsapp_confirmation_settings`, na aba **WhatsApp** de Configurações, ao lado do canal
(`/company-settings/whatsapp-channel`), sob `settings.manage`.

Decidido pelo usuário em 2026-09-13:

- **As quatro operações do bot são configuráveis**, cada uma com uma chave: emitir documentos fiscais
  (CT-e e NFS-e, com a fatura); registrar entrega ou devolução (motorista); registrar ocorrência
  (motorista e operador); separar, carregar e despachar (operador). A lista vive numa constante
  (`WHATSAPP_CONFIRMATION_OPERATIONS`), nunca em string solta.
- **O padrão depende do canal, e a configuração é por canal.** No WhatsApp não há como saber se quem
  toca é a própria pessoa: um número verificado prova a posse do chip, não a presença do dono. Por isso
  **no WhatsApp as quatro operações começam exigindo o código**, e a empresa desliga o que quiser.
  Canal que prove a pessoa (o painel autenticado, por exemplo) não entra nesta configuração.
- A chave da tabela é `(company_id, channel, operation)`, com `channel` em CHECK (hoje só
  `whatsapp`). Linha ausente segue o padrão do canal, e o padrão mora numa constante por canal. Isso
  torna um canal novo uma linha na constante, sem migration.

⚠️ **Isto muda o comportamento da 144 no primeiro deploy:** quem já usa o bot passa a receber o
pedido de código nas quatro operações até alguém desligar. A mudança é deliberada, e o texto de
lançamento, a tela de Configurações e o `CLAUDE.md` precisam dizer isso.

### D2 — O código vai para o próprio usuário

Decidido pelo usuário em 2026-09-13. É um **segundo fator**: quem tocou em Confirmar recebe o código
no próprio app e o digita na conversa. Não há aprovação entre duas pessoas, não há fila e não há
aprovador.

### D3 — O código não fica em texto puro

O sino grava o corpo renderizado em `notification.notifications.body` e o payload em `payload`, os
dois em texto puro, com purga só às 04h. Um código de 6 dígitos com sha256 sem sal se reverte por
força bruta a partir do banco. Por isso:

- a notificação diz **"Há um código de confirmação para você"**, com link para a tela, e **nunca
  traz o código**;
- a tela do app busca o código por uma rota autenticada, que devolve o valor **selado** (molde da
  recuperação de senha, AAD `transportada:whatsapp-confirmation:v1:${companyId}:${codeId}` — por
  código e não por pedido, porque só a emissão tem pedido e o código mora num lugar só para as quatro
  operações) e o
  mostra uma vez;
- o Web Push leva só "Há um código de confirmação", e o toque abre a mesma tela.

### D4 — Web Push por driver próprio, VAPID

O módulo de notificação só tem drivers `expo` e `fcm`. A escolha é **VAPID próprio**, com um driver
nosso ao lado do INBOX e sem SDK do Google no bundle. O FCM na web exigiria `connect-src` e
`script-src` do Google, e isso vai contra a CSP enxuta que o painel mantém.

- Service worker: `vite-plugin-pwa` passa de `generateSW` para `injectManifest`, com `src/sw.ts`
  próprio que mantém o precache atual e acrescenta `push` e `notificationclick`.
- Inscrição: a tela pede permissão **só depois de um gesto do usuário** (botão "Receber códigos por
  notificação"), nunca no carregamento, e grava em `notification.devices` (`platform: 'web'`).
- Chaves VAPID vêm do ambiente, validadas no boot. A pública é exposta ao frontend e a privada
  **nunca**.
- **Dependência de envio (decidido pelo usuário em 2026-09-13):** a T007 mede se `web-push` (npm) roda
  no Bun. Se rodar, entra como dependência. Se não, o protocolo (JWT ES256 + `aes128gcm` do RFC
  8291/8292) é implementado com `crypto` nativo. Qualquer que seja o resultado, ele é registrado em ADR
  **antes** de qualquer código de envio.

⚠️ **No iPhone, o Web Push só chega com o PWA instalado na tela inicial (iOS 16.4+).** Fora disso,
fica só o sino. A tela diz isso ao usuário, e o sino é sempre o canal garantido.

### D5 — A conversa espera o código, com prazo

- Na emissão, o pedido ganha o estado `awaiting_code`, e a transição de `previewed` para
  `awaiting_code` acontece **depois** do hash conferido e **antes** do `claim`. Nas operações sem
  pedido congelado (entrega, ocorrência, separar, carregar, despachar), a operação escolhida fica
  guardada no `context` da sessão **só com ids opacos**, e o código fica numa tabela própria ligada à
  sessão.
- O bot responde "Enviamos um código para o seu app. Digite-o aqui.", e o nó seguinte aceita texto que
  case `^\s*\d{6}\s*$` (o mesmo padrão da T004).
- O código vale 10 minutos, com 5 tentativas. Código certo executa a operação exatamente como a 144 a
  executaria. Código vencido ou esgotado cancela a operação, com "refazer".
- Na emissão, `awaiting_code` **não** conta como em curso: o índice parcial de pedidos em andamento e
  o `resume` da T013 o ignoram.
- O código é **ligado à operação e ao ator**. O código de uma operação não confirma outra, e o código
  de outra pessoa não vale.

### D6 — O B1 da 144 se resolve aqui

Decidido pelo usuário em 2026-09-13: **o bot nunca fatura em nome de quem não pode faturar**, nem com
o código.

- A liquidação passa a revalidar `billing.create` **só quando há CT-e autorizado a faturar**. Pedido
  só de NFS-e liquida como `settled` e manda o resumo.
- CT-e emitido por quem não tem `billing.create`: os CT-e saem, a fatura **não** é gerada, e o resumo
  diz "fatura não gerada: fature pelo painel", com a lista dos CT-e. O pedido liquida como
  `settled_partial`, com um desfecho próprio (nome em constante, CHECK por migration aditiva).
- Ator **inativo** (membership suspensa) continua sem resumo, como a T014b da 144 fechou.

## Requisitos funcionais

- **RF1** Configuração por empresa das operações que exigem código, com rota e painel (D1).
- **RF2** A parada de cada operação configurada antes de executar, com `awaiting_code` na emissão e
  código ligado à sessão nas demais (D5).
- **RF3** Código selado, entregue pelo sino sem o valor no corpo e lido por rota autenticada (D3).
- **RF4** Web Push por VAPID próprio: service worker em `injectManifest`, inscrição por gesto e driver
  de envio, com a dependência decidida em ADR (D4).
- **RF5** Liquidação revalida `billing.create` só quando há CT-e a faturar, e CT-e sem a permissão
  resulta em "fature pelo painel" (D6).

## Critérios de aceite

1. Com nenhuma operação marcada, o bot se comporta exatamente como na 144. Os contratos da 144 passam
   sem edição.
2. Com uma operação marcada, tocar nela não executa: o bot responde "Enviamos um código…", o sino
   recebe uma notificação **sem o código**, e a tela do app mostra o código.
3. O código certo, digitado na conversa, executa. O mesmo código, digitado de novo, não executa duas
   vezes.
4. Código errado cinco vezes, ou fora dos 10 minutos, cancela a operação, e nada é executado.
5. Em `notification.notifications`, em log, em `whatsapp_command_requests` e no `context` da sessão, o
   código não aparece em claro.
6. Com o Web Push inscrito e o app fechado, a notificação do sistema chega, e o toque abre a tela do
   código.
7. Pedido só de NFS-e, de quem não tem `billing.create`, liquida e recebe o resumo. Pedido com CT-e,
   de quem não tem `billing.create`, emite, não fatura, e o resumo diz "fature pelo painel" (B1).

## Fora do escopo

- Push nativo (Expo ou FCM mobile): o produto é PWA.
- Assinatura digital ou biometria (WebAuthn) como segundo fator. Seria o passo seguinte ao código.
- Segunda confirmação no **painel**: a ação pelo painel continua como está.
- Aprovação por outra pessoa (descartada na D2).

## Riscos conhecidos

- ⚠️ O SSE do sino roda em memória de um processo (`createInProcessRealtimeNotifier`). Com mais de
  uma réplica da API, a contagem no sino pode não atualizar sozinha. O Web Push não depende disso, e
  o sino atualiza no próximo carregamento.
- ⚠️ Trocar `generateSW` por `injectManifest` mexe no precache do PWA inteiro. Isso não pode derrubar
  o offline nem o `autoUpdate`, e o contrato de PWA atual precisa continuar verde.
