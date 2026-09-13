# Plano técnico

## Contexto e premissas

Levantado em 2026-09-13 por leitura do commit da 144 (`work/spec-144`) e do `dist` instalado de
`@adatechnology/notification-module`. **Nada foi medido em execução.** A primeira task de cada fase
confere a premissa dela antes de construir.

- O INBOX é síncrono: `sendNotification` grava a entrega como `sent` e publica no realtime em memória.
- O corpo da notificação é gravado em texto puro, em `notification.notifications` (`body` e `payload`).
- `PUSH_DRIVER` conhece só `expo` e `fcm`, e `notification.devices` já aceita `platform: 'web'`.
- O service worker é `generateSW` (`vite.config.ts:79-120`), sem `importScripts`.
- A CSP já tem `worker-src 'self'` e `manifest-src 'self'`, e o Web Push por VAPID não exige mudar o
  `connect-src`.

## Arquitetura

```
✅ Confirmar ──> confirmSelection (T013)
                  ├─ dono · canIssue · expiração · hash
                  ├─ code_mode exige? ── não ──> claimForConfirmation (igual à 144)
                  └─ sim ──> awaiting_code + código selado
                              ├─ sino: "Há um código" (sem o valor)
                              └─ Web Push: "Há um código" (sem o valor)
app ──GET /me/whatsapp-confirmation-codes/current──> abre o selado, mostra uma vez
"123456" na conversa ──> verifyConfirmationCode ──> claimForConfirmation ──> emite
```

## Dados, migration e rollback

Todas aditivas, com rollback ao lado:

1. `company_whatsapp_confirmation_settings`: `company_id` (PK e FK), `code_mode` (CHECK) e timestamps.
   Sem linha significa o padrão da D1.
2. `whatsapp_command_requests`: `awaiting_code` entra no CHECK de status (troca de CHECK). Colunas
   novas: `confirmation_code_hash`, `confirmation_code_sealed`, `confirmation_code_expires_at` e
   `confirmation_code_attempts`, com CHECK de teto. O índice parcial de pedidos em andamento continua
   sem `awaiting_code`.
3. `notification.devices`: nada muda na tabela. O driver `web` passa a ser escrito por nós.

## Contratos/API

- `GET`/`PUT`/`DELETE /company-settings/whatsapp-confirmation` (`settings.manage`).
- `GET /me/whatsapp-confirmation-codes/current`: devolve `{ code, requestId, expiresAt }` do pedido em
  `awaiting_code` do próprio usuário, ou `404`. Política de membership: entra na **allowlist por
  extenso** da T005b da 144, que é o molde e a trava.
- `POST`/`DELETE /me/web-push-subscriptions`: a inscrição do navegador. Mesma política e mesma
  allowlist.
- `GET /web-push/public-key`: a chave VAPID pública. Ela é pública por natureza, mas a rota fica
  autenticada.

## Segurança

- Código selado com AAD por pedido, e o digest para comparar. Nem o corpo da notificação nem o log
  levam o código.
- A leitura do código só é permitida ao próprio ator, e só enquanto o pedido está em `awaiting_code`.
- A chave VAPID privada fica só no ambiente, validada no boot. O frontend nunca a vê.
- A inscrição de push é por usuário e por empresa, e o envio só vai para as inscrições de quem
  confirmou.

## Estratégia de testes

1. Contrato da parada: `never` mantém a T013 intacta, e `always` para em `awaiting_code`.
2. Contrato do código: certo, errado cinco vezes, vencido, de outro pedido, de outra pessoa e repetido.
3. Contrato de não exposição: o texto da notificação e o log não contêm o código.
4. Integração: o fluxo inteiro com o Graph API fake, o sino real e o Web Push fake.
5. Contrato do service worker: o precache atual se mantém, e o `push` e o `notificationclick` existem.

## Riscos

- A troca de `generateSW` para `injectManifest` pode quebrar o PWA inteiro. É uma task isolada, com o
  smoke do PWA verde antes de seguir.
- A dependência de Web Push no Bun (D4).
