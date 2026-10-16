# Evidência — 268 O e-mail da contratante cai no Mailpit fora de produção

## Decisões do dono (chat, 2026-10-16)

- Em staging, o e-mail de ocorrência para a contratante precisa aparecer no Mailpit de staging.
- A ficha da contratante precisa mostrar os contatos de ocorrência.
- Produção **nunca** usa este caminho. A chave no Railway é o dono quem liga.

## Levantamento (código em `origin/staging`, 2026-10-16)

- Staging não tem `contractor_mail_settings` salva; o worker de staging tem `SMTP_URL` (Mailpit) e `EMAIL_FROM`.
- API: `send-occurrence-mail.use-case.ts` recusa sem `sending_verified_at` e decifra o envelope para o token de resposta.
- Worker: `send-contractor-mail-outbound-message.use-case.ts` exige a configuração e a chave do Resend.
- `@adatechnology/email-provider` (SMTP) tem um destinatário e nenhum anexo: o sandbox usa `nodemailer` direto.
- A API não tinha `EMAIL_FROM`; passa a ter, obrigatório só com o modo ligado.

## Tasks

_(cada task registra aqui comando, saída resumida e commit)_
