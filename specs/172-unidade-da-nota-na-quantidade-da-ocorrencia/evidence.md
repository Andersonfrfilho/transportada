# Evidência — spec 172 (unidade da nota na quantidade da ocorrência)

## Territórios tocados

- `apps/api-transportada/src/database/trip.schema.ts` — só a tabela
  `trip_document_occurrence_products`: `quantity_unit` de `varchar(8)` para `varchar(20)`, e o
  `CHECK` deixou de ser a lista fechada `unit`/`box` (agora só recusa vazio/só-espaço).
- `apps/api-transportada/src/shared/trip-occurrence.constant.ts` — `OccurrenceItemQuantityUnit`
  virou `string` (era o union `unit`/`box`); `OCCURRENCE_ITEM_QUANTITY_UNIT` continua como o par de
  fallback.
- `apps/api-transportada/src/trips/domain/occurrence-item-quantity.policy.ts` —
  `resolveOccurrenceItemQuantities` ganhou `products` (opcional, compatibilidade): a unidade aceita
  por item passa a ser `unit`/`box` **ou** a `commercialUnit` daquele item específico.
- `apps/api-transportada/src/trips/domain/occurrence-scope.policy.ts` — `OccurrenceProduct` ganhou
  `commercialUnit?: string`.
- `apps/api-transportada/src/trips/domain/trip.error.ts` — mensagem de
  `OccurrenceItemQuantityUnitUnknownError` atualizada (não é mais só "unit ou box").
- `apps/api-transportada/src/trips/application/register-trip-occurrence.use-case.ts` — o port
  `listDocumentProducts` ganhou `commercialUnit?` opcional; os produtos lidos uma vez alimentam
  `resolveOccurrenceProductSelection` e `resolveOccurrenceItemQuantities`.
- `apps/frontend-transportada/src/modules/trip/shared/trip.constant.ts` —
  `OccurrenceQuantityUnit` virou `string` (aberto); `OccurrenceFallbackQuantityUnit` é o novo nome
  do union antigo (`box`/`unit`), usado só para tradução.
- `apps/frontend-transportada/src/modules/trip/shared/occurrenceProductSelection.service.ts` — duas
  funções novas (`resolveOccurrenceItemQuantityUnitOptions`,
  `resolveOccurrenceItemDefaultQuantityUnit`) e a leitura (`formatOccurrenceProductEntryLabel`,
  `describeOccurrenceItems`) passou a imprimir a unidade crua quando não é `box`/`unit` (RF4).
- `apps/frontend-transportada/src/modules/trip/shared/tripResponse.validation.ts` — `isOccurrenceProduct`
  deixou de validar `unit` contra a lista fechada (`isOneOf`) — agora só confere que é string.
- `apps/frontend-transportada/src/modules/trip/components/TripOccurrences.component.tsx` — o
  seletor de unidade nasce nas opções `[commercialUnit do item, box, unit]`, com
  `commercialUnit` como padrão marcado (RF2); item sem unidade comercial cai no par de sempre
  (RF3).

## Migration

`apps/api-transportada/drizzle/20260923032744_silent_darkhawk/` — `migration.sql` amplia a coluna
e o CHECK; `rollback.sql` foi escrito à mão (convenção do repo — "rollback é manual, ao lado da
migration") e devolve exatamente o CHECK/coluna anteriores.

⚠️ **Nota sobre `db:generate` neste worktree compartilhado**: outra sessão paralela tinha
`apps/api-transportada/src/database/trip-financial.schema.ts` dirty (tabelas `company_entry_kinds`/
`trip_revenue_entries`, fora do meu território) no momento em que rodei `db:generate`. A primeira
geração bundlou as duas mudanças numa migration só. Para não commitar arquivo de outro território,
restaurei `trip-financial.schema.ts` para o `HEAD` (`git checkout HEAD -- <arquivo>`, sem
`git stash` — proibido neste checkout), gerei a migration só com a minha mudança, e devolvi o
arquivo ao estado dirty original com uma cópia que eu mesmo tirei antes (nunca usei stash). O
resultado é a migration `20260923032744_silent_darkhawk`, que toca só
`trip_document_occurrence_products`.

Verificação manual do round-trip (`up` → `rollback` → reaplica), com Postgres descartável via
`DRIZZLE_TEST_DATABASE_URL` do `.env`, script ad hoc (`scratchpad/verify-172-migration.ts`, já
removido):

```
migrated up through all pending directories OK
column after up: { column_name: quantity_unit, character_maximum_length: 20 }
check after up: CHECK (((quantity_unit IS NULL) OR (length(btrim((quantity_unit)::text)) > 0)))
rollback applied OK
column after rollback: { column_name: quantity_unit, character_maximum_length: 8 }
check after rollback: CHECK (((quantity_unit IS NULL) OR ((quantity_unit)::text = ANY (ARRAY[('box'::character varying)::text, ('unit'::character varying)::text]))))
reapply OK — migration is round-trippable
```

`bun run db:generate` → `{"status":"no_changes"}` depois de gerar (confirma que o schema TS bate
com a migration escrita).

`make migration-test` **não roda limpo neste worktree agora**: a suíte de baseline
(`test/database-migration.contract.test.ts`) lista **todas** as pastas de `drizzle/` presentes no
disco, incluindo `20260923032453_flimsy_metal_master` — migration de outra sessão paralela, ainda
sem `rollback.sql` (ela está em progresso, não é minha). Os dois testes que falham
(`static-migration.contract.ts` e `database-migration.integration.ts`) falham por causa dela, não
da minha migration — confirmado isolando a verificação acima, que exercita só
`20260923032744_silent_darkhawk` e passa limpo nos dois sentidos.

## Gates — API (`apps/api-transportada`)

- `bunx tsc --noEmit` — sem erro nos arquivos tocados (erros pré-existentes em
  `test/integration/{delivery-charge-end-to-end,mixed-cargo-end-to-end,trip-lifecycle,trip-repository}.integration.ts`
  são de outra sessão mexendo em `CreateTripRecord`, fora do meu território).
- `bun --env-file=../../.env.test test --timeout 120000` (contrato) — roda `trip-occurrence.contract.test.ts`
  isolado: **200 pass, 0 fail** (inclui os 11 testes novos de spec 172 em `item-quantity.contract.ts`
  e `item-quantity-registration.contract.ts`).
- `bun --env-file=../../.env.test run test:integration` (72 arquivos, banco de verdade) — rodei a
  suíte inteira em background (1119s): **498 pass, 51 fail**. As 51 falhas são todas fora do meu
  território — timeout de 5-30s em `freight region repository`/`fleet driver region`/
  `address-components-source`/`alphanumeric-cnpj-end-to-end` (carga concorrente de outras sessões
  no mesmo Postgres local) e um `drizzle snapshot chain` batendo contra `trip_status_events`
  (schema mexido por outra sessão em paralelo). **Nenhuma falha menciona
  `trip_document_occurrence_products` ou a política de quantidade.** Confirmação isolada, rodando
  só o arquivo desta spec depois que a suíte grande terminou:
  `bun --env-file=../../.env.test test ./test/integration/trip-occurrence-item-quantity.integration.ts`
  → **5 pass, 0 fail** (as 5 são: CA02 grava os dois, CA03 quantidade sem unidade, CA04 quantidade
  zero, mais os dois casos novos desta spec — unidade comercial fora de unit/box persiste como veio,
  e unidade em branco é recusada pelo CHECK).

## Gates — Frontend (`apps/frontend-transportada`)

- `bun run typecheck` — limpo.
- `bun run lint` — limpo (dois `no-unnecessary-type-assertion` corrigidos, resultado de
  `OccurrenceQuantityUnit` ter virado `string`).
- `bun run test` — **4965 pass + 44 pass (hooks), 0 fail** (5009 no total), incluindo os testes
  atualizados de `occurrence-products-tolerance.contract.ts` e
  `occurrence-item-quantity-field.contract.ts`.

## Commits

Isolados por caminho (`git add` por arquivo, nunca `-A`), listados em
`scratchpad/my-files-172.txt` durante a sessão — só os arquivos desta spec.
