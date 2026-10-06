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
