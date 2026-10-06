# Evidência — spec 246

## Correções da spec antes de implementar (2026-10-06)

Um `architect` validou os desenhos de `spec.md`, `plan.md` e `tasks.md` contra o código real, e o
usuário fechou quatro decisões. Nada foi implementado: só documentação. Cada correção abaixo foi
conferida contra a árvore de `origin/staging` (`81cd849b6`).

### Decisões do usuário

| Decisão | O que mudou                                                                                                                                                                                                                                                                                        | Por quê                                                                                                                                                                                                                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-a     | As colunas novas das **duas** tabelas de exceção (`note_mode`, `signature_mode`, `items_mode`, `photo_minimum_count`, `items_minimum_count`) são **nulas, sem default**: nulo herda do tipo, campo a campo. P2 deixou de dizer "cada exceção declara os três"; RF1a ganhou a opção "Igual ao tipo" | `resolveWithOverrides` já é `recipient ?? contractor ?? general ?? fallback`. Exceção que só endurece a assinatura não deve repetir o resto. O RF5 fica intacto (campo a campo)                                                                                                                      |
| D-b     | **Fase 3 reescrita.** T3.1 🧠 (chave de cache por nota), T3.2 (mandar `contractorId`/`recipientTaxId` na URL), CA03 antiga, RF6 antiga e "defeito 1" descartados. Nova Fase 3: o **registro no servidor** lê os modos efetivos por nota; medição T3.0 antes de ativar em produção                  | O snapshot já resolve por nota (`drizzle-current-driver-trip.repository.ts` `toDriverDocument`; app em `occurrenceRegistration.service.ts`). Mandar CNPJ na URL viola `security.md` §3, e `driverTripClient.service.ts` (~203-207) recusa de propósito. O defeito real é o servidor ignorar exceções |
| D-c     | Backfill de momentos mapeia `separation + stop` também para `stop`                                                                                                                                                                                                                                 | Preserva o comportamento de todo leitor. Fechar o furo (tipo de galpão com `flow: stop`) é spec à parte                                                                                                                                                                                              |
| D-d     | Fotos N só na ocorrência de nota (`document`); parada fora. Demonstrativo ao cliente passa a mostrar foto de rua e resposta da correção (CA09, RF14). **Assinatura em `signature_object_id`, nunca como linha de anexo** — RF9 corrigido (dizia "guardada como anexo")                             | A FK da tabela de anexos aponta só para `trip_document_occurrences`; `report-stop-occurrence.use-case.ts` não lê `attachment_mode`. Como linha, a assinatura contaria como foto no mínimo, no expurgo e no demonstrativo                                                                             |

### Correções técnicas do architect

1. **T1.2 (nota e assinatura).** `note_mode` do tipo é `NOT NULL DEFAULT 'optional'`, não `off`
   (a observação hoje é sempre opcional; `off` a esconderia em todo tipo sem foto obrigatória —
   RF1a/RF3 tratavam `off` como estado atual e foram corrigidos). `signature_mode` do tipo
   `DEFAULT 'off'`. Backfill do tipo: `required` onde `attachment_mode = 'required'`, senão
   `optional`. Exceções: `note_mode = CASE WHEN attachment_mode = 'required' THEN 'required' ELSE
'optional' END` em **toda** linha existente (uma exceção `optional` sobre tipo `required` com `note_mode` nulo
   herdaria `required` e endureceria o que é opcional hoje); `signature_mode` das exceções nulo. Ordem:
   `ADD COLUMN` do tipo (default constante) → `ADD COLUMN` das exceções → `UPDATE`s → CHECKs nomeadas
   (≤ 63 caracteres) → por último `signature_object_id`, com FK composta
   `(company_id, signature_object_id) → stored_objects(company_id, id) ON DELETE RESTRICT` nas duas
   tabelas de ocorrência. `rollback.sql` derruba CHECKs, colunas e o registro do journal
   (`ROW_COUNT = 1`); não toca `items_mode` nem as CHECKs da 241; o que se perde (`note_mode` gravado)
   está dito.
2. **Ordem T1.3/T1.4.** A T1.3 verifica o **valor da coluna** (padrão de
   `contractor-contact-channels.integration.ts`: semear antes, reexecutar o `UPDATE`), com cinco
   casos; três mutações. A prova de **comportamento** da CA04 (`TRIP_OCCURRENCE_NOTE_REQUIRED`) virou
   a T2.3b, **depois** da T2.3 (antes dela a regra ainda está no código).
3. **T1b (momentos).** Backfill fiel a todo leitor: quatro regras (incluindo `office` onde
   `stage = 'delivery'` e `stop` onde `separation + stop`), `ON CONFLICT DO NOTHING`, tipos inativos
   entram. Tabela no padrão de tenant (FK a `companies`, FK composta com `ON DELETE CASCADE`,
   `UNIQUE (company_id, occurrence_type_id, moment)`, CHECK gerada de `OCCURRENCE_MOMENTS`,
   coberta por `tenant-safety.contract.ts`). Regra de derivação de `stage`/`flow` para tipo com vários
   momentos; leitura tolerante na janela de deploy; `PUT` que muda `stage`/`flow` de tipo com vários
   momentos → 409; API recusa `document + stop` até o app deduplicar por id + momento. **T1b.2:**
   momento FIXO por caso de uso, guarda `acceptsOccurrenceMoment`, política da rota inalterada,
   proibido `resolveOccurrencePermission` no caminho novo; tabela de pontos de código no plan.
   **RF0b corrigido:** o escritório usa `trip.report-on-behalf`, não `trip.report`. **CA00
   corrigida:** o desajuste responde `404 TRIP_DOCUMENT_NOT_REACHABLE` / `422
OCCURRENCE_TYPE_NOT_SEPARATION` / `422 OCCURRENCE_TYPE_NOT_FIELD`, não 403 (códigos conferidos em
   `trip.error.ts:553,576,604`). **CA00b:** verifica as linhas da tabela, não só as listas. **T1b.5:**
   duas mutações. Nota: `separation + document` nunca sai do backfill; os dois "Avaria" existentes
   não são fundidos. Os números de linha da lista do architect foram reconferidos: todos batem nesta
   árvore, exceto onde o plan manda reconferir ao implementar; `SettingsResolutionPanel.component.tsx:61`
   foi acrescentado.
4. **T1d (anexos da rua).** `trip_document_occurrence_attachments` **não tem `retention_until`**
   (está em `stored_objects.retention_until`; o objeto é o mesmo) — corrigido em spec, plan e task. A
   leitura "anexo novo, senão coluna antiga" **já existe** desde a 161 T10: T1d.1 virou contrato que
   prende o que existe. SQL do backfill com `created_at = o.created_at` obrigatório e `NOT EXISTS`
   (pode haver ocorrência com anexo só na posição 2). Migration própria em **deploy separado** da T1.2
   (o migrator roda tudo numa transação; `ADD COLUMN signature_object_id` seguraria `ACCESS
EXCLUSIVE` durante o `INSERT`). Medição em produção (T1d.0) só com autorização. Objeto servindo N
   ocorrências (lote do escritório) vira N linhas com o mesmo `stored_object_id`, e o expurgo da 161
   supõe uma por objeto: documentado, e a escrita dupla da T1d.5 não usa `trip_occurrence_attachment`
   para o lote. `rollback.sql` não apaga as linhas. Sementes (a)-(e), três mutações. O id do anexo
   antigo muda (id da ocorrência → id da linha) na linha do tempo e no feed: registrado.
5. **T1c / `items_mode`.** T1c.0 satisfeita e marcada: a 241 está em `origin/staging` `81cd849b6`,
   migration `20261006033752_occurrence_type_items_mode`. `items_mode` das exceções é coluna nula
   (D-a). **Decisão tomada aqui:** sem CHECK `off ⇒ unset` nas exceções, porque a política de
   reentrega é do tipo. **Decisão tomada aqui:** `items_mode` + `items_minimum_count` da exceção vão
   como **par** (nulo em `items_mode` herda o par; declarado usa o próprio, e `items_minimum_count`
   nulo é "todos os itens") — sem isso a exceção não consegue pedir "todos" sobre um tipo que pede
   "ao menos 2". Referências de linha do plan atualizadas (`trip.schema.ts` 2416/2532/2584 →
   2594/2685/2737; regra da nota em `register-driver-occurrence.use-case.ts:146-152`, não 137). O
   comentário de `itemsMode` (~2621) que cita "spec 239" é a 246: corrigir na T1.1.
6. **WhatsApp do motorista** não colhe assinatura (nem foto). **Decisão tomada aqui (RF13):** tipo com
   assinatura `required` não é registrável por esse canal — o servidor devolve o erro estável da
   assinatura, como já devolve para foto obrigatória; a lista **não** é filtrada por exigência
   nesta spec. Task T2.6 prende o comportamento. Sem `[NEEDS CLARIFICATION]`.

### Decisões que o usuário pode vetar (tomadas nesta revisão)

- RF13: o WhatsApp não filtra a lista; o erro estável diz o campo.
- Par `items_mode` + `items_minimum_count` na exceção.
- Sem CHECK `off ⇒ unset` nas exceções.
- `signature_object_id` criada também em `trip_stop_occurrences` (o architect pediu "nas duas
  tabelas"), embora a exigência da parada esteja fora do escopo (D-d): a coluna fica **sem escritor
  nem leitor** nesta spec, para evitar uma segunda migration.
- `preview.html`: as quatro seleções da exceção ganharam a opção "Igual ao tipo" (estado inicial da
  exceção nova) e a dica abaixo da grade a explica — o protótipo só mostrava três estados.

### Conferência da pré-condição (T1c.0)

`git rev-parse origin/staging` = `81cd849b686a93775569ae07ac8910added452f7`. A árvore tem
`apps/api-transportada/drizzle/20261006033752_occurrence_type_items_mode/` com
`items_mode varchar(16) DEFAULT 'optional' NOT NULL`, `company_occurrence_types_items_mode_check` e
`company_occurrence_types_items_off_shape_check`; `trip.schema.ts:2624` declara `itemsMode`.

## Medições pendentes (pedem autorização do usuário; só leitura)

- [ ] T1d.0 — produção: `count(*)` de `trip_document_occurrences.attachment_object_id IS NOT NULL`, e
      quantas têm as duas fontes (esperado 0).
- [ ] T3.0 — staging e produção: exceções com `attachment_mode <> 'required'` sobre tipo `required`.
      A Fase 3 só ativa em produção depois deste registro.

## Fase 1 — O dado passa a carregar a exigência

### T1.1 — Schema (2026-10-06)

`trip.schema.ts`: no tipo, `note_mode varchar(16) NOT NULL DEFAULT 'optional'` e `signature_mode
varchar(16) NOT NULL DEFAULT 'off'` (padrões em `OCCURRENCE_TYPE_REQUIREMENT_DEFAULTS`,
`trip-occurrence.constant.ts`), com `company_occurrence_types_note_mode_check` e
`company_occurrence_types_signature_mode_check` sobre `DELIVERY_PROOF_FIELD_MODES`. Nas duas exceções,
`note_mode` e `signature_mode` **nulas, sem padrão** (D-a). `signature_object_id` em
`trip_document_occurrences` e `trip_stop_occurrences`, com `<tabela>_company_signature_object_fk`
(`(company_id, signature_object_id) → stored_objects(company_id, id) ON DELETE RESTRICT ON UPDATE
CASCADE`, molde de `trip_document_occurrences_company_object_fk`). Comentário de `itemsMode` corrigido
("239" → "246").

**Decisão — nomes das CHECKs das exceções.** `<tabela>_signature_mode_check` passaria de 63
caracteres nas duas exceções (65 e 64); as quatro CHECKs das exceções perdem o prefixo `company_`:
`occurrence_type_contractor_overrides_note_mode_check` (52),
`occurrence_type_contractor_overrides_signature_mode_check` (57),
`occurrence_type_recipient_overrides_note_mode_check` (51),
`occurrence_type_recipient_overrides_signature_mode_check` (56). Uma regra só para as quatro, em vez
de encurtar só a que estoura.

Contrato primeiro — `test/trip-schema/occurrence-type-requirement-modes.contract.ts` (registrado em
`test/trip-schema.contract.test.ts`), rodado contra o `trip.schema.ts` de `HEAD` (o arquivo foi
trocado pelo de `HEAD` só para a execução e restaurado em seguida):

```text
$ bun test ./test/trip-schema/occurrence-type-requirement-modes.contract.ts   # schema de HEAD
(fail) ... > o tipo nasce com observação optional e assinatura off, nunca nulas
(fail) ... > o vocabulário do tipo é preso por CHECK nomeada
(fail) ... > company_occurrence_type_contractor_overrides: as colunas novas são nulas e sem padrão (D-a, nulo herda)
(fail) ... > company_occurrence_type_contractor_overrides: CHECKs de vocabulário com nome dentro de 63 caracteres
       Expected length: 2 / Received length: 0
(fail) ... > company_occurrence_type_recipient_overrides: as colunas novas são nulas e sem padrão (D-a, nulo herda)
(fail) ... > company_occurrence_type_recipient_overrides: CHECKs de vocabulário com nome dentro de 63 caracteres
(fail) ... > trip_document_occurrences: signature_object_id nula, presa ao objeto da mesma empresa
(fail) ... > trip_stop_occurrences: signature_object_id nula, presa ao objeto da mesma empresa
 0 pass
 8 fail
```

Com o schema novo: `8 pass, 0 fail`; `bun test ./test/trip-schema.contract.test.ts` → `249 pass, 0
fail`; `bun run typecheck` → 0 erros. `bun run db:generate --name occurrence_type_requirement_modes`
→ `drizzle/20261006112823_occurrence_type_requirement_modes/migration.sql` (DDL na ordem do
drizzle-kit; a ordem do plan, os `UPDATE`s e o `rollback.sql` são a T1.2).

### T1.2 🧠 — Migration na ordem do plan (2026-10-06)

`drizzle/20261006112823_occurrence_type_requirement_modes/`: o DDL do `db:generate` foi reordenado à
mão e ganhou os três `UPDATE`s e o `rollback.sql` no padrão da casa. Ordem: `ADD COLUMN` do tipo
(padrão constante) → `ADD COLUMN` das exceções (nulas) → `UPDATE company_occurrence_types SET
note_mode = 'required' WHERE attachment_mode = 'required'` → `UPDATE <exceção> SET note_mode = CASE
WHEN attachment_mode = 'required' THEN 'required' ELSE 'optional' END` (sem `WHERE`, toda linha; nas
duas exceções) → as seis CHECKs → `signature_object_id` nas duas ocorrências → as duas FKs.
`signature_mode` das exceções fica nulo. `rollback.sql`: `BEGIN` → FKs → `signature_object_id` →
CHECKs → colunas → `DELETE` do journal com `ROW_COUNT <> 1 → RAISE` → `COMMIT`; não toca
`items_mode` nem as CHECKs da 241; o cabeçalho diz o que se perde.

Contrato primeiro — `test/database-migration/occurrence-type-requirement-modes.static.contract.ts`
(registrado em `test/database-migration.contract.test.ts`; a lista de diretórios de
`static-migration.contract.ts` ganhou a migration), contra o `migration.sql` como o drizzle-kit
gerou e sem `rollback.sql`:

```text
$ bun test ./test/database-migration/occurrence-type-requirement-modes.static.contract.ts
error: Missing fragment: UPDATE "company_occurrence_types" SET "note_mode" = 'required' WHERE "attachment_mode" = 'required';
(fail) a exigência vira dado na ordem do plan (spec 246 T1.2) > colunas do tipo → das exceções → UPDATEs → CHECKs → signature_object_id
ENOENT: no such file or directory, open '.../drizzle/20261006112823_occurrence_type_requirement_modes/rollback.sql'
(fail) a exigência vira dado na ordem do plan (spec 246 T1.2) > o rollback desfaz só a 246, em ordem inversa, e não toca a 241
 0 pass
 2 fail
```

Depois: os contratos estáticos de migration (`occurrence-type-requirement-modes.static`,
`static-migration`, `schema-snapshot`, `migration-readiness`, `pre-deploy`, `migration-chain`) →
`86 pass, 0 fail`; `bun run db:generate` → `{"status":"no_changes"}`; `make migration-test
ENV_FILE=.env.test` (Postgres de teste 127.0.0.1:65432) → `127 pass, 0 fail, 0 skip` em 8 arquivos.

Validação por `architect` (opus, só leitura) sobre o SQL final: **APROVADO**, sem bloqueios — as
CHECKs só leem valores que a própria migration gravou ou nulo; as FKs caem sobre coluna nova toda
nula (nenhuma linha verificável), sem precisar de `NOT VALID`; `ADD COLUMN` com padrão constante não
reescreve a tabela; rollback em ordem inversa, sem tocar a 241. Diferenças de forma apontadas, sem
efeito: um `ALTER` por coluna (formato do drizzle-kit) em vez de um por tabela; `migration.sql` sem
cabeçalho de copyright, como o molde da 241.

### T1.3 — Valor da coluna sobre dado antigo (2026-10-06)

`test/integration/occurrence-type-requirement-modes.integration.ts` (entrou na lista
`test:integration` do `package.json` da API, logo depois de `occurrence-type-items-mode`). O banco
descartável nasce migrado, **desfaz só a 246 pelo próprio `rollback.sql`**, recebe tipos e exceções
gravados sem as colunas novas, e o migrador reaplica o `migration.sql` lido do disco — os `UPDATE`s
que rodam são os do arquivo, junto com o padrão do `ADD COLUMN` (é o que deixa a mutação (2) da T1.4
visível; reexecutar só o `UPDATE` sobre colunas já criadas não a pegaria). **Decisão:** é a variação
do molde de `contractor-contact-channels.integration.ts` (semear antes, rodar o SQL do arquivo) que
cobre as três mutações. Casos, todos sobre o mesmo tipo `required` nas exceções:

| Semente                                 | `note_mode` esperado | `signature_mode` |
| --------------------------------------- | -------------------- | ---------------- |
| tipo `attachment_mode = required`       | `required`           | `off`            |
| tipo `optional`                         | `optional`           | `off`            |
| tipo `off`                              | `optional`           | `off`            |
| contratante `required`                  | `required`           | nulo             |
| contratante `optional` sobre `required` | `optional`           | nulo             |
| destinatário `required`                 | `required`           | nulo             |
| destinatário `off` sobre `required`     | `optional`           | nulo             |

```text
$ cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-type-requirement-modes.integration.ts
 1 pass
 0 fail
```

**Rollback não toca a 241 (CA07)** — `test/database-migration/occurrence-type-requirement-modes.assertion.ts`,
chamado de `database-migration.integration.ts` logo depois da asserção da 241 (roda no `make
migration-test`): lê `pg_constraint` e `information_schema.columns`; antes do rollback há as 2 CHECKs
da 241 + as 6 CHECKs e 2 FKs da 246, e 9 colunas; depois do rollback restam exatamente
`company_occurrence_types_items_mode_check`, `company_occurrence_types_items_off_shape_check` e
`company_occurrence_types.items_mode`; o migrador reaplica e o estado completo volta. A CHECK
estática de ordem é a da T1.2 (`occurrence-type-requirement-modes.static.contract.ts`).
`make migration-test ENV_FILE=.env.test` → `127 pass, 0 fail, 0 skip`.

Prova de que a asserção não é vazia — o `rollback.sql` ganhou à mão um `DROP CONSTRAINT IF EXISTS
"company_occurrence_types_items_off_shape_check"` só para esta execução, restaurado em seguida
(`git status` limpo):

```text
$ make migration-test ENV_FILE=.env.test
error: expect(received).not.toMatch(expected)
(fail) a exigência vira dado na ordem do plan (spec 246 T1.2) > o rollback desfaz só a 246, em ordem inversa, e não toca a 241
error: expect(received).toEqual(expected)
-   "company_occurrence_types_items_off_shape_check",
(fail) Drizzle migration integration > applies, constrains, rolls back, and reapplies the fiscal migration
 125 pass
 2 fail
```

### T1.4 — Mutações (2026-10-06)

Cada mutação foi aplicada ao `migration.sql` da T1.2 só para a execução, e o arquivo foi restaurado
da cópia em seguida (`git status` limpo). Comando das três:
`cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-type-requirement-modes.integration.ts`.

**(1) Tirar o `UPDATE` do tipo.**

```text
-UPDATE "company_occurrence_types" SET "note_mode" = 'required' WHERE "attachment_mode" = 'required';--> statement-breakpoint
error: expect(received).toEqual(expected)
-   "note_mode": "required",
+   "note_mode": "optional",
(fail) a exigência vira dado sem mudar o que já está gravado (spec 246 T1.3) > tipo e exceções antigos saem com observação e assinatura conforme a regra da 179
 0 pass
 1 fail
```

**(2) Padrão `'off'` em `note_mode` do tipo.**

```text
-ALTER TABLE "company_occurrence_types" ADD COLUMN "note_mode" varchar(16) DEFAULT 'optional' NOT NULL;--> statement-breakpoint
+ALTER TABLE "company_occurrence_types" ADD COLUMN "note_mode" varchar(16) DEFAULT 'off' NOT NULL;--> statement-breakpoint
error: expect(received).toEqual(expected)
-   "note_mode": "optional",
+   "note_mode": "off",
(fail) a exigência vira dado sem mudar o que já está gravado (spec 246 T1.3) > tipo e exceções antigos saem com observação e assinatura conforme a regra da 179
 0 pass
 1 fail
```

**(3) O `CASE` das exceções vira `WHERE attachment_mode = 'required'`.**

```text
+UPDATE "company_occurrence_type_contractor_overrides" SET "note_mode" = 'required' WHERE "attachment_mode" = 'required';--> statement-breakpoint
+UPDATE "company_occurrence_type_recipient_overrides" SET "note_mode" = 'required' WHERE "attachment_mode" = 'required';--> statement-breakpoint
error: expect(received).toEqual(expected)
-   "note_mode": "optional",
+   "note_mode": null,
(fail) a exigência vira dado sem mudar o que já está gravado (spec 246 T1.3) > tipo e exceções antigos saem com observação e assinatura conforme a regra da 179
 0 pass
 1 fail
```

Restaurado: `1 pass, 0 fail`. A prova de **comportamento** da CA04 (`TRIP_OCCURRENCE_NOTE_REQUIRED`)
é a T2.3b, depois da T2.3.

### Gates ao fechar a Fase 1 (2026-10-06, primeiro plano)

| Gate                                                                         | Resultado                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                              | sem mudanças                                                                                                                                                                                                                        |
| `bun run typecheck`                                                          | saída 0, 0 erros                                                                                                                                                                                                                    |
| `./node_modules/.bin/prettier --check .` e `bun run format:check`            | "All matched files use Prettier code style!"                                                                                                                                                                                        |
| contrato da API (`bun --env-file=../../.env.test test --timeout 120000`)     | `9727 pass, 25 skip, 0 fail` (199 arquivos); antes da fase, em `f86a9e8c2`: `9717 pass, 25 skip, 0 fail` — os 25 pulados são anteriores                                                                                             |
| integração, um arquivo por vez com `--env-file=../../.env.test`              | `occurrence-type-requirement-modes` 1/0 · `occurrence-type-items-mode` 5/0 · `occurrence-type-catalog-seed` 2/0 · `occurrence-type-redelivery-policy` 2/0 · `occurrence-type-leaves-document-behind` 4/0 (pass/fail, nenhum pulado) |
| `make migration-test ENV_FILE=.env.test` (Postgres de teste 127.0.0.1:65432) | `127 pass, 0 fail, 0 skip`                                                                                                                                                                                                          |
| `bun run db:generate`                                                        | `no_changes`                                                                                                                                                                                                                        |
| `bun run --cwd apps/api-transportada build`                                  | saída 0                                                                                                                                                                                                                             |

## Fase 1b — O momento vira conjunto

### T1b.1b (painel) — a guarda do catálogo tolera `moments` antes da API (2026-10-06)

Ordem de publicação (ADR-0081 §9): o `GET`/`PUT /company-settings/occurrence-types` passa a mandar
`moments` na T1b.1b da API, e a guarda de chave exata do painel (`isOccurrenceType`,
`apps/frontend-transportada/src/modules/trip/shared/tripResponse.validation.ts`) reprovaria a lista
inteira. Este commit é **separado** dos da API para poder subir antes. `moments` entra na lista de
chaves permitidas, presente só passa com o vocabulário de `OCCURRENCE_MOMENTS` (cópia por valor em
`trip/shared/occurrence.constant.ts`), ausente é API anterior. O `PUT` do painel
(`buildOccurrenceTypeUpdate`) monta o corpo campo a campo e não manda `moments` — a API mantém o
gravado (T1b.1b).

Conferidos os outros leitores das respostas que a Fase 1b toca: `frontend-driver` e
`frontend-client` **não** leem o catálogo (`/company-settings/occurrence-types`); a lista do
motorista (`/me/trips/current/occurrence-types`), o snapshot (`document.occurrenceTypes`), a lista do
escritório (`/trips/occurrence-types/field`) e a verificação (`settings-resolution`) **não mudam de
forma** nesta fase — nenhum campo novo sai neles. A guarda `isTripOccurrence` (~1461) lê ocorrências,
não tipos, e também não muda.

Contrato primeiro — `test/trip/occurrence-type-tolerance.contract.ts`, vermelho antes da guarda:

```text
$ bun test ./test/trip/occurrence-type-tolerance.contract.ts
error: TRIP_RESPONSE_INVALID
      at occurrenceTypesFromApi (.../src/modules/trip/shared/tripResponse.validation.ts:1073:82)
(fail) tolerância a allowsMultipleItems/redeliveryPolicy ausentes (achado B7) > aceita `moments` da API nova, e a lista sem ele da API anterior [2.12ms]
 9 pass
 1 fail
```

Depois: `10 pass, 0 fail`; `bun run typecheck` (app) saída 0; `eslint` nos três arquivos sem achado.

### T1b.1 — A tabela de momentos e o backfill (2026-10-06)

`OCCURRENCE_MOMENT`/`OCCURRENCE_MOMENTS` (`separation`, `document`, `stop`, `office`, nesta ordem
canônica) e a guarda `acceptsOccurrenceMoment({ moments, moment })` em
`src/shared/trip-occurrence.constant.ts`. A tabela mora em arquivo próprio,
`src/database/occurrence-type-moment.schema.ts` (exportado por `database.schema.ts`), no padrão de
tenant: `company_occurrence_type_moments_company_id_companies_id_fk` (restrict/cascade),
`company_occurrence_type_moments_type_fk` `(company_id, occurrence_type_id) →
company_occurrence_types(company_id, id) ON DELETE CASCADE`, `company_occurrence_type_moments_unique
(company_id, occurrence_type_id, moment)` e `company_occurrence_type_moments_moment_check` gerada de
`inList(OCCURRENCE_MOMENTS)`.

Migration `drizzle/20261006115725_occurrence_type_moments/` (`db:generate --name
occurrence_type_moments`, depois o backfill à mão): `CREATE TABLE` → as duas FKs → cinco `INSERT …
SELECT … ON CONFLICT ON CONSTRAINT "company_occurrence_type_moments_unique" DO NOTHING`, uma regra da
tabela do plan por instrução (a de `stop` são duas: `delivery + stop` e `separation + stop`, D-c), sem
filtro de `active` — tipo inativo entra. O cabeçalho registra que `separation + document` nunca sai do
backfill e que os dois "Avaria" existentes continuam dois tipos. `rollback.sql`: `BEGIN` → `DROP
TABLE` → `DELETE` do journal com `ROW_COUNT <> 1 → RAISE` → `COMMIT`; não toca `stage` nem `flow`, e
o cabeçalho diz o preço (tipo com mais momentos do que o par `stage`/`flow` diz perde o conjunto; um
`separation + document` volta a ser só de galpão).

Contratos primeiro, vermelhos:

```text
$ bun test ./test/trip-schema/tenant-safety.contract.ts
SyntaxError: Export named 'companyOccurrenceTypeMoments' not found in module '.../src/database/database.schema.ts'.
 0 pass
 1 fail
 1 error

$ bun test ./test/database-migration/occurrence-type-moments.static.contract.ts
error: occurrence_type_moments is required
(fail) o momento vira conjunto (spec 246 T1b.1) > o rollback derruba só a tabela e o journal, e não toca stage nem flow [1.65ms]
 0 pass
 2 fail
```

Depois: `tenant-safety.contract.ts` → `18 pass, 0 fail` (a tabela entrou em `TRIP_TABLES` e ganhou o
caso de FK composta, unicidade e CHECK igual a `inList(OCCURRENCE_MOMENTS)`);
`bun test ./test/trip-schema.contract.test.ts` → `250 pass, 0 fail`; os contratos estáticos de
migration (`occurrence-type-moments.static`, `static-migration` — a lista de diretórios ganhou a
pasta —, `schema-snapshot`, `migration-readiness`, `pre-deploy`, `migration-chain`,
`occurrence-type-requirement-modes.static`) → `88 pass, 0 fail`; `bun run db:generate` →
`no_changes`; `bun run typecheck` → saída 0. Rollback no `make migration-test`:
`test/database-migration/occurrence-type-moments.assertion.ts` (chamado logo depois do da T1.2)
derruba a tabela pelo `rollback.sql`, confere que `stage` e `flow` do tipo seguem de pé e que o
migrador a reaplica — `make migration-test ENV_FILE=.env.test` → `129 pass, 0 fail, 0 skip` em 8
arquivos. As **linhas** do backfill sobre dado semeado são a T1b.4.

### T1b.1b (API) — Derivação de `stage`/`flow`, leitura tolerante e o `PUT` com `moments` (2026-10-06)

Regra pura em `src/trips/domain/occurrence-moment.policy.ts`: `deriveOccurrenceMomentsFromStageAndFlow`
(gêmea do backfill: `separation` → `[separation]`, `separation + stop` → `[separation, stop]`,
`delivery + document` → `[document, office]`, `delivery + stop` → `[stop, office]`);
`resolveOccurrenceTypeMoments` (leitura tolerante: o gravado vence, tipo sem linha usa os derivados);
`deriveStageAndFlowFromMoments` (`stage = 'separation'` se e só se `separation ∈ momentos`; `flow =
'stop'` se e só se `stop ∈` e `document ∉`); `assertOccurrenceMomentsAreWritable` (`document + stop`
→ `422 OCCURRENCE_TYPE_MOMENTS_DOCUMENT_AND_STOP`); `isExpressedByStageAndFlow`. Erros em
`occurrence-moment.error.ts` (arquivo próprio, molde de `canhoto-review.error.ts`).

Leitura: `findOccurrenceType` e `listOccurrenceTypes` (`delivery-proof-read.support.ts`) devolvem
`moments` resolvidos, por `withOccurrenceTypeMoments`
(`src/trips/infrastructure/occurrence-type-moments.query.ts`) — **uma** consulta para a lista
inteira. O `GET /company-settings/occurrence-types` e a resposta do `PUT` passam a trazer `moments`
(o painel já tolera: commit `2cf84cb2f`). `OccurrenceTypeRecord.moments` é opcional só para os
dublês; toda guarda passa pelo resolvedor.

Escrita: `occurrenceTypeSchema` aceita `moments` (vocabulário fechado, opcional). Em
`saveOccurrenceTypeWithTemplate`: com `moments`, `stage`/`flow` gravados são os derivados do
conjunto (o corpo continua mandando `stage`, que o conjunto vence); sem `moments`, o gravado fica.
**Interpretação registrada** de "`PUT` que muda `stage`/`flow` de tipo com vários momentos → 409":
"vários momentos" é o conjunto que o par `stage`/`flow` **não** diz inteiro (ex.: `separation +
document`). Um tipo `delivery + document` tem dois momentos (`document`, `office`) e o par o diz
inteiro — trocar o `flow` dele pelo painel de hoje **re-deriva** o conjunto (`[stop, office]`), senão
a troca não teria efeito no registro, que passa a ler o conjunto. A gravação do tipo e do conjunto é
uma transação só (`saveOccurrenceType`); criação sem `moments` grava o derivado. `stop_kind` segue a
regra antiga sobre o `flow` gravado, que agora é o derivado — tipo com `stop` sempre ganha `other`
quando vazio. O `seedOccurrenceTypeCatalog` do pre-deploy grava sem linha de momento (não passa por
`saveOccurrenceType`); a leitura tolerante cobre.

Contratos primeiro (`test/trip-occurrence/occurrence-moment.contract.ts` e
`occurrence-type-moments-write.contract.ts`, registrados em `test/trip-occurrence.contract.test.ts`),
vermelhos antes da implementação:

```text
$ bun test ./test/trip-occurrence/occurrence-moment.contract.ts ./test/trip-occurrence/occurrence-type-moments-write.contract.ts
error: Cannot find module '../../src/trips/domain/occurrence-moment.policy.js' from '.../test/trip-occurrence/occurrence-moment.contract.ts'
(fail) o cadastro grava o conjunto de momentos (spec 246 T1b.1b) > com moments, stage e flow gravados são os derivados do conjunto [0.46ms]
(fail) o cadastro grava o conjunto de momentos (spec 246 T1b.1b) > nota e parada juntas são recusadas antes de gravar [0.10ms]
(fail) o cadastro grava o conjunto de momentos (spec 246 T1b.1b) > sem moments, mudar o flow de tipo que o par diz inteiro re-deriva o conjunto [0.07ms]
(fail) o cadastro grava o conjunto de momentos (spec 246 T1b.1b) > tipo antigo sem linha de momento segue a mesma regra, pelos derivados [0.06ms]
(fail) o cadastro grava o conjunto de momentos (spec 246 T1b.1b) > sem moments, mudar stage/flow de tipo com vários momentos é 409 [0.06ms]
(fail) o cadastro grava o conjunto de momentos (spec 246 T1b.1b) > "deixa a nota para trás" vale pelo stage derivado do conjunto [0.11ms]
(fail) o corpo do PUT do catálogo aceita moments (spec 246 T1b.1b) > moments no vocabulário passa; ausente continua ausente (mantém o gravado) [2.68ms]
 2 pass
 8 fail
```

Depois: `21 pass, 0 fail`; `bun test ./test/trip-occurrence.contract.test.ts` → `374 pass, 0 fail`;
`bun run --cwd apps/api-transportada typecheck` → saída 0. Integração dos que gravam tipo pelo
`saveOccurrenceType` (agora em transação com o conjunto), um por vez com `--env-file`:
`occurrence-type-items-mode` 5/0 · `occurrence-type-leaves-document-behind` 4/0 ·
`occurrence-type-redelivery-policy` 2/0 · `occurrence-type-catalog-seed` 2/0 ·
`occurrence-type-requirement-modes` 1/0 (pass/fail, nenhum pulado). A escrita e a leitura do
conjunto contra o banco são provadas na T1b.3.

### T1b.2 🧠 — A guarda é o momento fixo de cada caso de uso (2026-10-06)

Desenho validado por `architect` antes desta fase (ver "Correções da spec"). A guarda é
`acceptsOccurrenceMoment({ moments, moment })` (`shared/trip-occurrence.constant.ts`), chamada sempre
por `occurrenceTypeAcceptsMoment({ moment, type })` (`trips/domain/occurrence-moment.policy.ts`), que
passa o conjunto pela leitura tolerante. A política de cada rota **não mudou**;
`resolveOccurrencePermission` (`occurrence.policy.ts`) não entra em nenhum caminho novo — nenhuma
permissão é calculada a partir dos momentos do tipo.

Pontos de código, reconferidos nesta árvore (os números mudaram desde o plan):

| Ponto (plan)                                                                                                                                                                                                                  | Linha hoje                                                        | O que mudou                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `register-trip-occurrence.use-case.ts:323`                                                                                                                                                                                    | ~330                                                              | `separation` no conjunto, senão `422 OCCURRENCE_TYPE_NOT_SEPARATION`; a ocorrência grava `stage: separation` (o momento do registro), não o par do tipo                                                                                                   |
| `register-driver-occurrence.use-case.ts:105-112`                                                                                                                                                                              | ~105                                                              | `document` no conjunto, senão `409 TRIP_DOCUMENT_NOT_REACHABLE` (cobre tipo de galpão e de parada; o `flow` sai da conta)                                                                                                                                 |
| `office-occurrence-batch.service.ts:35-40`                                                                                                                                                                                    | ~36                                                               | `office` no conjunto, senão `422 OCCURRENCE_TYPE_NOT_FIELD`                                                                                                                                                                                               |
| `drizzle-driver-field-report.repository.ts:1053` (parada)                                                                                                                                                                     | ~1045                                                             | `findStopOccurrenceType` deixou o `where flow = 'stop'`: lê o tipo ativo, resolve o conjunto (`withOccurrenceTypeMoments`) e só devolve com `stop` nele — mesma resposta `null` → `422 OCCURRENCE_TYPE_NOT_STOP`                                          |
| `register-driver-flow-actions.ts:399,445` (WhatsApp do motorista)                                                                                                                                                             | 397, 443 + `isOfferedToDriver`                                    | lista e conferência da resposta pelo momento `document`: **a lista perde os tipos de parada**                                                                                                                                                             |
| `register-operator-trip-flow-actions.ts:583,628` (WhatsApp do operador)                                                                                                                                                       | 583, 626 + `isOfferedToOperator`                                  | momento `separation`, pelo conjunto                                                                                                                                                                                                                       |
| `list-field-occurrence-types.use-case.ts:126,193`                                                                                                                                                                             | `selectFieldOccurrenceTypes`                                      | ganha o parâmetro `moment`; ausente é a lista do motorista (`document` ou `stop`, `DRIVER_FIELD_MOMENTS`); as exceções em lote são lidas só para os tipos do momento                                                                                      |
| `me-trip.routes.ts` (`GET /me/trips/current/occurrence-types`)                                                                                                                                                                | —                                                                 | aceita `?moment=` só dos momentos do motorista (`document`, `stop`); outro valor é `400`; ausente é a lista de hoje                                                                                                                                       |
| `trip-field-office-occurrence.routes.ts` (`GET /trips/occurrence-types/field`)                                                                                                                                                | —                                                                 | pede a lista do momento `office`                                                                                                                                                                                                                          |
| `drizzle-current-driver-trip.repository.ts:781,1045` (snapshot)                                                                                                                                                               | ~781, ~1043                                                       | tipos e exceções do snapshot pelo momento `document` (sai o `filter(flow === 'document')`)                                                                                                                                                                |
| `read-settings-resolution.use-case.ts:125`                                                                                                                                                                                    | 125                                                               | **sem mudança**: a lista vem de `listFieldOccurrenceTypes` sem `moment` (a lista de rua do motorista); o `stage: delivery` da resposta é rótulo da tela, não decisão                                                                                      |
| `save-occurrence-type.use-case.ts:96`                                                                                                                                                                                         | ~121                                                              | (T1b.1b) "deixa a nota para trás" confere o `stage` **derivado** do conjunto                                                                                                                                                                              |
| `delivery-proof-read.support.ts:846-1110`                                                                                                                                                                                     | `findOccurrenceType`, `listOccurrenceTypes`, `saveOccurrenceType` | (T1b.1b) leitura com o conjunto resolvido; escrita do conjunto na transação do tipo                                                                                                                                                                       |
| Painel (`TripOccurrences.component.tsx:136`, `separationOccurrenceButton.service.ts:28`, `SettingsResolutionPanel.component.tsx:61`, `OccurrenceTypeCatalogPanel.component.tsx:88`, `OccurrenceTypeRow.component.tsx:51,135`) | —                                                                 | **sem mudança nesta fase** (Fase 5): continuam lendo `stage`, que segue gravado e derivado do conjunto — um tipo `separation + document` tem `stage = 'separation'` e aparece no botão do separador. Guardas de chave exata: commit do painel `2cf84cb2f` |
| App (`occurrenceRegistration.service.ts:48-51`)                                                                                                                                                                               | —                                                                 | **sem mudança**: a API recusa `document + stop`, então o `flow` de cada tipo continua único                                                                                                                                                               |

⚠️ **Divergência registrada (consequência de D-c, não do código):** um tipo antigo `separation +
stop` vira `{separation, stop}` no backfill (D-c, para preservar o registro de parada, que já o
aceitava por ler só `flow`). Como a lista do motorista passa a ser "tipos com `document` ou `stop`",
esse tipo **passa a aparecer** na lista do app (antes ficava fora por `stage = 'separation'`) — a
CA00b ("nenhuma lista muda") não vale para esse caso de borda. O tipo só nasce por chamada direta à
API (o painel esconde `flow` em tipo de galpão). Nenhuma regra consistente com o conjunto evita
isso sem fechar o furo, que D-c mandou para spec à parte.

Contratos primeiro, vermelhos antes da implementação (`test/trip-occurrence/occurrence-moment-guard.contract.ts`,
casos novos em `test/driver-trip/me-routes.contract.ts`, `test/trip-field-office/occurrences-route.contract.ts`,
`test/whatsapp-commands/driver-flow-actions.contract.ts` e `operator-flow-actions.contract.ts`). Os
dublês gravam `stage` em desacordo com `moments` de propósito — a guarda que lê o par reprova. Os
dois do WhatsApp rodaram contra os arquivos de `HEAD` (trocados só para a execução e restaurados):

```text
$ bun test ./test/trip-occurrence/occurrence-moment-guard.contract.ts
(fail) o separador registra só no momento separation (spec 246 T1b.2) > tipo só de nota é recusado, mesmo com stage separation gravado [0.54ms]
(fail) o motorista registra só no momento document (spec 246 T1b.2) > tipo separation + document passa, embora o stage gravado seja separation [0.35ms]
(fail) o motorista registra só no momento document (spec 246 T1b.2) > tipo só de galpão é inalcançável, mesmo com stage delivery gravado [0.09ms]
(fail) o motorista registra só no momento document (spec 246 T1b.2) > tipo de parada é inalcançável na rota de nota [0.07ms]
(fail) o escritório registra só no momento office (spec 246 T1b.2) > tipo de nota sem office é recusado, mesmo com stage delivery [0.17ms]
(fail) o escritório registra só no momento office (spec 246 T1b.2) > tipo com office passa, mesmo com stage separation gravado [0.08ms]
(fail) as listas de rua seguem o momento, não o stage (spec 246 T1b.2) > o motorista (sem moment) vê nota e parada, inclusive o tipo de galpão + nota [0.17ms]
(fail) as listas de rua seguem o momento, não o stage (spec 246 T1b.2) > com moment, só os tipos daquele momento [0.05ms]
 1 pass
 8 fail

$ bun test ./test/driver-trip/me-routes.contract.ts ./test/trip-field-office/occurrences-route.contract.ts
(fail) os tipos de ocorrência do motorista (spec 157) > repassa moment de rua, ausente é undefined, e recusa momento de outro papel [10.11ms]
(fail) as rotas da ocorrência do escritório (spec 156 T7.3) > GET pede a lista do momento office [0.49ms]
 19 pass
 2 fail

$ bun test ./test/whatsapp-commands/driver-flow-actions.contract.ts ./test/whatsapp-commands/operator-flow-actions.contract.ts   # flow actions de HEAD
(fail) FlowActions do motorista — Minha viagem (spec 144 T015) > a lista é a do momento document: perde o tipo de parada, ganha o de galpão + nota [1.04ms]
(fail) FlowActions do operador — Viagens do armazém (spec 144 T016) > a lista é a do momento separation, pelo conjunto e não pelo stage [0.41ms]
 90 pass
 2 fail
```

Depois: os cinco arquivos verdes; `bun test ./test/trip-occurrence.contract.test.ts
./test/whatsapp-commands.contract.test.ts ./test/driver-trip.contract.test.ts` → `1117 pass, 0
fail`; contrato completo da API → `9762 pass, 25 skip, 0 fail` (199 arquivos; os 25 pulados são
anteriores); `typecheck` saída 0. Integração do WhatsApp, um por vez com `--env-file`:
`whatsapp-driver-flow-actions` 4/0 · `whatsapp-operator-flow-actions` 7/0. A prova contra o banco,
com os códigos reais, é a T1b.3.

### T1b.3 — CA00 contra o Postgres, com os códigos reais (2026-10-06)

Códigos conferidos em `src/trips/domain/trip.error.ts` antes do teste: `TripDocumentNotReachableError`
é `TRIP_DOCUMENT_NOT_REACHABLE` com **status 409** (a CA00 e a tarefa diziam `404` — o código real é
`409`, e é ele que o teste prende); `OccurrenceTypeNotSeparationError` `422
OCCURRENCE_TYPE_NOT_SEPARATION`; `OccurrenceTypeNotFieldError` `422 OCCURRENCE_TYPE_NOT_FIELD`.

`test/integration/occurrence-type-moments-registration.integration.ts` (na lista `test:integration`
do `package.json`, logo depois de `occurrence-type-requirement-modes`). Os tipos nascem pelo
`saveOccurrenceType` com `moments` — o mesmo caminho da rota de cadastro, provando a escrita do
conjunto na transação do tipo e a leitura de volta. Os casos de uso são os reais, com os
repositórios Drizzle: `registerDriverOccurrence`, `registerTripOccurrence` (com
`persistSeparationOccurrenceWithAttachment`) e a rota do lote do escritório
(`wireOccurrenceRoute`).

1. **Recusas:** motorista com tipo só `separation` na rota de nota → `{ code:
'TRIP_DOCUMENT_NOT_REACHABLE', status: 409 }`; separador com tipo só `document` na rota do galpão
   → `422 OCCURRENCE_TYPE_NOT_SEPARATION`; escritório com o mesmo tipo (sem `office`) → `422
OCCURRENCE_TYPE_NOT_FIELD`. Os três se repetem com uma **segunda conta** da mesma empresa — a que,
   no token, teria separador e motorista juntos — e a recusa é a mesma; nenhuma ocorrência gravada
   (`count = 0`). Limite dito: o papel vem do token (Keycloak), não do banco; o que este teste prova
   é que a guarda é do caso de uso, independente de quem chama. A política de cada rota, inalterada,
   segue provada pelos contratos de rota (`occurrences-route.contract.ts` "aceite 1",
   `me-routes.contract.ts`, `separator-role.contract.test.ts`).
2. **O mesmo id nas duas listas:** `separation + document` sai do catálogo com `moments:
['separation', 'document']`, `stage: 'separation'`, `flow: 'document'`; aparece na lista do
   separador (catálogo pelo momento `separation`, o filtro do WhatsApp do operador) e na do motorista
   (`listFieldOccurrenceTypes`) com o mesmo id; e os dois papéis o registram — duas ocorrências do
   mesmo `occurrence_type_id`, com `stage` `separation` e `delivery` (o momento de cada registro).

```text
$ cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-type-moments-registration.integration.ts
 2 pass
 0 fail
```

A execução vermelha que prova que o teste não é vazio são as duas mutações da T1b.5.

### T1b.4 — CA00b: as linhas da tabela sobre dado antigo (2026-10-06)

`test/integration/occurrence-type-moments-backfill.integration.ts` (na lista `test:integration`, logo
depois da T1b.3), no molde da T1.3: banco descartável migrado → desfaz só a T1b.1 pelo próprio
`rollback.sql` → grava tipos antigos (sem a tabela) → o migrador reaplica o `migration.sql` lido do
disco. Verifica as **linhas** de `company_occurrence_type_moments`, não as listas — a leitura
tolerante devolveria os mesmos conjuntos com a tabela vazia. Sementes (a tabela do plan + um tipo
aposentado):

| Semente (`stage` + `flow`)       | Linhas esperadas     |
| -------------------------------- | -------------------- |
| `separation` + `document`        | `separation`         |
| `separation` + `stop` (D-c)      | `separation`, `stop` |
| `delivery` + `document`          | `document`, `office` |
| `delivery` + `stop`              | `stop`, `office`     |
| `delivery` + `document`, inativo | `document`, `office` |

Depois reexecuta os cinco `INSERT`s lidos do disco e confere que nenhuma linha nova nasce (`ON
CONFLICT DO NOTHING`). `separation + document` não sai de nenhuma semente (só o operador monta).

```text
$ cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-type-moments-backfill.integration.ts
 1 pass
 0 fail
```

Prova de que não é vazio — o `INSERT` de `separation + stop → stop` arrancado do `migration.sql` só
para a execução (restaurado da cópia; `git status` limpo):

```text
-INSERT INTO "company_occurrence_type_moments" ("company_id", "occurrence_type_id", "moment") SELECT "company_id", "id", 'stop' FROM "company_occurrence_types" WHERE "stage" = 'separation' AND "flow" = 'stop' ...
error: expect(received).toEqual(expected)
@@ -4,3 +4,3 @@
      "separation",
-     "stop",
    ],
(fail) o backfill dos momentos sobre tipos antigos (spec 246 T1b.4, CA00b) > cada tipo antigo ganha as linhas da tabela do plan, inativo inclusive, e reexecutar não duplica [1650.17ms]
 0 pass
 1 fail
```

Sobre "nenhuma lista muda": o conteúdo de cada lista sobre esse dado é o da T1b.2 (separador =
tipos com `separation`; escritório = tipos com `office` = os `delivery` de hoje; nota do motorista =
tipos com `document` = os `delivery + document` de hoje). A única lista que muda é a do motorista
para o caso de borda `separation + stop` — ver a divergência registrada na T1b.2.

### T1b.5 — As duas mutações deixam a T1b.3 vermelha (2026-10-06)

Cada mutação foi aplicada a `acceptsOccurrenceMoment` (`src/shared/trip-occurrence.constant.ts`) só
para a execução, e o arquivo foi restaurado da cópia em seguida (`git status` limpo). Comando das
duas: `cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
./test/integration/occurrence-type-moments-registration.integration.ts`.

**(1) `includes(momento do registro)` → `moments.length > 0`** ("o tipo tem algum momento"). O
motorista registra o tipo só de galpão na rota de nota:

```text
-  return params.moments.includes(params.moment)
+  return params.moments.length > 0
error: expect(received).toEqual(expected)
- {
-   "code": "TRIP_DOCUMENT_NOT_REACHABLE",
-   "status": 409,
- }
+ "ACCEPTED"
(fail) cada registro no próprio momento, contra o Postgres (spec 246 T1b.3, CA00) > o momento que o papel não cobre não grava, com o código real — e a conta com os dois papéis recebe o mesmo [2672.46ms]
 1 pass
 1 fail
```

**(2) → "algum momento de rua"** (`document`, `stop` ou `office`). O motorista com tipo só de galpão
segue recusado (não há momento de rua), mas o separador registra o tipo só de nota no galpão:

```text
-  return params.moments.includes(params.moment)
+  return params.moments.some((moment) => moment !== OCCURRENCE_MOMENT.separation)
error: expect(received).toEqual(expected)
- {
-   "code": "OCCURRENCE_TYPE_NOT_SEPARATION",
-   "status": 422,
- }
+ "ACCEPTED"
(fail) cada registro no próprio momento, contra o Postgres (spec 246 T1b.3, CA00) > o momento que o papel não cobre não grava, com o código real — e a conta com os dois papéis recebe o mesmo [2677.69ms]
 1 pass
 1 fail
```

Restaurado: `2 pass, 0 fail`.

### T1b.6 — Tipo sem nenhum momento é recusado (API) (2026-10-06)

`assertOccurrenceMomentsAreWritable` recusa o conjunto vazio com `422
OCCURRENCE_TYPE_MOMENTS_REQUIRED` (`OccurrenceTypeMomentsRequiredError`, em
`occurrence-moment.error.ts`), antes de gravar — `PUT` com `moments: []`. Sem `moments`, o cadastro
nunca fica vazio: a criação grava o derivado de `stage`/`flow` e a edição mantém ou re-deriva
(T1b.1b). **A parte da tela** (o seletor múltiplo recusando o vazio) é a T5.3b, na Fase 5, por
escopo desta fase.

Contratos primeiro, vermelhos:

```text
$ bun test ./test/trip-occurrence/occurrence-moment.contract.ts ./test/trip-occurrence/occurrence-type-moments-write.contract.ts
(fail) o conjunto gravável (spec 246 T1b.1b) > conjunto vazio é recusado: o tipo não apareceria para ninguém (T1b.6) [0.74ms]
(fail) o cadastro grava o conjunto de momentos (spec 246 T1b.1b) > conjunto vazio é recusado antes de gravar [1.71ms]
 21 pass
 2 fail
```

Depois: `23 pass, 0 fail`; `typecheck` saída 0.

### Gates ao fechar a Fase 1b (2026-10-06, primeiro plano)

`git fetch`: nenhuma migration nova em `origin/staging` desde o começo da fase (a 246 segue no topo:
`20261006112823_occurrence_type_requirement_modes` → `20261006115725_occurrence_type_moments`).

| Gate                                                                         | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                              | sem mudanças                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `bun run typecheck`                                                          | saída 0 (todas as apps)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `./node_modules/.bin/prettier --check .` e `bun run format:check`            | "All matched files use Prettier code style!"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| contrato da API (`bun --env-file=../../.env.test test --timeout 120000`)     | `9766 pass, 25 skip, 0 fail` (199 arquivos); no fim da Fase 1 eram `9727 pass, 25 skip` — os 25 pulados são anteriores                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| integração, um arquivo por vez com `--env-file=../../.env.test`              | novos: `occurrence-type-moments-registration` 2/0 · `occurrence-type-moments-backfill` 1/0; tocados: `occurrence-type-requirement-modes` 1/0 · `occurrence-type-items-mode` 5/0 · `occurrence-type-leaves-document-behind` 4/0 · `occurrence-type-redelivery-policy` 2/0 · `occurrence-type-catalog-seed` 2/0 · `trip-field-authorship` 5/0 · `trip-occurrence-attachment` 6/0 · `stop-occurrence-photo` 8/0 · `whatsapp-driver-flow-actions` 4/0 · `whatsapp-operator-flow-actions` 7/0 · `trip-field-office` 25/0 · `current-driver-trip-concluded-window` 4/0 · `me-trip` 21/0 · `event-location-stamp` 23/0 · `trip-occurrence-type-items-read` 4/0 · `trip-occurrence-item-quantity` 5/0 · `trip-occurrence-correction` 8/0 · `trip-occurrence-case` 4/0 · `trip-auto-dispatch` 8/0 · `trip-detail-leaves-behind` 2/0 (pass/fail; nenhum pulado). A lista completa `test:integration` **não** foi rodada |
| `make migration-test ENV_FILE=.env.test` (Postgres de teste 127.0.0.1:65432) | `129 pass, 0 fail, 0 skip` em 8 arquivos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `bun run db:generate`                                                        | `no_changes`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `bun run build`                                                              | saída 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| painel: `bun run --cwd apps/frontend-transportada test`                      | `6943 pass, 0 fail` (33 arquivos) + `test:hooks` `582 pass, 0 fail`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| painel: `eslint .` com a app como cwd                                        | saída 0, `0 errors, 16 warnings` — todos `react-hooks/exhaustive-deps` em arquivos que esta fase não tocou                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| app do motorista: `bun run --cwd apps/frontend-driver test`                  | `1198 pass, 0 fail` (sem mudança de código nesta fase)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| API: `bun run lint`                                                          | saída 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Fase 1c — Produtos e quantidade mínima viram dado

### T1c.1 — Colunas, CHECKs e rollback (2026-10-06)

Migration `20261006123712_occurrence_type_quantity_minimums` (`db:generate --name`, depois cabeçalho e
`rollback.sql` à mão). Tipo: `photo_minimum_count smallint NOT NULL DEFAULT 1` (CHECK 1..5) e
`items_minimum_count smallint` nulo (CHECK `>= 1`; CHECK `items_minimum_count IS NULL OR items_mode =
'required'`). Nas duas exceções: `items_mode varchar(16)`, `photo_minimum_count smallint` e
`items_minimum_count smallint`, **nulas e sem padrão** (D-a), com CHECKs que aceitam nulo (vocabulário
de `items_mode`; 1..5; `>= 1`; `items_minimum_count IS NULL OR coalesce(items_mode, '') = 'required'`).
Nomes das exceções sem o prefixo `company_` (<= 62 caracteres). **Sem** CHECK `off ⇒ unset` nas
exceções. Constantes `OCCURRENCE_ITEMS_MODE.required` e `OCCURRENCE_PHOTO_MINIMUM_COUNT`
(`trip-occurrence.constant.ts`).

Contrato primeiro — `test/trip-schema/occurrence-type-minimum-counts.contract.ts`, contra o schema
sem as colunas:

```text
$ bun --env-file=../../.env.test test test/trip-schema.contract.test.ts
(fail) ... > foto nasce com mínimo 1, nunca nulo; produtos nulo = todos os itens
(fail) ... > as três CHECKs do mínimo existem, nomeadas
(fail) company_occurrence_type_contractor_overrides ... > as três colunas são nulas e sem padrão
(fail) company_occurrence_type_contractor_overrides ... > as CHECKs novas cabem em 63 caracteres ...
(fail) company_occurrence_type_recipient_overrides ... > as três colunas são nulas e sem padrão
(fail) company_occurrence_type_recipient_overrides ... > as CHECKs novas cabem em 63 caracteres ...
 251 pass
 6 fail
```

Com o schema: `257 pass, 0 fail`. `bun run db:generate` → `no_changes`. Contrato estático da ordem e do
rollback (`database-migration/occurrence-type-quantity-minimums.static.contract.ts`) e asserção contra
o Postgres (`occurrence-type-quantity-minimums.assertion.ts`, no `database-migration.integration.ts`):
antes do rollback há 13 CHECKs (2 da 241 + 11 desta) e 9 colunas; depois restam só
`company_occurrence_types_items_mode_check`, `company_occurrence_types_items_off_shape_check` e
`company_occurrence_types.items_mode`; o migrador reaplica e o estado completo volta.
`make migration-test ENV_FILE=.env.test` → `131 pass, 0 fail, 0 skip`.

**Achado — ordem dos rollbacks.** A CHECK `items_minimum_shape_check` do tipo lê `items_mode`; o
`rollback.sql` da 241 (`DROP COLUMN items_mode`) a derruba junto, e reaplicar a 241 não a recria. Na
primeira execução a asserção rodava depois da da 241 e viu 12 CHECKs em vez de 13. Rollbacks valem
em ordem inversa do histórico (a 246 antes da 241, como em produção); a asserção desta migration roda
**antes** da da 241. A asserção da T1.2 passou a filtrar `items_mode` só do tipo, porque as exceções
agora também têm a coluna.

### T1c.2 — O backfill do mínimo de foto, sobre dado antigo (2026-10-06)

`migration.sql` ganhou a ordem do backfill: `photo_minimum_count` nasce **nula** no tipo, o
`UPDATE "company_occurrence_types" SET "photo_minimum_count" = 1` roda e só então a coluna vira
`DEFAULT 1 NOT NULL`, antes das CHECKs. `items_mode` do tipo não é tocado e as colunas novas das
exceções ficam nulas (herdam). `db:generate` segue `no_changes` (o estado final é o mesmo).

**Divergência declarada.** A task fala em `photo_minimum_count = 1` "onde a foto é `required`". Com a
coluna `NOT NULL DEFAULT 1` num `ADD COLUMN` só, o `UPDATE` seria um no-op e nenhuma mutação o deixaria
vermelho; por isso a coluna nasce nula e o `UPDATE` cobre **todo** tipo (para tipo não `required` o 1 é
inerte: a quantidade só é lida com foto `required`). O valor final é o mesmo do plan.

`test/integration/occurrence-type-quantity-minimums.integration.ts` (na lista `test:integration`):
banco descartável migrado, `rollback.sql` da migration nova, semeia três tipos (foto `required`,
`optional`, `off` + produtos `off`) e uma exceção de contratante e uma de destinatário, e o migrador
reaplica o `migration.sql` do disco. Verifica o **valor da coluna**: os três tipos saem com
`photo_minimum_count = 1`, `items_minimum_count` nulo e `items_mode` como estava (`optional`, `optional`,
`off`); as duas exceções, com as três colunas nulas.

```text
$ bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-type-quantity-minimums.integration.ts
 1 pass
 0 fail
```

Mutações no `migration.sql` (restaurado depois de cada uma; `git diff` limpo contra a versão do passo):

```text
(1) arrancar o UPDATE do tipo
PostgresError: column "photo_minimum_count" of relation "company_occurrence_types" contains null values
(fail) os mínimos nascem sem mudar o que já está gravado (spec 246 T1c.2) > todo tipo antigo sai com ...
 0 pass / 1 fail
(2) o UPDATE passa a gravar também "items_mode" = 'optional' no tipo
error: expect(received).toEqual(expected)   # o tipo com items_mode 'off' voltou 'optional'
 0 pass / 1 fail
(3) UPDATE extra preenchendo photo_minimum_count = 1 nas exceções de contratante
error: expect(received).toEqual(expected)   # esperado null, recebido 1
 0 pass / 1 fail
```

O contrato estático (`occurrence-type-quantity-minimums.static.contract.ts`) agora prende a ordem
`ADD COLUMN` nula → `UPDATE` → `SET DEFAULT` → `SET NOT NULL` → CHECKs e exige um único `UPDATE`:
`bun test ./test/database-migration.contract.test.ts` → `90 pass, 4 skip, 0 fail` (os 4 pulados são
anteriores: os de banco desse arquivo, cobertos no `make migration-test`).
