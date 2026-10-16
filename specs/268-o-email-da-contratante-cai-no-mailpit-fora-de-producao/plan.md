# Plano — 268 O e-mail da contratante cai no Mailpit fora de produção

## Contexto e premissas (conferidas no código em 2026-10-16)

- `send-occurrence-mail.use-case.ts` chama `resolveMailSendReadiness({ settings })` e **lança** se a empresa não tem
  `sending_verified_at`; depois **decifra o envelope** da configuração para derivar o token de resposta
  (`deriveReplyToken`) e grava `fromAddress = settings.senderAddress`.
- `drizzle-occurrence-mail.repository.ts#recordMail` grava a thread (hash do token, `NOT NULL`, único, 64 hex), a
  mensagem (`contractor_mail_messages`) e o outbox.
- O worker (`send-contractor-mail-outbound-message.use-case.ts`) lê a mensagem, **exige** `contractor_mail_settings`
  (lança sem), decifra a chave e envia pelo `ResendMailGateway`. Anexos saem do bucket e vão em base64.
- O worker já tem `SMTP_URL` + `EMAIL_FROM` (e-mail do sistema, `createWorkerEmailDriver`). O driver
  `@adatechnology/email-provider` aceita **um** destinatário e **não** aceita anexo nem `From` por mensagem; o e-mail de
  ocorrência tem vários destinatários e anexos. Por isso o sandbox usa `nodemailer` direto (já é dependência do worker).
- A API não tem `EMAIL_FROM` (só `EMAIL_CHANNEL_ENABLED`). Ela passa a lê-lo, obrigatório só com o modo ligado.
- A API não grava o remetente da mensagem sandbox em `contractor_mail_settings`: o remetente é `EMAIL_FROM`.

## Decisões

1. **Transporte na linha, não só na env do worker.** A API decide (pela prontidão da empresa) e grava `transport`; o
   worker obedece à linha. Assim, empresa com Resend pronto nunca é desviada, mesmo em staging, e a mensagem diz como saiu.
2. **Fail closed em produção:** o schema de env das duas apps recusa o modo com `APP_ENV=production`.
3. **Sem `Reply-To` no sandbox.** Sem subdomínio de resposta não há como o token voltar.
4. **`sandboxDelivery` ao lado de `data`**, não dentro dele: `data` segue com as chaves exatas que o guarda do painel exige.

## Arquivos

### API
- `src/config/environment.schema.ts`, `src/shared/api.types.ts`: `CONTRACTOR_MAIL_SANDBOX_SMTP`, `EMAIL_FROM`.
- `src/database/contractor-mail.schema.ts` + migration `20261016120000_contractor_mail_message_transport`.
- `src/contractor-mail/domain/contractor-mail.constant.ts`: `CONTRACTOR_MAIL_TRANSPORTS`.
- `send-occurrence-mail.use-case.ts`, `occurrence-mail.port.ts`, `drizzle-occurrence-mail.repository.ts`: caminho sandbox.
- `contractor-mail-settings.use-case.ts`/`.routes.ts`, `main.ts`: `sandboxDelivery`.

### Worker
- `src/config/environment.schema.ts`, `src/shared/worker.types.ts`: flag.
- `src/database/contractor-mail.schema.ts`, `drizzle-contractor-mail-outbound-worker.repository.ts`: coluna.
- `src/contractor-mail/infrastructure/sandbox-smtp-mail.gateway.ts` (novo), `send-contractor-mail-outbound-message.use-case.ts`,
  `src/main.ts`.

### Painel
- `delivery-clients/shared/contractorMailSettings*.ts`, `useContractorMailSettings.hook.ts`: `sandboxDelivery`.
- `ContractorContactsPanel.component.tsx` (prop `contractorId` fixa e `onOpenContractors`), `ContractorFicha.component.tsx`,
  `MailSendReadinessSummary.component.tsx`, `DeliveryClientWorkspace.page.tsx`, locales pt/en.

### Infra e docs
- `.railway/railway.ts`: `CONTRACTOR_MAIL_SANDBOX_SMTP` e `EMAIL_FROM` (API) como `preserve()`.
- `apps/*/CLAUDE.md`, `docs/ai-context/*`, `.env.example`.

## Riscos

- Modo ligado por engano em produção: bloqueado no boot das duas apps.
- Linha `sandbox_smtp` consumida por worker com o modo desligado: falha sem enviar, sem tocar o Resend.
- Staging ligado + empresa que depois configura o Resend: passa a sair pelo Resend (comportamento desejado).
