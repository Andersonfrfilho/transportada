# Plano técnico

## Contexto e premissas

Conferido no código antes de escrever este plano (worktree
`/Users/anderson.filho/Documents/personal/transportada/.claude/worktrees/kind-wescoff-9a54a8`):

- **A ocorrência da nota não tem estado, e isso é decisão registrada.**
  `apps/api-transportada/src/database/trip.schema.ts:1417-1427` — append-only, "só anota", e o
  comentário diz que a tela de resolução, quando existir, é decisão nova por escrito. É esta spec.
- **`company_occurrence_types`** (`trip.schema.ts:1679`) tem hoje `name`, `stage`, `notifies`,
  `active`, `email_subject`, `email_body`, `email_template_key`, `emails_contractor`. Unique
  `(company_id, id)` já existe — pré-requisito das FKs compostas das tabelas novas.
  ⚠️ **Em staging e produção a tabela nasce vazia** e é preenchida uma única vez por
  `seedOccurrenceTypeCatalog` (`database/occurrence-type-catalog-seed.service.ts`), que **não é
  sincronização**: empresa com qualquer tipo cadastrado fica intocada para sempre. A coluna nova não
  pode depender do seed para existir com valor — o default do banco é quem garante.
- **`emails_contractor` não tem leitor.** `send-occurrence-mail.use-case.ts` não existe em lugar
  nenhum; a T015 da spec 143 segue `- [ ]`. O que existe é aviso **interno**
  (`occurrence-notifier.gateway.ts`), cujo destinatário é o `actor_userId` do último
  `trip_dispatch_snapshots` — ou seja, **viagem ainda não despachada não avisa ninguém**, que é
  justamente o caso da ocorrência de galpão.
- **Itens da ocorrência**: `trip_document_occurrence_products` (`trip.schema.ts:1624`) existe, com
  `position` e uniques por `(company_id, occurrence_id, product_code)`. A leitura deriva de lá ou da
  coluna `product_code` por `resolveOccurrenceProductCodes`
  (`trips/domain/occurrence-scope.policy.ts`). O frontend ainda manda **um** `productCode`.
- **Anexos**: `trip_document_occurrence_attachments` (spec 161), teto 5, `thumbnail_object_id`
  opcional, leitura unificada em `trips/application/occurrence-attachment.service.ts`.
- **Roteiro**: ordem é `trip_stops.sequence` (bigint, unique `(company_id, trip_id, sequence)`,
  CHECK `>= 1`), reordenação em `trips/application/reorder-trip-stops.use-case.ts` pela rota
  `PATCH /trips/:id/stops/order` com `trip.manage`, guardada por `checkTripAcceptsLinkage`
  (`trips/domain/trip-state.policy.ts`). Despacho congela em `trip_dispatch_snapshots`
  (unique `(company_id, trip_id)`).
- **Liberar nota é marcar `released_at`**, nunca apagar o vínculo (spec 102), e toda consulta de
  "nota disponível" filtra por `released_at` (`buildActiveTripLinkFilters`).
- **Portal**: `contractor-portal/`, rotas `/client-deliveries*` e `/client-extra-charge-batches*`,
  permissões `deliveries.track` e `charges.decide` (`identity/domain/authorization.policy.ts:91,93`,
  papel `contractor` na linha 233). O recorte sai de `ContractorScope`
  (`contractor-portal/domain/contractor-scope.policy.ts`) e é aplicado **na query**, com `inner join
nfe_participants` por `taxId`. A app é `apps/frontend-client`, com três páginas e nenhuma menção a
  ocorrência.
- **Precedente de decisão externa com dinheiro**: `delivery-charge-state.policy.ts`
  (`suggested → recorded → submitted → approved → reimbursed`, com `checkDeliveryChargeTransition`
  devolvendo `changed | unchanged | refused`) e `contractor-extra-charges.use-case.ts`
  (`requireBatchInScope` **antes** de qualquer leitura). A máquina desta spec copia a forma.
- **O trilho de repasse está inteiro e é reusável.** `delivery_charges`
  (`database/delivery-client.schema.ts:366`) tem `amount numeric(14,4)`, `origin` com o valor
  `'occurrence'` **já existente**, `trip_id`, `trip_document_id`, `batch_id`, `proof_object_id`,
  `rejection_reason`, e a máquina em `delivery-charge-state.policy.ts`.
  `extra_charge_batches` (l.523) é "do contratante e do período, nunca da viagem" (ADR-0048 §7), com
  `period_start`/`period_end`, `total_amount numeric(14,4)`, `status`, token da página pública e as
  rotas de decisão do portal já escritas. `delivery_charge_events` guarda a trilha append-only.
  **O que falta para a mercadoria devolvida é só isto**: um `charge_type` (`returned_goods` — a lista
  de hoje é de taxa de entrega) e uma coluna `occurrence_id` nulável, que é o que liga a cobrança à
  foto e ao item.
- **`billing_invoices` não serve, e não é preferência**: `billing_invoice_items.cte_document_id` é
  `not null` (`database/billing.schema.ts:124`) — toda linha daquela fatura **é** um CT-e. O
  demonstrativo de ressarcimento não cabe ali sem afrouxar a invariante do faturamento do frete.
- **O PDF já tem molde e dependência**: `pdfkit` está no `package.json` da API, e
  `billing/infrastructure/invoice-pdf.gateway.ts` desenha sobre
  `billing/domain/invoice-layout.policy.ts` — layout como política pura e testável, gateway que só
  desenha. O demonstrativo copia essa separação; **nenhuma dependência nova**.
- **Precedente de histórico de estado**: `trip_status_events` (ADR-0068) — escritor único,
  `select … for no key update` imediatamente antes do `update`, compare-and-set, evento só quando
  mudou, contrato estático que reprova escritor novo sem evento.

## Arquitetura e arquivos afetados

**Banco (API)**

- `src/database/trip.schema.ts`: coluna `redelivery_policy` em `companyOccurrenceTypes`; tabelas
  `tripOccurrenceCases`, `tripOccurrenceCaseEvents`.
- `src/database/database.schema.ts`: agrega as duas tabelas.
- `drizzle/20260922174226_trip_occurrence_cases/` com `migration.sql`, `rollback.sql`, `snapshot.json`.

⚠️ **Escopo alterado na execução da T1**: `tripOccurrenceItemSettlements` saiu desta task e foi para
a T16 (Fase 5), junto da migration que amplia `delivery_charges` — o item do acerto e a cobrança que
ele alimenta mexem no mesmo dinheiro, e a T1 fecha só com as duas tabelas de máquina de estados.

**API — domínio**

- `trips/domain/occurrence-case-state.policy.ts` — a máquina (`OCCURRENCE_CASE_STATUSES`,
  `OCCURRENCE_CASE_ACTIONS`, `checkOccurrenceCaseTransition`), pura, sem I/O.
- `trips/domain/occurrence-case.policy.ts` — abertura a partir do tipo (`unset` não abre),
  visibilidade externa (`CONTRACTOR_VISIBLE_CASE_STATUSES`), regras da decisão.
- `trips/domain/occurrence-settlement.policy.ts` — soma com `Decimal`, validação de item e valor.
- `trips/domain/redelivery-proposal.policy.ts` — decide `reorder_stop | release_document | refused`
  a partir de `{ tripStatus, stopDocumentCount, documentReleased }`. Pura: quem lê o banco é o caso
  de uso; quem decide é isto.
- `trips/domain/occurrence-charge.policy.ts` — a ponte para `delivery_charges` (tipo, status
  inicial `recorded`, imutabilidade a partir de `submitted`).
- `trips/domain/trip.error.ts` — erros novos.

**API — aplicação**

- `delivery-clients/domain/occurrence-statement-layout.policy.ts` — o layout do demonstrativo, puro,
  no molde de `invoice-layout.policy.ts`.
- `delivery-clients/infrastructure/occurrence-statement-pdf.gateway.ts` — `pdfkit`, só desenho.
- `delivery-clients/application/occurrence-charge-report.use-case.ts` — o relatório mensal.
- `trips/application/occurrence-case.use-case.ts` (as quatro transições internas),
  `trips/application/decide-occurrence-case.use-case.ts` (a do contratante),
  `trips/application/record-occurrence-settlement.use-case.ts`,
  `trips/application/redelivery-proposal.use-case.ts`,
  `trips/application/occurrence-case.port.ts`.
- `register-trip-occurrence.use-case.ts` e `register-office-document-occurrences.use-case.ts`:
  abrem a tratativa **dentro da transação** que já existe.

**API — infraestrutura**

- `trips/infrastructure/drizzle-occurrence-case.repository.ts` (escritor único de
  `trip_occurrence_cases` + `trip_occurrence_case_events`, com o lock e o compare-and-set).
- `trips/infrastructure/trip-occurrence-feed.query.ts`: `left join` com a tratativa.
- `contractor-portal/infrastructure/contractor-occurrence.query.ts`: projeção enumerada, `inner
join` com a tratativa filtrada por `CONTRACTOR_VISIBLE_CASE_STATUSES`.

**API — apresentação**

- `trips/presentation/occurrence-case.routes.ts` + `occurrence-case.schema.ts`.
- `contractor-portal/presentation/contractor-occurrence.routes.ts` + schema.
- `shared/api.constant.ts`: `API_CLIENT_OCCURRENCES_PATH = '/client/me/occurrences'` no molde de
  `API_CLIENT_DELIVERIES_PATH`.
- `identity/domain/authorization.policy.ts`: `occurrences.resolve` e `occurrences.decide`, com os
  papéis.

**Frontend (painel)**

- `modules/trip/components/TripOccurrenceTable.component.tsx`,
  `TripOccurrenceFilters.component.tsx`, `TripOccurrenceColumnsMenu.component.tsx`,
  `hooks/useTripOccurrenceTable.hook.ts`, `queries/tripOccurrenceFeed.query.ts`,
  `shared/tripOccurrenceFeed.service.ts`.
- Componentes novos: `OccurrenceCasePanel.component.tsx`, `OccurrenceSettlementPanel.component.tsx`.
- `components/TripStopList.component.tsx` (marcador, sem tocar no gating),
  `components/AssemblyVectorMap.component.tsx` + `TripRouteMap.component.tsx` (ícone),
  `shared/trip.types.ts`, `shared/tripResponse.validation.ts`, os dois `*.locale.json`.

**Frontend (portal)**

- `apps/frontend-client/src/modules/occurrences/OccurrenceList.page.tsx` e
  `DecisionForm.component.tsx`, no molde de `modules/charges/ChargeBatchList.page.tsx` — CSS próprio,
  campos nativos, sem design system.

## Contratos/API/eventos

| rota                                                  | método | permissão             | resposta                         |
| ----------------------------------------------------- | ------ | --------------------- | -------------------------------- |
| `/trip-occurrences/:id/case/review`                   | POST   | `occurrences.resolve` | `200 { data: case }`             |
| `/trip-occurrences/:id/case/warehouse-return`         | POST   | `occurrences.resolve` | `200`                            |
| `/trip-occurrences/:id/case/contractor-submission`    | POST   | `occurrences.resolve` | `200`                            |
| `/trip-occurrences/:id/case/closure`                  | POST   | `occurrences.resolve` | `200`                            |
| `/trip-occurrences/:id/case/redelivery-proposal`      | GET    | `occurrences.resolve` | `200 { data: proposal }`         |
| `/trip-occurrences/:id/case/settlement`               | PUT    | `occurrences.resolve` | `200 { data: { items, total } }` |
| `/trip-occurrences/:id/case/settlement/reimbursement` | POST   | `occurrences.resolve` | `200`                            |
| `/occurrence-charges/report`                          | GET    | `trip.financials`     | `200 { data: [...], page }`      |
| `/extra-charge-batches/:id/statement`                 | GET    | `trip.financials`     | `200 application/pdf`            |
| `/client/me/occurrences`                              | GET    | `deliveries.track`    | `200 { data: [...], page }`      |
| `/client/me/occurrences/:id/decision`                 | POST   | `occurrences.decide`  | `200 { data: case }`             |

Erros (todos com `code` estável, sem PII na mensagem):
`OCCURRENCE_CASE_NOT_FOUND` (404), `OCCURRENCE_CASE_TRANSITION_NOT_ALLOWED` (409),
`OCCURRENCE_CASE_REDELIVERY_NOT_ALLOWED` (422),
`OCCURRENCE_CASE_REDELIVERY_BLOCKED_HAS_NO_QUESTION` (422),
`OCCURRENCE_CASE_SETTLEMENT_WITHOUT_ITEMS` (422), `OCCURRENCE_SETTLEMENT_ITEM_UNKNOWN` (422),
`OCCURRENCE_SETTLEMENT_AMOUNT_INVALID` (422), `OCCURRENCE_SETTLEMENT_PAYER_INVALID` (422),
`OCCURRENCE_SETTLEMENT_NOT_REIMBURSABLE` (422, `payer_kind = 'carrier'`). A regravação sobre
cobrança já submetida reusa `DELIVERY_CHARGE_TRANSITION_NOT_ALLOWED` (409) — erro novo para a mesma
regra seria uma segunda verdade.

Nenhum evento de fila novo. O aviso interno existente (`occurrence-notifier.gateway.ts`) **não é
alterado** nesta spec.

## Dados, migration e rollback

⚠️ **O modelo abaixo é o que foi implementado na T1, depois da revisão do `architect` (`opus`)** —
difere do primeiro rascunho em oito pontos, listados após o SQL.

```sql
alter table company_occurrence_types
  add column redelivery_policy text not null default 'unset';
alter table company_occurrence_types
  add constraint company_occurrence_types_redelivery_policy_check
  check (redelivery_policy in ('unset','allowed','blocked'));

create table trip_occurrence_cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  occurrence_id uuid not null,
  status text not null, -- sem default: ver correção 5
  redelivery_policy text not null,
  decision_kind text,
  decision_note text not null default '',
  decided_by_user_id uuid,
  decided_at timestamptz,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz, -- ver correção 7: era closed_at
  updated_at timestamptz not null default now(),
  constraint trip_occurrence_cases_company_id_id_unique unique (company_id, id),
  constraint trip_occurrence_cases_occurrence_unique unique (company_id, occurrence_id),
  constraint trip_occurrence_cases_company_id_companies_id_fk foreign key (company_id)
    references companies (id) on delete restrict on update cascade,
  constraint trip_occurrence_cases_company_occurrence_fk foreign key (company_id, occurrence_id)
    references trip_document_occurrences (company_id, id) on delete cascade on update cascade,
  constraint trip_occurrence_cases_status_check check (status in
    ('recorded','under_review','returned_to_warehouse','awaiting_contractor','decided','closed')),
  constraint trip_occurrence_cases_policy_check
    check (redelivery_policy in ('allowed','blocked')),
  constraint trip_occurrence_cases_decision_check
    check ((decision_kind is null) = (decided_at is null)),
  constraint trip_occurrence_cases_decision_kind_check check (decision_kind is null or decision_kind
    in ('redelivery_authorized','goods_paid','other')),
  -- correção 2: decided/closed sem decisão não pode existir, e o inverso também
  constraint trip_occurrence_cases_decided_status_check
    check (status not in ('decided','closed') or decision_kind is not null),
  constraint trip_occurrence_cases_decision_status_check
    check (decision_kind is null or status in ('decided','closed')),
  constraint trip_occurrence_cases_decided_by_check
    check ((decided_at is null) = (decided_by_user_id is null)),
  constraint trip_occurrence_cases_decision_note_check
    check (decision_kind <> 'other' or length(btrim(decision_note)) > 0),
  constraint trip_occurrence_cases_resolved_check
    check ((status in ('closed','returned_to_warehouse')) = (resolved_at is not null))
);
-- correção 4: sem updated_at no índice — o feed pagina por (created_at, id) da ocorrência
create index trip_occurrence_cases_company_status_idx
  on trip_occurrence_cases (company_id, status);

create table trip_occurrence_case_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  case_id uuid not null,
  from_status text, -- nulo é a abertura
  to_status text not null,
  actor_kind text not null,
  actor_user_id uuid,
  note text not null default '',
  occurred_at timestamptz not null default now(),
  constraint trip_occurrence_case_events_company_id_id_unique unique (company_id, id),
  constraint trip_occurrence_case_events_company_id_companies_id_fk foreign key (company_id)
    references companies (id) on delete restrict on update cascade,
  constraint trip_occurrence_case_events_company_case_fk foreign key (company_id, case_id)
    references trip_occurrence_cases (company_id, id) on delete cascade on update cascade,
  constraint trip_occurrence_case_events_actor_kind_check
    check (actor_kind in ('internal','contractor')),
  constraint trip_occurrence_case_events_transition_check
    check (from_status is null or from_status <> to_status),
  constraint trip_occurrence_case_events_terminal_check
    check (from_status is null or from_status not in ('closed','returned_to_warehouse')),
  constraint trip_occurrence_case_events_warehouse_note_check
    check (to_status <> 'returned_to_warehouse' or length(btrim(note)) > 0)
);
create unique index trip_occurrence_case_events_opening_unique
  on trip_occurrence_case_events (company_id, case_id) where from_status is null;
create index trip_occurrence_case_events_company_case_occurred_at_idx
  on trip_occurrence_case_events (company_id, case_id, occurred_at, id);
```

⚠️ `trip_occurrence_cases.redelivery_policy` **não aceita `unset`**: tipo `unset` não abre tratativa
(D1), e permitir o valor aqui deixaria a tabela guardar uma linha que a política diz não existir.

**As oito correções do `architect` sobre o rascunho original:**

1. As duas tabelas levam, por nome, exatamente `trip_occurrence_case_events_company_id_id_unique`,
   `trip_occurrence_case_events_company_id_companies_id_fk` (restrict/cascade),
   `trip_occurrence_case_events_company_case_fk` (cascade/cascade) e
   `trip_occurrence_case_events_actor_kind_check` — implementado, nomes conferidos no
   `migration.sql` gerado.
2. `decided`/`closed` sem `decision_kind` não pode existir, e o inverso também — os quatro CHECKs
   novos (`decided_status_check`, `decision_status_check`, `decided_by_check`,
   `decision_note_check`) acima.
3. O histórico trava terminal e abertura no banco — `transition_check`, `terminal_check`, o índice
   único parcial `opening_unique` e `warehouse_note_check`, todos acima.
4. `trip_occurrence_cases_company_status_updated_at_idx` (com `updated_at desc`) **não foi criado** —
   nenhuma consulta da spec pagina por `updated_at`; o cursor do feed é `(created_at, id)` da
   ocorrência. Criado `trip_occurrence_cases_company_status_idx (company_id, status)` e
   `trip_occurrence_case_events_company_case_occurred_at_idx (company_id, case_id, occurred_at, id)`
   **ascendente**, como `trip_status_events_company_trip_occurred_at_idx`.
5. `status` nasce **sem `default`** — quem abre a tratativa (T4) grava `'recorded'` explicitamente.
6. Nenhum CHECK novo usa `not valid` + `validate constraint`: sem precedente nas 224 migrations do
   projeto, e a coluna nova nasce com `default 'unset'`, então o CHECK valida instantâneo —
   confirmado pelo `db:generate` devolvendo `no_changes` e por `make migration-test` verde.
7. A coluna é `resolved_at`, não `closed_at` — ela também é preenchida por
   `returned_to_warehouse`, e `closed_at` sugeriria só o fechamento formal. Escolhido renomear (em
   vez de só comentar) para a leitura do nome não mentir; o comentário no schema reforça.
8. Duas tentações registradas e recusadas nesta task: (a) o item do acerto (T16) **não** ganha FK
   composta para `trip_document_occurrence_products` — ocorrência antiga e a do WhatsApp gravam só
   `product_code` em `trip_document_occurrences`, e a nota inteira grava `''`, então não há chave
   composta que sirva às três formas; (b)
   `trip_document_occurrences.occurrence_type_id` continua sem FK para `company_occurrence_types` —
   **não é esta spec que conserta isso**. As duas decisões estão comentadas no schema, ao lado das
   tabelas.

`trip_occurrence_item_settlements` (Fase 5, T16) segue o mesmo molde: `company_id` em toda FK
composta, `on delete cascade` a partir da tratativa, `amount numeric(14,4)` no formato de
`delivery_charges.amount`, e o pagador como o par `(payer_kind, payer_id)`:

```sql
constraint trip_occurrence_item_settlements_payer_kind_check
  check (payer_kind in ('driver','carrier','contractor','insurer')),
constraint trip_occurrence_item_settlements_payer_id_check
  check ((payer_kind = 'driver') = (payer_id is not null)),
constraint trip_occurrence_item_settlements_reimbursement_check
  check (payer_kind <> 'carrier' or reimbursed_at is null),
constraint trip_occurrence_item_settlements_reimbursed_by_check
  check ((reimbursed_at is null) = (reimbursed_by_user_id is null)),
constraint trip_occurrence_item_settlements_amount_check check (amount > 0)
```

`payer_id` tem FK composta `(company_id, payer_id)` para `fleet_drivers` com `on delete restrict` e
**índice parcial ao lado** (`where payer_kind = 'driver'`) — FK sem índice faz renumerar motorista
varrer a tabela (achado da spec 156 T15).

**Segunda migration, em `delivery_charges`** (aditiva, e separada de propósito: ela mexe numa tabela
que o repasse de taxa já usa em produção):

```sql
alter table delivery_charges add column occurrence_id uuid;
alter table delivery_charges
  add constraint delivery_charges_company_occurrence_fk
  foreign key (company_id, occurrence_id)
  references trip_document_occurrences (company_id, id) on delete restrict on update cascade;
create index delivery_charges_company_occurrence_idx
  on delivery_charges (company_id, occurrence_id) where occurrence_id is not null;
alter table delivery_charges drop constraint delivery_charges_type_check;
alter table delivery_charges add constraint delivery_charges_type_check
  check (charge_type in ('unloading','scheduling','platform','parking','other','returned_goods'));
```

⚠️ O CHECK de `charge_type` aparece **duas vezes** no schema (`delivery_charges` e
`delivery_client_charge_rules`, l.428 e l.510), porque `DELIVERY_CHARGE_TYPES` é a fonte das duas.
Ampliar a constante amplia os dois — e a regra recorrente **não** deve propor `returned_goods`
sozinha: mercadoria devolvida não é taxa que se repete. A política que monta a sugestão recorrente
exclui o tipo por lista, com contrato que reprova se ele voltar.

**Rollback**: `drop table` das três, `drop constraint` e `drop column` da coluna nova, no molde do
repositório (`begin` / `do $$ … row_count = 1` / `commit`). Ele só roda com as tabelas vazias — com
linha presente, `raise`, como a T1 da spec 161.

**Snapshot**: toda pasta nova de `drizzle/` leva `snapshot.json`, e
`test/database-migration/schema-snapshot.contract.ts` é quem pega a falta dele — o `db:check` não
pega.

## Segurança e tenant

- Toda consulta recebe `context.companyId` e filtra por ele; nenhuma rota aceita `companyId`,
  `contractorId` ou CNPJ no payload.
- O portal resolve o escopo **antes** da primeira leitura (`requireOccurrenceInScope`, no molde de
  `requireBatchInScope`), e fora de escopo é `404`.
- A projeção do portal é enumerada campo a campo; foto por URL assinada de 5 min, sem `objectKey`.
- Log só com id opaco e contador: nunca observação, valor, nome, telefone ou documento.
- `test/separator-role.contract.test.ts` não ganha rota nova — se ganhar, é decisão por escrito.

## Idempotência e concorrência

- A transição lê a tratativa com `select … for no key update` **imediatamente antes** do `update`
  (nunca `for update`: deadlock com o `for key share` das inserções com FK, ADR-0068), reconfere a
  política depois do lock e escreve por compare-and-set (`where status = <o travado>`). Corrida
  perdida responde 409, nunca 404.
- Repetir a mesma ação no mesmo estado devolve `unchanged` e **não** grava evento.
- `PUT .../settlement` substitui a lista inteira numa transação (`delete` + `insert`), para a soma
  nunca ser lida pela metade.
- A decisão do contratante é idempotente pela tripla `(caseId, kind, note)`; `kind` diferente sobre
  tratativa `decided` é 409, não sobrescrita.

## Observabilidade

- Um log por transição: `occurrence_case_transition` com `caseId`, `from`, `to`, `actorKind`,
  correlação. Sem nota, sem valor, sem nome.
- Um log por decisão externa, com `actorKind: 'contractor'` — é a linha que responde "quem do
  cliente autorizou".
- `audit_logs` na mesma transação da ação, nunca no reenvio nem em `changed: false`.

## Estratégia de testes

- **Contrato (unitário, sem banco)** — `bun --env-file=../../.env.test test --timeout 120000`:
  a máquina inteira, a política de abertura, a proposta de reentrega, a soma do acerto, os schemas
  Zod das rotas, os erros, e a regressão de `allowed-actions`.
- **Integração (com banco)** — `bun --env-file=../../.env.test run test:integration`, e o arquivo
  **somado à lista explícita do `package.json`**, senão não roda: a máquina sobre linhas reais, as
  duas consultas, o isolamento por empresa, a corrida das duas abas.
- **Migration** — `make migration-test` (migration + rollback em Postgres descartável).
- **Frontend** — contratos das telas novas somados a `test/trip.contract.test.ts` e aos do portal.
- **Smoke/prints** — molde de `test/spec-161-prints.smoke.spec.ts`.

## Riscos

1. **O catálogo de tipos está vazio em staging e produção.** Se ninguém marcar `allowed`/`blocked`,
   a feature inteira fica invisível — o que é o comportamento correto, mas parece defeito. A tela de
   cadastro precisa deixar a escolha evidente, e a evidência da task de tela registra isso.
2. **A reordenação arrasta a parada inteira.** Mitigado pela D9 (proposta `release_document` quando a
   parada tem outras notas), mas é a parte mais fácil de implementar errado — a task carrega 🧠.
3. **Duas permissões novas.** Toda permissão nova é superfície nova; as duas estão justificadas na
   D6/D7, e a task que as cria fecha com `security-reviewer`.
4. **A migration toca `delivery_charges`, que já roda em produção.** É aditiva e vai numa pasta
   própria, mas o CHECK de `charge_type` é recriado — e ele existe em duas tabelas. A task carrega 🧠
   e fecha com `make migration-test`.
5. **O demonstrativo pode ficar pesado.** Cinco fotos por ocorrência, dezenas de ocorrências no mês:
   um PDF de 40 MB não é entregável. A política de layout limita a **uma foto por linha** no corpo
   (a de `position: 1`, reduzida pela miniatura quando existe) e lista as demais por contagem; o
   teste mede o tamanho do PDF de um lote de 50 linhas e falha acima do teto.
6. **Confundir o demonstrativo com fiscal é o erro caro.** Por isso a frase vai **dentro** do
   documento (RF30) e o teste de integração lê `billing_*`, `cte_*`, `nfse_*` e `fiscal_sequences`
   depois de gerar, provando que nada foi tocado.
