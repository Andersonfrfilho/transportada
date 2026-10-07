# Tasks

> ⚠️ **Não executar** enquanto houver `[NEEDS CLARIFICATION]` em `spec.md` § Dúvidas (Q1–Q6).
> Pré-condições: a **spec 247** publicada (editor do e-mail à contratante na aba Tipos, RF2 dela,
> `{{numeroNotaSemSerie}}`); 241 e 246 em `origin/staging`. A Fase 6 (WhatsApp) depende ainda da
> **183 T002/T503** (modelos da Meta).

Uma task por vez, na ordem. Cada uma fecha com typecheck, teste e commit isolado, e registra a
evidência em `evidence.md`. Na API, contrato e integração são dois comandos e nenhum cobre o outro;
a integração exige `--env-file=../../.env.test`; teste novo entra na lista do `package.json` da app.
No worker, `make worker-integration` provisiona o banco descartável.

## Fase 0 — Conferência

> 🤖 Modelo: `haiku`

- [ ] **T0.1** Conferir os fatos do `plan.md` § Contexto contra `origin/staging` (arquivo e linha) e a
      versão instalada de `@adatechnology/meta-whatsapp-provider` (`sendMedia`/`uploadMedia` existem
      na 0.4.0?). Divergência vira nota em `evidence.md`.
- [ ] **T0.2** Conferir que a 247 está em `origin/staging`; se não estiver, parar.

## Fase 1 — Painel e app tolerantes (etapa 1)

> 🤖 Modelo: `haiku`

- [ ] **T1.1** Painel: validação aceita os cinco campos do tipo, as duas colunas da exceção e o
      objeto `contractorReply` da ocorrência como opcionais; contrato com e sem as chaves.
- [ ] **T1.2** App do motorista: idem para o estado do retorno na ocorrência.

## Fase 2 — O dado (etapa 2)

> 🤖 Modelo: `sonnet` (T2.1 é 🧠 — `opus`, validar com `architect` antes)

- [ ] **T2.1** 🧠 Schema e migration do `plan.md` § Modelo de dados (colunas do tipo, exceção,
      `occurrence_contractor_replies`, `occurrence_contractor_reply_events`), CHECKs geradas de
      constantes, FKs compostas, índice parcial, `tenant-safety.contract.ts` cobrindo as tabelas;
      `rollback.sql`; `make migration-test`.
- [ ] **T2.2** Integração da migration: defaults, CHECKs (`reply_needs_mail`, `reply_needs_text`,
      `reminder_needs_wait`, `actor_kind`/`actor_user_id`), unicidade por ocorrência.
- [ ] **T2.3** Mutações da T2.2 registradas: tirar `reply_needs_mail`; default `forward_automatic`;
      permitir `actor_user_id` nulo com `actor_kind = 'user'`.

## Fase 3 — Domínio e trilho

> 🤖 Modelo: `sonnet` (T3.4 é 🧠 — `opus`: é a ação automática sem humano)

- [ ] **T3.1** Contrato **antes**: `contractor-reply.contract.ts` com a tabela de casos da spec
      (0/1/N anexos, tipo pelos bytes, já enviado, expirado, cancelado), na API **e** no worker
      (espelho, mesma tabela).
- [ ] **T3.2** `decideContractorReply` e transições permitidas, nas duas apps.
- [ ] **T3.3** Mutações da T3.1 registradas: aceitar pelo nome do arquivo; enviar com dois PDFs;
      reenviar depois de `sent_to_driver`; ler o modo do tipo em vez do copiado no retorno.
- [ ] **T3.4** 🧠 Abertura do retorno na transação do envio automático, com o modo **efetivo**
      (tipo + exceção de contratante); varredor `occurrence.automatic-mail.sweep` (RF2) com a mesma
      idempotência. Integração CA01 e CA04 (**só a configuração decide**, com mutação `if` pelo nome).
- [ ] **T3.5** Worker: evento `occurrence.contractor-reply.received` no outbox depois da resposta
      gravada; consumidor aplica a política; integração CA02 (`make worker-integration`), incluindo
      resposta duplicada e token de outra empresa (CA06).
- [ ] **T3.6** `forwardContractorReplyToDriver` (worker e API) pelo app do motorista, referência ao
      mesmo `stored_object`, idempotente; conferir que o expurgo conta as duas referências.
- [ ] **T3.7** Rota `POST /trip-occurrences/:id/contractor-reply/forward` (`occurrences.resolve`,
      rate limit da 183); contratos de permissão negativa e de empresa B.
- [ ] **T3.8** Cron `occurrence.contractor-reply.remind`: `expired` + lembrete uma vez (CA05, job
      rodando duas vezes).
- [ ] **T3.9** Contrato de parede + mutação: nenhum log com e-mail, nome de arquivo, CNPJ ou número de
      nota nos arquivos novos (CA07).

## Fase 4 — Telas (etapa 3)

> 🤖 Modelo: `sonnet`

- [ ] **T4.1** Aba Tipos: bloco "Retorno da contratante" dentro de "E-mail à contratante" (247),
      habilitado só com o e-mail ligado; os cinco campos com o vocabulário da tela; exceção por
      contratante com "Igual ao tipo".
- [ ] **T4.2** Selo do retorno na lista e no detalhe da ocorrência; botões "Enviar ao motorista" e
      "Tentar de novo"; motivo legível de cada `reason`.
- [ ] **T4.3** App do motorista: "Pedido enviado à contratante", o anexo na conversa, e o
      compartilhamento conforme Q6.

## Fase 5 — Roteiro operacional

> 🤖 Modelo: `haiku`

- [ ] **T5.1** Acrescentar ao roteiro da 247 (`docs/operacao/tipos-de-ocorrencia-do-sac.md`) a
      prorrogação, com os valores exatos da spec § "Modelo do SAC" e as respostas de Q2–Q5. Nada de
      seed nem migration que altere tipo de empresa existente.

## Fase 6 — WhatsApp (atrás da 183 T002/T503)

> 🤖 Modelo: `sonnet`

- [ ] **T6.1** Gateway `sendDocument` (`uploadMedia` + `sendMedia`); se faltar no pacote, a mudança
      vai ao `adatechnology-packages`.
- [ ] **T6.2** Canal WhatsApp no envio ao motorista: telefone verificado, janela, modelo de Q5,
      queda para o app conforme Q4; status da Meta no retorno. Integração com o provider dublê.

## Fase 7 — Revisão e fechamento

> 🤖 Modelo: `sonnet`; T7.2 → `code-reviewer` `opus`

- [ ] **T7.1** Revisão de design e usabilidade com print em 375, 768 e 1280: selo na lista, detalhe
      com o botão, bloco na aba Tipos, conversa no app do motorista. Verificação por texto primeiro;
      tabela "elemento → esperado → tela real → veredito" em `evidence.md`. (Esta spec não tem
      `preview.html`; o bloco da aba Tipos segue o vocabulário do `preview.html` da 247 e é
      comparado com ele.)
- [ ] **T7.2** Passada independente de funcionalidade, usabilidade e design por `code-reviewer`
      (`opus`): registrar a prorrogação no app, responder ao e-mail com um PDF (Resend de teste ou
      dublê), ver o boleto chegar ao motorista, repetir com aprovação, sem anexo e com prazo vencido.
- [ ] **T7.3** `CLAUDE.md` da raiz, `apps/*/CLAUDE.md` tocados, `docs/ai-context/`, e o risco aceito
      do D6 em `docs/SECURITY.md`.
- [ ] **T7.4** Gates: `bun run typecheck`, `make check`, `make migration-test`, `make
worker-integration`, integração da API em primeiro plano com `--env-file`; depois de fetch +
      rebase + `bun install --frozen-lockfile`, `db:generate` = `no_changes`.
- [ ] **T7.5** `evidence.md` consolidado.

## Prompt de execução

**Não há.** A spec tem `[NEEDS CLARIFICATION]` aberto. Perguntas pendentes (detalhe, opções e
recomendação em `spec.md` § Dúvidas):

1. **Q1** Como a contratante devolve o boleto prorrogado — resposta ao mesmo e-mail com PDF anexo
   (recomendada), link no corpo, outro canal, ou não devolve?
2. **Q2** Em quanto tempo ela responde, e o que fazer quando não responde — 4 h e avisar o operador
   (recomendada), 2 h, 24 h, sem prazo; reenviar à contratante ou nada?
3. **Q3** O boleto vai ao motorista sozinho com exatamente um PDF (recomendada) ou sempre com o toque
   do operador? (valor do roteiro; o mecanismo é configurável)
4. **Q4** Canal ao motorista — app agora e WhatsApp quando os modelos da Meta forem aprovados
   (recomendada), só WhatsApp, ou WhatsApp na janela e app fora dela?
5. **Q5** O texto do modelo de WhatsApp a submeter à Meta (proposta na spec).
6. **Q6** O motorista mostra o boleto ou o repassa ao cliente pelo "Compartilhar" do aparelho
   (recomendada), ou o produto manda direto ao cliente (spec à parte)?

Respondidas, a sessão que fechar as perguntas registra as respostas em `spec.md`, tira os
marcadores e escreve aqui o prompt no formato do §4 do `model-economy.md`.
