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

O resultado desta feature é uma **segunda confirmação**. Antes de emitir, o bot pede um código de 6
dígitos que só o app do usuário recebe. Cada empresa decide quando o pedido acontece. O código chega
pelo sino do painel e, onde o navegador permitir, por notificação do sistema com o app fechado.

⚠️ **Depende da spec 144 em staging.** A confirmação que esta feature interrompe
(`confirm-document-selection.use-case.ts`) só existe no branch `work/spec-144`. Nada daqui se
implementa antes de a 144 ser publicada.

## O que já existe e não se refaz

| peça                                                                                                        | onde                                                                                                   | estado                                              |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Geração e conferência de código de 6 dígitos (`randomInt`, sha256, `timingSafeEqual`, 5 tentativas, 10 min) | `whatsapp-commands/application/whatsapp-verification-code.service.ts` (T004 da 144)                    | pronto                                              |
| Código em claro **selado** com AAD e entregue por outbox                                                    | `identity/.../password-reset-code.service.ts` + outbox                                                 | pronto — é o molde para não expor o código          |
| Envio ao sino (`sendNotification` com `templateKey`, INBOX síncrono, SSE de contagem)                       | `main.ts:619-633`, `notification-catalog.constant.ts`                                                  | pronto, mas grava o corpo em texto puro             |
| Canal `PUSH` e a tabela `notification.devices` (`platform` inclui `web`)                                    | `@adatechnology/notification-module`                                                                   | existe, **sem driver Web Push** (só `expo` e `fcm`) |
| Configuração por empresa em enum com CHECK e painel posicionado                                             | `company_delivery_proof_settings` + `SETTINGS_PANEL_PLACEMENT`                                         | molde                                               |
| Parada da confirmação                                                                                       | entre o recálculo do hash e `claimForConfirmation` (`confirm-document-selection.use-case.ts:~133-146`) | ponto de corte medido                               |

## Decisões

### D1 — Quando pedir é configuração da empresa

`company_whatsapp_confirmation_settings.code_mode`, com CHECK, na aba **WhatsApp** de Configurações,
ao lado do canal (`/company-settings/whatsapp-channel`), sob `settings.manage`.

[NEEDS CLARIFICATION: quais são os modos? A proposta é `never` · `always` · `without_billing_create`
(só quem não pode faturar precisa do código). Entra também um modo por valor, como "acima de R$ X na
prévia"? Qual é o padrão para a empresa que nunca configurou: `always` (seguro) ou `never` (mantém o
comportamento da 144)?]

### D2 — Quem recebe o código

[NEEDS CLARIFICATION: o código vai para **o próprio usuário que confirmou**, como segundo fator
contra celular aberto ou número clonado, ou, no modo `without_billing_create`, para **quem pode
faturar**, que aprova a emissão de outra pessoa? Os dois desenhos são diferentes. O primeiro é um
segundo fator: mesma pessoa, outro canal. O segundo é uma aprovação entre duas pessoas, e precisa de
fila de aprovação, de dizer quem aprova e do que acontece se ninguém aprovar.]

### D3 — O código não fica em texto puro

O sino grava o corpo renderizado em `notification.notifications.body` e o payload em `payload`, os
dois em texto puro, com purga só às 04h. Um código de 6 dígitos com sha256 sem sal se reverte por
força bruta a partir do banco. Por isso:

- a notificação diz **"Há um código de confirmação para você"**, com link para a tela, e **nunca
  traz o código**;
- a tela do app busca o código por uma rota autenticada, que devolve o valor **selado** (molde da
  recuperação de senha, AAD `transportada:whatsapp-confirmation:v1:${companyId}:${requestId}`) e o
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

[NEEDS CLARIFICATION: a dependência de envio. `web-push` (npm) é o caminho comum, mas é Node-first.
Antes de adotá-la, confirmar que roda no Bun, ou implementar o protocolo (JWT ES256 + criptografia
`aes128gcm` do RFC 8291) com `crypto` nativo. A regra de dependências (code-standart §13) pede
conferir isso.]

⚠️ **No iPhone, o Web Push só chega com o PWA instalado na tela inicial (iOS 16.4+).** Fora disso,
fica só o sino. A tela diz isso ao usuário, e o sino é sempre o canal garantido.

### D5 — A conversa espera o código, com prazo

- O pedido ganha o estado `awaiting_code`, e a transição de `previewed` para `awaiting_code` acontece
  **depois** do hash conferido e **antes** do `claim`.
- O bot responde "Enviamos um código para o seu app. Digite-o aqui.", e o nó seguinte aceita texto que
  case `^\s*\d{6}\s*$` (o mesmo padrão da T004).
- O código vale 10 minutos, com 5 tentativas. Código certo leva ao `claim` e a T013 segue igual.
  Código vencido ou esgotado leva a `expired`, com "refazer".
- `awaiting_code` **não** conta como em curso: o índice parcial de pedidos em andamento e o `resume`
  da T013 o ignoram.
- O código é **ligado ao pedido e ao ator**. Código de um pedido não confirma outro, e o código de
  outra pessoa não vale.

### D6 — O B1 da 144 se resolve aqui

Com o modo configurado, a liquidação passa a revalidar `billing.create` **só quando há CT-e
autorizado a faturar**. Pedido só de NFS-e liquida como `settled` e manda o resumo. CT-e emitido por
quem não fatura:

[NEEDS CLARIFICATION: sai a fatura (porque a aprovação da D2 veio de quem fatura) ou fica "fatura não
gerada: fature pelo painel"? Depende da D2.]

## Requisitos funcionais

- **RF1** Configuração `code_mode` por empresa, com rota e painel (D1).
- **RF2** Estado `awaiting_code` e a parada da confirmação entre o hash e o `claim` (D5).
- **RF3** Código selado, entregue pelo sino sem o valor no corpo e lido por rota autenticada (D3).
- **RF4** Web Push por VAPID próprio: service worker em `injectManifest`, inscrição por gesto e driver
  de envio (D4).
- **RF5** Liquidação revalida `billing.create` só quando há CT-e a faturar (D6).

## Critérios de aceite

1. Com `code_mode = never`, a confirmação se comporta exatamente como na 144. Os contratos da T013
   passam sem edição.
2. Com `code_mode = always`, ✅ Confirmar não emite: responde "Enviamos um código…", o sino recebe
   uma notificação **sem o código**, e a tela do app mostra o código.
3. O código certo, digitado na conversa, emite. O mesmo código, digitado de novo, não emite duas vezes.
4. Código errado cinco vezes, ou fora dos 10 minutos, leva o pedido a `expired`, e nada é emitido.
5. Em `notification.notifications`, em log e em `whatsapp_command_requests`, o código não aparece em
   claro.
6. Com o Web Push inscrito e o app fechado, a notificação do sistema chega, e o toque abre a tela do
   código.
7. Pedido só de NFS-e, de quem não tem `billing.create`, liquida e recebe o resumo (B1).

## Fora do escopo

- Push nativo (Expo ou FCM mobile): o produto é PWA.
- Assinatura digital ou biometria (WebAuthn) como segundo fator. Seria o passo seguinte ao código.
- Segunda confirmação no **painel**: a ação fiscal pelo painel continua como está.

## Riscos conhecidos

- ⚠️ O SSE do sino roda em memória de um processo (`createInProcessRealtimeNotifier`). Com mais de
  uma réplica da API, a contagem no sino pode não atualizar sozinha. O Web Push não depende disso, e
  o sino atualiza no próximo carregamento.
- ⚠️ Trocar `generateSW` por `injectManifest` mexe no precache do PWA inteiro. Isso não pode derrubar
  o offline nem o `autoUpdate`, e o contrato de PWA atual precisa continuar verde.
