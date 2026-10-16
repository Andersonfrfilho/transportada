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

### Fase 0 — spec (`f35dd363b`)

Levantamento acima; spec, plano e tasks.

### T1.1 — chave de ambiente (`aa65b6eea`, `59cdee1cd`)

`CONTRACTOR_MAIL_SANDBOX_SMTP` (`true`/`false`, padrão `false`) na API e no worker. Produção (`APP_ENV=production`) derruba o boot
nas duas; a API exige `EMAIL_FROM` (nova no schema da API) e o worker exige `SMTP_URL` e `EMAIL_FROM`. Testes:
`api-transportada/test/contractor-mail/sandbox-environment.contract.ts` (6) e
`worker-transportada/test/contractor-mail-sandbox-environment.contract.test.ts` (6).

### T1.2 — coluna `transport` (`0c80b4a34`)

Migration `20261016125229_contractor_mail_message_transport` (aditiva: `varchar(16) NOT NULL DEFAULT 'resend'` + CHECK) com
`rollback.sql` que recusa rodar com mensagem `sandbox_smtp` ainda `queued`. `db:generate` gerou só esta migration. Prova num banco
descartável (`spec268_check`, no Postgres de teste): cadeia aplicada em 7,5 s, coluna `character varying(16)`, padrão `'resend'`,
NOT NULL; rollback removeu a coluna e a linha do journal; reaplicada; CHECK `contractor_mail_messages_transport_check`
presente; banco descartado. `database-migration.contract.test.ts`: 185 pass, 4 skip (os skips são antigos).

### T1.3 / T1.4 — API (`abab16016`, `b9b702a81`)

`send-occurrence-mail.use-case.ts` recebe `contractorMailSandbox?` (só montado quando a env liga). Sem Resend pronto e com o modo
ligado grava `transport = 'sandbox_smtp'`, `fromAddress = EMAIL_FROM`, hash de token aleatório e **não decifra nada**; com Resend
pronto grava `resend` e decifra como antes; sem o modo, a recusa de sempre. O aviso automático usa o mesmo caso de uso (3 pontos de
montagem em `main.ts`). `GET /contractor-mail-settings` devolve `{ data, sandboxDelivery }`.
Integração `occurrence-mail-sandbox.integration.ts` (3 pass), mais `occurrence-automatic-mail*`, `contractor-mail-settings-repository`,
`occurrence-contractor-reply-read`: 19 pass, 0 fail.

### T2.1 — worker (`e0f9a01a6`, integração no commit seguinte)

`sandbox-smtp-mail.gateway.ts` (nodemailer direto; o driver do `email-provider` tem um destinatário só e nenhum anexo). A linha
`sandbox_smtp` nunca lê `contractor_mail_settings` nem chama o Resend; sem o modo no worker, falha sem enviar (`sandbox_disabled`).
Integração `contractor-mail-sandbox-outbound.integration.ts` + as de e-mail do worker que leem a linha: 20 pass, 0 fail.

### T3 — painel (`9aeb4572c`)

Seção "Contatos de ocorrência" na ficha (contratante fixa, sem seletor e sem listar contratantes), avisos na aba de e-mail e atalho
para a aba Contratantes. Contrato `test/trip-hooks/contractor-mail-sandbox-panel.contract.ts` (8). O harness do diretório passou a
dublar também o cliente de contatos, porque a ficha agora o monta.

### T4 — infra e docs

`.railway/railway.ts`: `CONTRACTOR_MAIL_SANDBOX_SMTP` (API e worker) e `EMAIL_FROM` (API), todas `preserve()`; **nenhum valor foi
definido no Railway**. `.env.example`, `apps/*/CLAUDE.md` e `docs/ai-context/*` atualizados.

### Gates (WSL, Bun 1.4.3; o Makefile fixa 1.3.14)

| App    | Comando                                                | Resultado                                                        |
| ------ | ------------------------------------------------------ | ---------------------------------------------------------------- |
| API    | `tsc --noEmit` · `eslint src test …`                   | limpos                                                           |
| API    | `bun --env-file=../../.env.test test --timeout 120000` | 11843 pass, 25 skip (antigos), 0 fail                            |
| Worker | `tsc --noEmit` · `eslint src test scripts …`           | limpos                                                           |
| Worker | `bun run test`                                         | 2638 pass, 5 fail — todos `canhoto decode thread exited with 13` |
| Painel | `tsc --noEmit` · `eslint .`                            | sem erro (os 16 avisos são antigos)                              |
| Painel | `bun test --timeout 90000 …` (script `test`)           | 8239 pass, 1 fail — sonda headless (Chromium) do CSP             |
| Painel | `bun run test:hooks --timeout 60000`                   | 1375 pass, 0 fail                                                |
| Raiz   | `bunx prettier --check .`                              | só os 2 `.md` desta spec reprovavam; corrigidos                  |

As 5 falhas do worker (decodificador de canhoto em `worker_thread`) e a da sonda headless do painel **não são desta spec**: o mesmo
arquivo do worker falha no checkout principal sem esta branch (3 fail lá), e a sonda precisa de um Chromium que o WSL não tem. Os testes
de varredura do painel estouram os 5 s do Bun no `/mnt/c` se o `--timeout` não vier **antes** dos arquivos.

## Pendente (não feito de propósito)

- Ligar `CONTRACTOR_MAIL_SANDBOX_SMTP=true` (e conferir `EMAIL_FROM`) no Railway de **staging**: decisão do dono. Produção nunca.
- Nenhum `push`.
