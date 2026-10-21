# Feature 268 — O e-mail da contratante cai no Mailpit fora de produção

> Pedido do dono em 2026-10-16: em staging, o e-mail de ocorrência para a contratante precisa aparecer no Mailpit de
> staging, e a ficha da contratante precisa mostrar os contatos de ocorrência dela.

## Specs do mesmo assunto (lidas contra o código em `origin/staging`, 2026-10-16)

| Spec | O que já decidiu e esta spec **usa sem refazer**                                                                                                                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 143  | A chave do Resend e o segredo do webhook são **por empresa**, selados em `contractor_mail_settings.secret_envelope`. Só o worker envia. O e-mail do sistema (convite, senha) continua no `SMTP_URL` e **não muda**. A lista de contatos da contratante é `contractor_contacts`. |
| 150  | O envio é liberado por `sending_verified_at` (`resolveMailSendReadiness`), nunca por `status`. Contatos moram no módulo `delivery-clients` (`ContractorContactsPanel`/`ContactForm`).                                                                                           |
| 183  | O e-mail de ocorrência é a mensagem da 143 (`contractor_mail_messages`) mais a mensagem da conversa; `send-occurrence-mail.use-case.ts` grava tudo numa transação e o outbox leva o worker a enviar. O aviso automático (T802) usa o mesmo caminho.                             |
| 211  | O núcleo de conversa passou a incluir o e-mail; nada de transporte novo.                                                                                                                                                                                                        |
| 248  | O boleto/pedido levado a terceiro usa `forward-contractor-reply-by-email`, que também exige a configuração do Resend. **Fica fora desta spec** (ver Fora do escopo).                                                                                                            |

Ninguém decidiu ainda como o e-mail da contratante se comporta **sem** a conta do Resend. Em staging não há
`contractor_mail_settings` salva, então `send-occurrence-mail` recusa com `CONTRACTOR_MAIL_NOT_CONFIGURED` e nenhum e-mail
de ocorrência sai — nem para o Mailpit.

## Problema e resultado

O time não consegue ver, em staging, o e-mail que a contratante receberia. E a ficha da contratante não mostra para quem
a ocorrência vai: os contatos só existem numa aba "E-mail com contratantes", atrás de um seletor.

**Resultado:** em um ambiente que ligue `CONTRACTOR_MAIL_SANDBOX_SMTP=true` (nunca produção), o e-mail de ocorrência para a
contratante sai pelo SMTP do ambiente (Mailpit) quando a empresa **não** tem o Resend pronto. A ficha da contratante mostra
e edita os "Contatos de ocorrência". A aba de e-mail avisa quando a configuração falta e quando o ambiente está em modo
de teste.

## Requisitos funcionais

- **RF1 — Opt-in explícito.** `CONTRACTOR_MAIL_SANDBOX_SMTP` (`true`/`false`, padrão `false`) existe na API e no worker. Com
  `true` e `APP_ENV=production`, o boot falha nas duas apps (fail closed). Com `true` na API, `EMAIL_FROM` é obrigatório.
  Com `true` no worker, `SMTP_URL` e `EMAIL_FROM` são obrigatórios.
- **RF2 — Resend continua mandando quando está pronto.** Se a empresa tem o Resend configurado e verificado
  (`resolveMailSendReadiness` pronto), o envio é idêntico ao de hoje, **mesmo em staging com o modo ligado**.
- **RF3 — Sem Resend pronto, com o modo ligado, o e-mail de ocorrência vai ao sandbox.** `send-occurrence-mail` não recusa:
  grava a mensagem com `transport = 'sandbox_smtp'`, `fromAddress = EMAIL_FROM` e **sem** `Reply-To` (não há subdomínio
  de resposta, então a contratante não consegue responder pelo Mailpit). A thread recebe um hash de token de resposta
  aleatório (a coluna é obrigatória e única; ninguém o usa).
- **RF4 — Sem o modo ligado, nada muda.** Sem configuração pronta, a recusa de hoje (`CONTRACTOR_MAIL_NOT_CONFIGURED` /
  `..._SENDING_NOT_VERIFIED`) continua, em produção sempre.
- **RF5 — Coluna do transporte.** `contractor_mail_messages.transport varchar(16) NOT NULL DEFAULT 'resend'` com CHECK
  `IN ('resend','sandbox_smtp')`. Migration aditiva, com rollback manual.
- **RF6 — O worker roteia pela coluna.** Linha `sandbox_smtp` é enviada pelo SMTP do worker (`SMTP_URL`, o mesmo do e-mail
  do sistema) à mesma lista de destinatários, com anexos, e **nunca toca o Resend nem lê as configurações da empresa**.
  Linha `resend` segue o caminho de hoje. Linha `sandbox_smtp` com o modo desligado no worker falha sem enviar
  (`sandbox_disabled`).
- **RF7 — Logs sem dado.** Só `messageId`, `threadId` e motivo; nenhum endereço, assunto ou corpo.
- **RF8 — Aviso no painel (aba "E-mail com contratantes").** Sem configuração pronta, o resumo mostra: "Sem esta
  configuração nenhum e-mail de ocorrência sai para a contratante." Quando a API informa `sandboxDelivery: true`, mostra
  também: "Ambiente de teste: os e-mails para a contratante vão para o Mailpit, não saem para a internet." — e, nesse caso,
  o primeiro aviso é substituído por este (o e-mail sai, só não para a internet).
- **RF9 — `sandboxDelivery` na API.** O `GET /contractor-mail-settings` devolve `{ data, sandboxDelivery }`.
  `sandboxDelivery` é `true` só quando o modo está ligado **e** a configuração da empresa não está pronta.
- **RF10 — Contatos na ficha.** A ficha da contratante (aba "Contratantes") ganha a seção "Contatos de ocorrência", com a
  contratante fixa (sem seletor): listar, adicionar, editar, desativar e reativar, reusando `ContractorContactsPanel` e
  `ContactForm`.
- **RF11 — Atalho.** A seção de contatos da aba de e-mail ganha uma dica com botão que abre a aba "Contratantes".

## Fora do escopo

- O e-mail de correção de endereço (150) e o encaminhamento do boleto/pedido a terceiro (248) **continuam exigindo o
  Resend**: são outros casos de uso, e esta spec cobre só o e-mail de ocorrência para a contratante (manual e automático).
- Receber a resposta da contratante por Mailpit (não há webhook; é só saída).
- Definir valor da variável no Railway: a spec só declara a chave em `.railway/railway.ts` (`preserve()`); quem liga é o dono.
- Qualquer mudança no e-mail do sistema (convite, recuperação de senha).

## Critérios de aceite

1. `parseEnvironment`/`parseWorkerEnvironment` recusam `CONTRACTOR_MAIL_SANDBOX_SMTP=true` com `APP_ENV=production`.
2. Sem Resend pronto e modo ligado, `send-occurrence-mail` grava a mensagem `sandbox_smtp`; com Resend pronto grava `resend`.
3. O worker envia a linha `sandbox_smtp` por um transporte SMTP injetado e jamais chama o gateway do Resend.
4. A ficha da contratante mostra a seção de contatos, sem seletor, e adiciona/desativa contato.
5. Os dois avisos aparecem conforme `sandboxDelivery` e a prontidão.
6. Migration aplicada, revertida e reaplicada num banco descartável; `db:generate` dá `no_changes`.
