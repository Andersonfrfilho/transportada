# Tasks

| Fase | Tasks   | Modelo                                                                   |
| ---- | ------- | ------------------------------------------------------------------------ |
| 1    | T1–T4   | `sonnet` (T1 e T2 são 🧠 — validar com `architect` em `opus`)            |
| 2    | T5–T8   | `sonnet`                                                                 |
| 3    | T9–T12  | `sonnet` (T9 é 🧠 — permissão nova e superfície externa)                 |
| 4    | T13–T15 | `sonnet` (T14 é 🧠 — roteiro e trava de despacho)                        |
| 5    | T16–T20 | `sonnet` (T16 é 🧠 — migration numa tabela financeira que já roda)       |
| 6    | T21–T26 | `sonnet`                                                                 |
| 7    | T27–T30 | `sonnet` (T30 fecha com `code-reviewer` e `security-reviewer` em `opus`) |

30 tasks. Uma por vez, na ordem. Teste de aceite/contrato **antes** da implementação. Cada task
fecha com typecheck + testes + commit isolado e evidência em `evidence.md`.

⚠️ **Os testes da API são dois comandos, e nenhum cobre o outro** (de dentro de
`apps/api-transportada`): `bun --env-file=../../.env.test test --timeout 120000` (contrato) e
`bun --env-file=../../.env.test run test:integration` (integração). Sem `--env-file` a integração
**pula** em vez de falhar. Arquivo de teste novo só roda se for somado à lista explícita do
`package.json`.

## Fase 1 — Modelo de dados e máquina

> 🤖 Modelo: `sonnet` — **T1 e T2 são 🧠**: a T1 cria três tabelas com FK composta e o CHECK que
> proíbe `unset` na tratativa; a T2 é a máquina de estados, que é o coração da feature. Validar as
> duas com `architect` em `opus` antes de escrever migration ou política.

- [x] **T1** 🧠 Coluna `redelivery_policy` em `company_occurrence_types` e as tabelas
      `trip_occurrence_cases`, `trip_occurrence_case_events` —
      `src/database/trip.schema.ts`, `database.schema.ts`, `drizzle/20260922174226_trip_occurrence_cases/`
      (`migration.sql`, `rollback.sql`, `snapshot.json`).
  - ⚠️ **Escopo alterado nesta task**: `trip_occurrence_item_settlements` saiu da T1 e foi para a T16
    (Fase 5), junto da migration de `delivery_charges` que ela alimenta — as duas mexem no mesmo
    dinheiro, e separá-las evita revisar acerto e cobrança na mesma migration.
  - Critério de aceite (CA1/RNF4): `bun run db:generate` devolve `no_changes` depois de aplicada;
    `test/database-migration/schema-snapshot.contract.ts` verde; `make migration-test` verde;
    rollback reverte com as tabelas vazias e recusa (`raise`) com linha presente; todo tipo
    existente fica `unset` e nenhuma suíte de ocorrência de hoje muda.

- [x] **T2** 🧠 A máquina — `trips/domain/occurrence-case-state.policy.ts`
      (`OCCURRENCE_CASE_STATUSES`, `OCCURRENCE_CASE_ACTIONS`, `checkOccurrenceCaseTransition`
      devolvendo `changed | unchanged | refused`, no molde de `checkDeliveryChargeTransition`) e
      `trips/domain/occurrence-case.policy.ts` (abertura a partir do tipo, `unset` não abre;
      `CONTRACTOR_VISIBLE_CASE_STATUSES`).
  - Critério de aceite (CA2): contrato **antes** do código — cada transição legal, cada ilegal com
    `OCCURRENCE_CASE_TRANSITION_NOT_ALLOWED`, idempotência de todas, e `returned_to_warehouse` e
    `closed` sem saída. O teste falha se alguém acrescentar aresta de volta.

- [x] **T3** Erros novos — `trips/domain/trip.error.ts`: `OccurrenceCaseNotFoundError` (404),
      `OccurrenceCaseTransitionNotAllowedError` (409), `OccurrenceCaseRedeliveryNotAllowedError`
      (422), `OccurrenceCaseSettlementWithoutItemsError` (422),
      `OccurrenceSettlementItemUnknownError` (422), `OccurrenceSettlementAmountInvalidError` (422).
  - Critério de aceite: contrato confere código estável, status e **ausência de PII** na mensagem.

- [x] **T4** Repositório e abertura na transação —
      `trips/infrastructure/drizzle-occurrence-case.repository.ts` (escritor único, `select … for no
key update` antes do `update`, compare-and-set por status, evento só quando mudou) e a abertura
      da tratativa dentro da transação de `register-trip-occurrence.use-case.ts` e
      `register-office-document-occurrences.use-case.ts`.
  - Critério de aceite (RF3/RNF1): tipo `unset` não abre tratativa e o fluxo de hoje fica idêntico;
    tipo `allowed`/`blocked` abre em `recorded` com o evento de abertura; `tenant-safety.contract.ts`
    atualizado com as três tabelas.

## Fase 2 — As quatro transições internas

> 🤖 Modelo: `sonnet`

- [x] **T5** `trips/application/occurrence-case.use-case.ts` + `occurrence-case.port.ts` — as quatro
      ações (`review`, `warehouse_return`, `contractor_submission`, `closure`), com a recusa da RF7.
  - Critério de aceite (RF5–RF9): contrato a partir do **caso de uso**, com dublê de repositório —
    o dublê não é chamado quando a política recusa.

- [x] **T6** Permissão `occurrences.resolve` — `identity/domain/authorization.policy.ts`
      (`company-admin`, `operator`, `finance`; **nunca** `separator`, `driver`, `aggregate`).
  - Critério de aceite (CA11/D7): contrato de papéis verde; `test/separator-role.contract.test.ts`
    continua verde e **sem** rota nova listada.

- [x] **T7** Rotas internas — `trips/presentation/occurrence-case.routes.ts` e
      `occurrence-case.schema.ts` (Zod `.strict()`), fiação em `src/main.ts`, `rateLimit` no
      Postgres declarado em cada uma. **Cinco rotas, não quatro**: RF5–RF8 mais RF8b (`cancel`) — a
      spec original não previa rota para o estado terminal `cancelled` que a T2 já tinha criado
      ("ocorrência aberta por engano"); a lacuna era da spec, e esta task a fecha.
  - Critério de aceite (RNF3): as cinco rotas listadas em
    `test/rate-limited-routes.contract.test.ts`; ocorrência de outra empresa é 404; corrida perdida
    é 409.

- [x] **T8** O feed enxerga a tratativa — `trips/infrastructure/trip-occurrence-feed.query.ts`
      (`left join`), `trip-occurrence-feed.use-case.ts`, `trip-occurrence-feed.schema.ts`.
  - Critério de aceite (RF10/RF11): ocorrência sem tratativa devolve `case: null`; o filtro por
    estado inclui "sem tratativa"; o cursor do feed fica inalterado.

## Fase 3 — O contratante decide

> 🤖 Modelo: `sonnet` — **T9 é 🧠**: permissão nova numa superfície externa, com a fronteira de
> visibilidade dentro do SQL. Validar com `architect` em `opus` e fechar com `security-reviewer`.

- [x] **T9** 🧠 Permissão `occurrences.decide` (papel `contractor`, nenhum papel interno) e a
      consulta do portal — `contractor-portal/infrastructure/contractor-occurrence.query.ts`,
      projeção enumerada campo a campo, `inner join` com a tratativa filtrada por
      `CONTRACTOR_VISIBLE_CASE_STATUSES`, sobre o `ContractorScope` que já existe.
  - Critério de aceite (CA3/CA4/D5): contrato **negativo** — `recorded`, `under_review` e
    `returned_to_warehouse` não aparecem na consulta; contratante de outra empresa não alcança nada;
    nenhuma coluna fora da projeção escrita à mão; nenhum `select *`.

- [x] **T10** `decide-occurrence-case.use-case.ts` e
      `contractor-portal/presentation/contractor-occurrence.routes.ts` —
      `GET /client/me/occurrences` (`deliveries.track`) e
      `POST /client/me/occurrences/:id/decision` (`occurrences.decide`), com
      `requireOccurrenceInScope` **antes** de qualquer leitura (molde de `requireBatchInScope`).
  - Critério de aceite (RF13–RF16): fora de escopo é **404**, nunca 403; `redelivery_authorized`
    sobre tratativa `blocked` é 422; decisão repetida converge, decisão diferente sobre `decided` é
    409; a trilha grava o `userId` do contratante.

- [x] **T11** Foto da ocorrência no portal — reuso de
      `trips/application/occurrence-attachment.service.ts` e do gateway de presigned de 5 min.
  - Critério de aceite: URL assinada na leitura de detalhe; **sem** `objectKey` e **sem** `bucket` na
    resposta; anexo vencido (retenção de 5 anos, spec 161) sai com selo e sem URL.

- [x] **T12** Integração contra Postgres —
      `test/integration/trip-occurrence-case.integration.ts`, **somado ao script `test:integration`
      do `package.json`**.
  - Critério de aceite (CA10): a máquina inteira sobre as mesmas linhas, as duas consultas (feed
    interno e portal), o isolamento por empresa e a corrida das duas abas. `explain` das consultas
    novas registrado na evidência (RNF5).

## Fase 4 — O que muda na nota, no roteiro e no acerto

> 🤖 Modelo: `sonnet` — **T14 é 🧠**: mexe na porta de não-retorno do despacho, que é a invariante
> mais cara da viagem (ADR-0043). Validar com `architect` em `opus` antes de escrever.

- [x] **T13** _(movida para a Fase 5, depois da T16)_ Acerto por item, com o pagador — `trips/domain/occurrence-settlement.policy.ts` (soma
      com `Decimal`, validação de item, valor e do par `(payer_kind, payer_id)`),
      `record-occurrence-settlement.use-case.ts`, `PUT /trip-occurrences/:id/case/settlement`.
  - Critério de aceite (CA9/CA9b/RF22–RF24): `numeric(14,4)` do banco à resposta, nunca float; a
    lista substitui e não acumula, numa transação; item fora da ocorrência é 422; valor `<= 0` é
    422; `driver` sem `payer_id` e qualquer outro **com** `payer_id` são 422
    `OCCURRENCE_SETTLEMENT_PAYER_INVALID`, e o CHECK do banco reprova a linha mesmo se o caso de uso
    deixar passar; ocorrência sem item recusa `goods_paid` com
    `OCCURRENCE_CASE_SETTLEMENT_WITHOUT_ITEMS`.
  - ⚠️ **Não escreve em `delivery_charges` nesta task** — a ponte é a T17, e separá-las é o que
    permite provar o acerto sozinho antes de ligar o dinheiro.
  - ⚠️ **Executar na Fase 5, logo depois da T16**: a tabela `trip_occurrence_item_settlements` nasce
    lá, junto da migration de `delivery_charges` (decisão da validação 🧠 da T1 — acerto e cobrança
    são o mesmo dinheiro e não se revisam em migrations separadas). Implementá-la antes seria pular
    essa revisão ou fechar a task sem prova contra Postgres.
  - A seleção de **vários itens** por ocorrência, de que esta task depende, já está commitada e no
    ar (`drizzle/20260922164534_trip_document_occurrence_products/`).

- [x] **T14a** A proposta de reentrega, só leitura — `trips/domain/redelivery-proposal.policy.ts`
      (pura) e `redelivery-proposal.use-case.ts`, servindo
      `GET /trip-occurrences/:id/case/redelivery-proposal`.
  - Critério de aceite (CA6/CA7/CA8/RF17): viagem `dispatched` devolve `refused` com o motivo do
    próprio domínio (`TripTransitionBlock`, nunca vocabulário novo) e `trip_stops` fica **intocada**,
    provado por leitura da tabela; parada com uma nota só devolve `reorder_stop` **com a ordem
    completa proposta** (`orderedStopIds`, porque a rota de reordenação recusa lista parcial); parada
    com outras notas vivas (`released_at is null`, sem contar a própria nota) devolve
    `release_document`; nota liberada, viagem cancelada **e nota sem parada** (`stop_id is null`, o
    balde sem endereço) devolvem `refused` com motivo próprio.

- [x] **T14b** 🧠 Aplicar a proposta é transação do servidor —
      `POST /trip-occurrences/:id/case/redelivery-application` (`occurrences.resolve`), mais a
      migration de `redelivery_applied_at`/`redelivery_applied_by_user_id` e o CHECK que amarra
      `redelivery_application` a `decision_kind = 'redelivery_authorized'`.
  - Critério de aceite (RF18/RF19): trava `trips` com `for no key update` e reroda
    `checkTripAcceptsLinkage` **sobre a linha travada** (fecha o TOCTOU de
    `readStopOrderPreconditions`, que hoje lê o status fora da transação que escreve); executa a
    reordenação ou a liberação e grava a aplicação por compare-and-set
    (`where redelivery_application is null`), com 409 na corrida perdida; despachar a viagem **entre**
    o `GET` e o `POST` deixa `trip_stops` intocada e grava `refused` — provado por integração.
  - ⚠️ `redeliveryApplication` **sai** do input de transição da tratativa: hoje ele viaja na mesma
    chamada que o contratante dispara, e uma linha por distração faria a decisão do cliente escrever
    roteiro. Contrato negativo prova que nenhum caminho do portal alcança `trip_stops`/`trip_documents`.
  - ⚠️ Ordem de lock fixada e escrita no cabeçalho: **`trips` primeiro, tratativa depois** — inverter
    dá deadlock contra o despacho, que aparece como 500 esporádico em produção, nunca em teste.
  - ⚠️ `release_document` **não** é "vai para o fim do roteiro": a nota sai da viagem e volta para o
    pool (`released_at` + `stop_id = null`, e a parada some se esvaziar). O texto da tela diz isso.

- [x] **T15** O marcador derivado — `readTripDetail` e a listagem devolvem
      `openOccurrenceCase` por nota e `hasOpenOccurrence` por parada, derivados na leitura.
  - Critério de aceite (CA5/RF20/RF21): contrato de regressão prova que
    `GET /trips/:id/allowed-actions` fica **idêntico** com tratativa aberta — o teste falha se
    alguma ação sumir; nenhuma escrita em `trip_documents.separation_status`.

## Fase 5 — Cobrança, acúmulo mensal e demonstrativo

> 🤖 Modelo: `sonnet` — **T16 é 🧠**: a migration mexe em `delivery_charges`, que já serve o repasse
> de taxa em produção, e recria um CHECK que existe em **duas** tabelas. Validar com `architect` em
> `opus` antes de escrever o SQL.

- [x] **T16** 🧠 `charge_type` `returned_goods` e a coluna `occurrence_id` em `delivery_charges`, **e**
      a tabela `trip_occurrence_item_settlements` (movida da T1: o item do acerto e a cobrança que
      ele alimenta mexem no mesmo dinheiro e fecham juntas) — `DELIVERY_CHARGE_TYPES` em
      `src/database/delivery-client.schema.ts`, FK composta, índice parcial, os **dois** CHECKs
      ampliados (`delivery_charges` e `delivery_client_charge_rules`), e
      `drizzle/<ts>_delivery_charges_occurrence/` com `migration.sql`, `rollback.sql` e
      `snapshot.json`.
  - Critério de aceite (RF26/RNF4): `db:generate` devolve `no_changes`; `make migration-test` verde;
    nenhuma linha existente de `delivery_charges` muda; contrato prova que a **regra recorrente**
    (`delivery_client_charge_rules` / `suggest-delivery-charges.use-case.ts`) **não** propõe
    `returned_goods` — mercadoria devolvida não é taxa que se repete, e o teste falha se ele voltar
    à lista de sugestão.

- [x] **T17** A ponte acerto → cobrança — `trips/domain/occurrence-charge.policy.ts` (status inicial
      `recorded`, imutabilidade a partir de `submitted`) e a escrita na **mesma transação** do
      `PUT .../settlement`.
  - Critério de aceite (CA9c/RF25): grava **uma** linha com `origin: 'occurrence'`,
    `charge_type: 'returned_goods'`, `occurrence_id` preenchido e `amount` = soma dos itens em
    `Decimal`; regravar atualiza a mesma linha enquanto `recorded`; linha `submitted` ou além recusa
    com 409 `DELIVERY_CHARGE_TRANSITION_NOT_ALLOWED` e o valor **não** muda — provado por leitura da
    tabela, não por ausência de erro.
  - ⚠️ **T13 ficou fora desta rodada (instrução explícita)**: a política e o repositório
    (`DrizzleOccurrenceSettlementChargeRepository`) estão prontos e provados direto contra Postgres
    (`test/integration/occurrence-settlement-charge-bridge.integration.ts`, sem HTTP), mas
    `PUT /trip-occurrences/:id/case/settlement` ainda não existe — quando a T13 for feita, ela chama
    `bridge.applyOccurrenceSettlementCharge({ ..., transaction })` de dentro da própria transação,
    depois de somar os itens com `Decimal`. `amount` chega pronto por parâmetro; a soma em si é da
    T13. Ver `evidence.md`.

- [x] **T18** Ressarcimento de quem pagou —
      `POST /trip-occurrences/:id/case/settlement/reimbursement` (`occurrences.resolve`).
  - Critério de aceite (CA9e/RF31): idempotente; `payer_kind = 'carrier'` recusa com 422
    `OCCURRENCE_SETTLEMENT_NOT_REIMBURSABLE`; escreve **só** `reimbursed_at` e
    `reimbursed_by_user_id`; nenhum movimento de dinheiro é simulado.

- [x] **T19** Relatório mensal — `delivery-clients/application/occurrence-charge-report.use-case.ts`
      e `GET /occurrence-charges/report` (`trip.financials`), por contratante e período, com quebra
      por `charge_type` e o estado de cada cobrança.
  - Critério de aceite (RF27/RF28/RNF5): o lote do período é o `extra_charge_batches` que já existe —
    **nenhuma tabela de lote nova**; total conferido com `Decimal`; `explain` das consultas na
    evidência; isolamento por empresa exercitado.

- [x] **T20** O demonstrativo em PDF —
      `delivery-clients/domain/occurrence-statement-layout.policy.ts` (puro, molde de
      `billing/domain/invoice-layout.policy.ts`),
      `delivery-clients/infrastructure/occurrence-statement-pdf.gateway.ts` (`pdfkit`, só desenho) e
      `GET /extra-charge-batches/:id/statement` (`trip.financials`).
  - Critério de aceite (CA9d/RF29/RF30): o PDF leva notas, produtos, valores, total e **fotos**; uma
    foto por linha no corpo (a de `position: 1`, preferindo a miniatura) e as demais por contagem;
    foto vencida vira selo textual, nunca imagem quebrada; a frase de que **não é documento fiscal**
    está dentro do documento; um lote de 50 linhas fica abaixo do teto de tamanho declarado na
    política, e o teste falha acima dele; **nenhuma dependência nova**.
  - ⚠️ A rota é autenticada. O token público de `extra_charge_batches` abre o lote, **não** o
    demonstrativo com evidência — contrato negativo obrigatório.

## Fase 6 — As telas

> 🤖 Modelo: `sonnet`

- [x] **T21** Cadastro do tipo — `modules/company-settings/components/OccurrenceTypeCatalogPanel.component.tsx`
      e o hook, com a escolha de `redelivery_policy` em três opções e o texto que explica o que
      `unset` faz.
  - ⚠️ **Precondição (correção do `architect` na T1)**: `SaveOccurrenceTypeValues` é conjunto
    **completo**, não patch — o `PUT /company-settings/occurrence-types` de hoje reescreve o tipo
    inteiro a cada chamada. Salvar sem o campo `redeliveryPolicy` **não pode** devolver o tipo para
    `unset`; é um modo de falha silencioso (a tela apaga a escolha de reentrega sem avisar) e precisa
    de contrato próprio antes de tocar no caso de uso.
  - Critério de aceite (RF1/Risco 1): `PUT` sem o campo não altera o valor; a tela deixa evidente
    que tipo `unset` não abre tratativa. Primitivos do design system obrigatórios.

- [x] **T22** Painel de tratativa na página `/ocorrencias` — `OccurrenceCasePanel.component.tsx`,
      `TripOccurrenceTable`, `TripOccurrenceFilters`, `TripOccurrenceColumnsMenu`,
      `useTripOccurrenceTable.hook.ts`, `tripOccurrenceFeed.query.ts`, `trip.types.ts`,
      `tripResponse.validation.ts`.
  - Critério de aceite (RF33): o passo atual, só os botões que o estado **e** a permissão permitem,
    o histórico de eventos, e o filtro por estado com "sem tratativa". `case: null` não quebra a
    tela.
  - ⚠️ Inclui as duas ações que nasceram de decisão do usuário depois da spec: **cancelar** a
    tratativa aberta por engano (só antes de ir ao contratante, com motivo obrigatório, e o
    marcador de problema some da nota) e **decidir no lugar do contratante** que não responde,
    com a tela deixando claro que a decisão será registrada como da transportadora, não do cliente.

- [x] **T23** Painel de acerto — `OccurrenceSettlementPanel.component.tsx`, valor proposto editável,
      origem visível, **seletor de pagador** (motorista, transportadora, contratante, seguradora —
      motorista é o padrão e o único que pede escolher quem), marca de ressarcido, total em pt-BR.
  - Critério de aceite (RF34): nenhum cálculo de dinheiro em float no cliente; o total da tela bate
    com o do servidor; item sem valor não é enviado; escolher "transportadora" esconde o botão de
    ressarcimento em vez de oferecê-lo para dar 422.

- [x] **T24** Listagem e mapa — marcador na nota (`TripStopList.component.tsx`) e ícone de problema
      na parada (`TripRouteMap` + `AssemblyVectorMap`), sobre a cor de `stopColorOf`.
  - Critério de aceite (CA5/RF36/RF37): contrato prova que **nenhuma** ação da linha some ou
    desabilita por causa da tratativa; o ícone acrescenta à cor, não a substitui; parada sem
    coordenada não quebra o mapa.

- [x] **T25** Portal do contratante — `apps/frontend-client/src/modules/occurrences/OccurrenceList.page.tsx`
      e `DecisionForm.component.tsx`, no molde de `modules/charges/ChargeBatchList.page.tsx`; textos
      em `trip.locale.json` e `trip.en.locale.json` para o painel.
  - Critério de aceite (RF35/RF38): três botões de decisão, motivo obrigatório em "outra solução",
    foto e itens visíveis; `locale-accents.contract.ts` verde; sem design system e sem dependência
    nova na app do portal.

- [x] **T26** Página "Ressarcimentos" — acumulado por contratante e mês, quebra por tipo de cobrança,
      lista das ocorrências com miniatura, e o botão que baixa o demonstrativo da T20.
  - Critério de aceite (RF32): permissão `trip.financials` (quem valida ocorrência não vê valor por
    carona); dinheiro formatado em pt-BR e **nenhum** cálculo em float no cliente; o total da tela
    bate com o do servidor; período sem cobrança mostra estado vazio próprio, não erro.
    Primitivos do design system obrigatórios.

## Fase 7 — Prova e revisão

> 🤖 Modelo: `sonnet` (a revisão final vai para `code-reviewer` **e** `security-reviewer` em `opus`,
> em passes separados — nunca autoaprovação no mesmo contexto)

- [x] **T27** Integração do dinheiro contra Postgres —
      `test/integration/occurrence-charge.integration.ts`, **somado ao script `test:integration` do
      `package.json`**: acerto → cobrança → lote do período → demonstrativo, sobre as mesmas linhas.
  - Critério de aceite (CA9c/CA9d): a cobrança nasce e converge; a regravação sobre linha submetida
    é recusada e o valor não muda; o lote soma o que deve somar; e, depois de gerar o PDF, uma
    leitura de `billing_*`, `cte_*`, `nfse_*` e `fiscal_sequences` prova que **nada** foi tocado.

- [x] **T28** Smoke e prints — `test/spec-164-prints.smoke.spec.ts`, molde de
      `test/spec-161-prints.smoke.spec.ts`.
  - Critério de aceite (CA13): PNGs em `specs/164-destino-da-nota-na-ocorrencia/prints/` — página de
    ocorrências com a tratativa em cada estado, painel de acerto com o seletor de pagador, página
    "Ressarcimentos" com o acumulado do mês, e o portal decidindo, em 390×844 e 1440×900, claro e
    escuro. O demonstrativo em PDF entra como página renderizada, com foto sintética, **nunca** com
    dado real de cliente.

- [x] **T29** `docs/SECURITY.md` e contexto da I.A. — entrada datada no formato do arquivo (`Onde`,
      `O que é`, `Corrigido`/`O que continua aberto`, `Origem`) sobre a superfície externa nova e as
      duas permissões, **e o segundo motivo da retenção de cinco anos das fotos** (spec 161 D9: a
      foto passou a ser anexo de uma cobrança, e reduzir o prazo passa a exigir a pergunta do
      demonstrativo contestado); atualizar `apps/api-transportada/CLAUDE.md` e
      `docs/ai-context/api-transportada.md` (regra 14 do code-standart).
  - Critério de aceite (CA12): nenhum achado antigo apagado; `grep` provando que nenhum log carrega
    observação, valor, nome ou documento.

- [x] **T30** Revisão de design e usabilidade (`web.md` §15) + revisão final — comparar o painel de
      tratativa e o de acerto com os vizinhos da mesma tela, conferir contraste, e percorrer o
      caminho no telefone: validar, devolver ao barracão, enviar ao contratante, decidir no portal,
      registrar acerto com pagador, marcar ressarcimento, fechar o mês e baixar o demonstrativo.
  - Critério de aceite: print de cada estado no `evidence.md` com a leitura escrita da revisão;
    `make check` verde; os **dois** comandos de teste da API verdes; `make migration-test` verde;
    revisão por `code-reviewer` **e** `security-reviewer` em `opus`, em passes separados.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/164-destino-da-nota-na-ocorrencia/ (leia spec.md,
plan.md e tasks.md antes de começar). 30 tasks em 7 fases, uma por vez, na ordem do tasks.md, teste
de aceite/contrato antes da implementação.
Modelos: Fase 1 → executor model=sonnet, T1 e T2 🧠 validadas por architect model=opus antes da
migration e da máquina · Fase 2 → executor model=sonnet · Fase 3 → executor model=sonnet, T9 🧠
validada por architect model=opus (permissão nova em superfície externa) · Fase 4 → executor
model=sonnet, T14 🧠 validada por architect model=opus (mexe na porta de não-retorno do despacho) ·
Fase 5 → executor model=sonnet, T16 🧠 validada por architect model=opus (migration em
delivery_charges, que já roda em produção, com CHECK em duas tabelas) · Fase 6 → executor
model=sonnet · Fase 7 → executor model=sonnet e revisão final por code-reviewer model=opus E
security-reviewer model=opus, em passes separados, sem autoaprovação.
Cada task fecha com typecheck + testes + commit isolado, evidência em evidence.md. Testes da API são
dois comandos: `bun --env-file=../../.env.test test --timeout 120000` (contrato) e
`bun --env-file=../../.env.test run test:integration` (integração) — sem a flag a integração pula, e
arquivo novo só roda se for somado à lista explícita do package.json. As duas migrations exigem
`make migration-test`.
Invariantes que nenhuma task pode quebrar: a ocorrência continua append-only e a nota NÃO é presa
(GET /trips/:id/allowed-actions fica idêntico com tratativa aberta — há contrato de regressão);
tratativa recorded/under_review/returned_to_warehouse NUNCA alcança o portal, e o filtro é inner
join no SQL, não condicional de tela; dinheiro é numeric/Decimal do banco à tela; o demonstrativo
NÃO é CT-e nem NFS-e e nada pode ser escrito em billing_*, cte_*, nfse_* ou fiscal_sequences.
A seleção de vários itens por ocorrência (`productCodes`) já está commitada e em staging desde
2026-09-22 — T13 lê esse formato, não o `productCode` sozinho.
Pare e pergunte antes de: deploy, migration destrutiva, e antes de qualquer mudança que faça a
ocorrência escrever em trip_documents.separation_status.
```

A spec não tem `[NEEDS CLARIFICATION]` aberto.
