# Plano — Spec 215

## Por que duas fases

O Drizzle nomeia **todas** as colunas do schema em cada `insert`, com `default` nas que não recebem
valor (visto na 199: `insert into geocoded_addresses (…, "paid_refined_at", …) values (…, default,
…)`), e `.returning()` sem argumento lê todas. A API cria parada em
`drizzle-trip-stop-reconciliation.support.ts` com `.insert(tripStops)…returning()`.

O pre-deploy (`runPreDeploy`) roda as migrations **antes** de a versão nova assumir. Se uma única
versão tirasse as colunas do schema e do banco ao mesmo tempo, a instância antiga, ainda servindo,
nomearia colunas que já não existem: `42703` no vínculo de nota até a troca terminar.

Com a fase A em produção, nenhuma instância nomeia as colunas; a fase B pode apagá-las.

## Fase A — código

- `apps/api-transportada/src/database/trip.schema.ts`: remover `latitude`, `longitude`,
  `geocodingPrecision` de `tripStops` e os quatro `check`s (`trip_stops_coordinates_check`,
  `trip_stops_latitude_range_check`, `trip_stops_longitude_range_check`,
  `trip_stops_geocoding_precision_check`). Comentário curto no lugar: a coordenada é de
  `geocoded_addresses` pela `address_key`.
- Migration à mão `drizzle/<timestamp>_trip_stops_forget_dead_coordinates/`:
  - `snapshot.json` gerado do schema novo, `prevIds` encadeado no último snapshot de staging;
  - `migration.sql` sem efeito (um comentário `-- fase A da spec 215: colunas seguem no banco`);
  - `rollback.sql` sem efeito, com o mesmo comentário.
  - Receita e armadilhas: docs/ai-context § "Migration à mão é permitida".
- Contrato estático novo em `test/trip-schema/` (CA2), adicionado à lista do `package.json`.
- Comentários do RF3.
- O worker **não** muda: a cópia de `trip_stops` em `worker-transportada/src/database/routing.schema.ts`
  nunca declarou essas colunas.

## Fase B — banco

- Migration `drizzle/<timestamp>_trip_stops_drop_dead_coordinates/`:
  - `migration.sql`: `ALTER TABLE "trip_stops" DROP CONSTRAINT IF EXISTS …` (quatro) e
    `DROP COLUMN IF EXISTS "latitude"`, `"longitude"`, `"geocoding_precision"`;
  - `rollback.sql`: `ADD COLUMN` das três, nulas, com os mesmos tipos (`numeric(10,7)`,
    `numeric(10,7)`, `text`), e os quatro `CHECK`s com a definição original de
    `20260826015435_powerful_dakota_north/migration.sql`;
  - `snapshot.json` igual ao da fase A (o schema TS não muda), com `prevIds` encadeado.
- Integração do CA3 em `test/integration/`.

## Gates

- Fase A e fase B: typecheck, lint, os dois comandos de teste da API, `make migration-test`,
  `db:generate` = `no_changes`, commit isolado com caminhos explícitos e `--no-verify`.
- Fase B, **antes** de cada ambiente: RF2 (contagem = 0) e aprovação humana escrita.
- ⚠️ O banco de produção é o `Postgres-Hqfu`; o serviço "Postgres" é outro e dá número falso
  (memória do projeto). A contagem de produção sai do banco certo.

## Relação com outras specs

- 079, 159, 199: as três leituras erradas que a remoção impede de voltar.
- 195, 196, 198, 202: citam as colunas só para dizer que não são escritas; nenhuma passa a usá-las.
