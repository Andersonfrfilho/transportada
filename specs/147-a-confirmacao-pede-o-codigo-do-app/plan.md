# Plano técnico

## Contexto e premissas

Levantado em 2026-09-13 por leitura do commit da 144 (`work/spec-144`) e do `dist` instalado de
`@adatechnology/notification-module`. **Nada foi medido em execução.** A primeira task de cada fase
confere a premissa dela antes de construir.

⚠️ **Emenda (spec 189/ADR-0075, T8.3, 2026-09-25):** o PWA do motorista deixou de ser
`apps/frontend-transportada` (o painel) e virou `apps/frontend-driver`, uma app própria. A premissa
abaixo "o service worker é `generateSW`" descrevia o painel em 13/09 e **não vale mais** para onde a
Fase 3 (T007–T011) executa: `apps/frontend-driver/src/sw.ts` já nasce `injectManifest`, com
`registerType: 'prompt'` — ver `apps/frontend-driver/CLAUDE.md` e a ADR-0075 §5. T008 passa a ser só
"acrescentar `push`/`notificationclick`", sem troca de modo. T006 (tela do código) e T010 (inscrição)
também mudam de alvo — ver a nota no topo do `tasks.md`.

- O INBOX é síncrono: `sendNotification` grava a entrega como `sent` e publica no realtime em memória.
- O corpo da notificação é gravado em texto puro, em `notification.notifications` (`body` e `payload`).
- `PUSH_DRIVER` conhece só `expo` e `fcm`, e `notification.devices` já aceita `platform: 'web'`.
- ~~O service worker é `generateSW` (`vite.config.ts:79-120`), sem `importScripts`.~~ Superada pela
  emenda acima: hoje é `injectManifest`, em `apps/frontend-driver`.
- A CSP já tem `worker-src 'self'` e `manifest-src 'self'`, e o Web Push por VAPID não exige mudar o
  `connect-src`.

## Arquitetura

```
toque numa das quatro operações ──> requireConfirmationCode({ actor, channel, operation, reference })
                  ├─ a operação exige código neste canal? ── não ──> executa (igual à 144)
                  └─ sim ──> código selado, ligado à operação e ao ator
                              ├─ emissão: pedido vai para awaiting_code (entre o hash e o claim)
                              ├─ demais: a operação fica no context da sessão, só com ids opacos
                              ├─ sino: "Há um código" (sem o valor)
                              └─ Web Push: "Há um código" (sem o valor)
app ──GET /me/whatsapp-confirmation-codes/current──> abre o selado, mostra uma vez
"123456" na conversa ──> verifyConfirmationCode ──> executa a operação guardada
```

## Dados, migration e rollback

Todas aditivas, com rollback ao lado:

1. `company_whatsapp_confirmation_settings`: chave `(company_id, channel, operation)`, a coluna
   `requires_code` e timestamps. `channel` e `operation` têm CHECK vindo das constantes de canais e de
   `WHATSAPP_CONFIRMATION_OPERATIONS`. Linha ausente segue o padrão do canal, que mora numa constante
   (no WhatsApp, as quatro operações exigem código).
2. `whatsapp_confirmation_codes`: empresa, ator, sessão, operação, referência opaca da operação,
   `code_hash`, `code_sealed`, `expires_at`, `attempt_count` (CHECK de teto) e `consumed_at`, com o
   código vivo único por (empresa, ator, sessão).
3. `whatsapp_command_requests`: `awaiting_code` entra no CHECK de status (troca de CHECK). O código da
   emissão mora em `whatsapp_confirmation_codes`, com a referência apontando para o pedido, e não em
   colunas novas do pedido: um lugar só para o código das quatro operações. O índice parcial de
   pedidos em andamento continua sem `awaiting_code`.
4. `notification.devices`: nada muda na tabela. O driver `web` passa a ser escrito por nós.

## Contratos/API

- `GET`/`PUT`/`DELETE /company-settings/whatsapp-confirmation` (`settings.manage`): lê e grava a chave
  de cada operação no canal. `DELETE` de uma operação volta ao padrão do canal.
- `GET /me/whatsapp-confirmation-codes/current`: devolve `{ code, operation, expiresAt }` do código
  vivo do próprio usuário, qualquer que seja a operação, ou `404`. Política de membership: entra na
  **allowlist por extenso** da T005b da 144, que é o molde e a trava.
- `POST`/`DELETE /me/web-push-subscriptions`: a inscrição do navegador. Mesma política e mesma
  allowlist.
- `GET /web-push/public-key`: a chave VAPID pública. Ela é pública por natureza, mas a rota fica
  autenticada.

## Segurança

- Código selado com AAD por operação (`transportada:whatsapp-confirmation:v1:${companyId}:${codeId}`),
  e o digest para comparar. Nem o corpo da notificação, nem o push, nem o log, nem o `context` da
  sessão levam o código.
- A leitura do código só é permitida ao próprio ator, e só enquanto o código está vivo (não consumido
  e dentro do prazo).
- A chave VAPID privada fica só no ambiente, validada no boot. O frontend nunca a vê.
- A inscrição de push é por usuário e por empresa, e o envio só vai para as inscrições de quem tocou
  na operação.

## Estratégia de testes

1. Contrato da parada, por operação: operação desligada executa exatamente como na 144 (a T013 da 144
   intacta), e operação ligada para em `awaiting_code` (emissão) ou no código ligado à sessão (as
   outras três). Linha ausente segue o padrão do canal: no WhatsApp, as quatro ligadas.
2. Contrato do código: certo, errado cinco vezes, vencido, de outra operação, de outra pessoa e
   repetido.
3. Contrato de não exposição: o texto da notificação, o push, o log e o `context` não contêm o código.
4. Integração: o fluxo inteiro com o Graph API fake, o sino real e o Web Push fake.
5. Contrato do service worker: o precache atual se mantém, e o `push` e o `notificationclick` existem.

## Riscos

- ~~A troca de `generateSW` para `injectManifest` pode quebrar o PWA inteiro.~~ Não se aplica mais
  (emenda spec 189/ADR-0075, T8.3): `apps/frontend-driver/src/sw.ts` já é `injectManifest`, então a
  T008 só acrescenta handlers. Mesmo assim, o smoke do PWA fica verde antes de seguir — é o service
  worker de uma app inteira que muda.
- A dependência de Web Push no Bun (D4): decidida em ADR na T007, antes de qualquer código de envio.
- O primeiro deploy liga o código nas quatro operações do WhatsApp para quem já usa o bot (D1). O
  lançamento precisa avisar.
