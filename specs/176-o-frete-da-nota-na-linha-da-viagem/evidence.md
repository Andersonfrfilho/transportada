# Evidência — spec 176 (frete da nota na linha da viagem)

## O que mudou

### Backend (`apps/api-transportada`)

- `src/trips/domain/trip-document-freight.policy.ts` (novo): política pura que decide o frete de
  uma nota da viagem — `measured` (cálculo guardado em `freight_calculations`), `estimated`
  (previsão pela parametrização vigente, reaproveitando `resolveDocumentFreight` de
  `nfe-documents/domain/document-freight.policy.ts` — a mesma conta da listagem de notas, spec 176
  RF1) ou `missing` (ausência, nunca zero).
  - ⚠️ **Lacuna documentada, não inventada**: no caminho `measured`, `freight_calculations.rule_snapshot`
    (`createFreightRuleSnapshot`) **não congela o nome da regra** — só `freightRuleId`,
    `freightRuleVersionId`, percentual e limites. Não existe hoje, em nenhuma tabela, o nome
    congelado no momento do cálculo. A política devolve `freightRuleName: null` nesse caminho em vez
    de buscar o nome atual do cadastro (`freight_rules.name`), que contaria uma história diferente
    da que o valor guardado conta (o pedido explícito do usuário: "o valor guardado e o nome têm de
    contar a mesma história"). Coberto pelo primeiro teste do contrato abaixo.
- `src/trips/application/trip.port.ts`: `TripDocumentDetail` ganha `freightAmount`,
  `freightRuleName` e `freightSource`.
- `src/trips/infrastructure/trip.mapper.ts`: `mapTripDocumentDetail` recebe `freight` já resolvido
  e o expõe nos três campos novos.
- `src/trips/infrastructure/drizzle-trip.repository.ts` (`readTripDetail`):
  - a query de `documentRecords` ganhou `freightCalculationTotalAmount` e, só para o caminho direto
    (nota com `nfeDocumentId`), três colunas de participante (`freightDestinationCityCode`,
    `freightDestinationState`, `freightSenderTaxId`) via `left join` em `nfeParticipants`/`nfeAddresses`
    — **a mesma query**, nenhuma consulta a mais por nota;
  - `loadActiveFreightRules` (nova função): as regras ativas de percentual da empresa, **uma
    consulta por leitura da viagem** — mesmo molde de `loadActiveFreightRules` em
    `drizzle-nfe-document.repository.ts` (`freight_rules` é configuração, poucas linhas);
  - cada nota chama `resolveTripDocumentFreight` em memória, sem ida ao banco por documento.
- `src/shared/monetary-redaction.service.ts`: `redactTripDocumentMoney` passa a cortar também
  `freightAmount` sem `trip.financials` — `freightRuleName` fica (é regra aplicada, não valor),
  mesmo padrão que `redactNfeDocumentMoney` já usa para a listagem de notas.
- `src/trips/presentation/trip.routes.ts`: `serializeTripDocumentDetail` publica os três campos.

### Frontend (`apps/frontend-transportada`)

- `src/modules/trip/shared/trip.types.ts`: `TripDocumentDetail` ganha `freightAmount?`,
  `freightRuleName?` e `freightSource?` (todos opcionais — API anterior não os manda).
- `src/modules/trip/shared/trip.constant.ts`: as três chaves entram em
  `TRIP_DOCUMENT_DETAIL_OPTIONAL_KEYS` (o guard de chave fechada é o que já derrubou a tela inteira
  em staging em 22/09 por causa de um campo desconhecido — `occurrence-marker-tolerance.contract.ts`).
  Novo `TRIP_DOCUMENT_FREIGHT_SOURCES = ['measured', 'estimated', 'missing']`.
- `src/modules/trip/shared/tripResponse.validation.ts`: `isDocumentDetail` valida os três campos
  como opcionais, com a mesma tolerância dos outros campos de spec 078 D2.
- `src/modules/trip/components/TripStopList.component.tsx`: a linha da nota mostra
  `stops.cargoValue` (a mercadoria, agora rotulada — antes saía sem rótulo, colada ao lado de
  outros números) e, ao lado, `stops.freight.amount` com o selo `stops.freight.estimated` quando a
  fonte é previsão, `stops.freight.rule` com o nome quando disponível, e `stops.freight.missing`
  quando não há frete calculado. Nunca `R$ 0,00`.
- `src/modules/trip/locales/trip.locale.json` e `trip.en.locale.json`: `stops.cargoValue` e
  `stops.freight.{amount,estimated,missing,rule}` em pt-BR e en.

## Por que reaproveitar, não recalcular

RF1 pediu para reaproveitar `resolveDocumentFreight` (a mesma conta da coluna `freightAmount` da
listagem de notas, `ScannedNfeDocument`). A política nova (`trip-document-freight.policy.ts`) chama
essa função diretamente — não existe uma segunda implementação da conta de percentual/mínimo/máximo
neste código. O que é novo é só a decisão de qual fonte usar (`measured` vs `estimated` vs
`missing`) e a leitura em lote sem N+1.

## Gates

### API — typecheck, lint

```
$ bun run --cwd apps/api-transportada typecheck   # bunx tsc --noEmit -> sem erro
$ bun run --cwd apps/api-transportada lint        # bunx eslint ... --max-warnings=0 -> sem erro
```

### API — contrato (sem banco)

```
$ bun --env-file=../../.env.test test --timeout 120000 \
    ./test/trip-schema.contract.test.ts ./test/trip-stops.contract.test.ts \
    ./test/trip-documents.contract.test.ts ./test/trips.contract.test.ts \
    ./test/trip-domain.contract.test.ts ./test/trip-application.contract.test.ts \
    ./test/trip-infrastructure.contract.test.ts ./test/trip-http.contract.test.ts \
    ./test/trip-fiscal-readiness.contract.test.ts ./test/trip-valuation.contract.test.ts \
    ./test/freight-http.contract.test.ts ./test/freight-schema.contract.test.ts \
    ./test/nfe-documents.contract.test.ts
# 1128 pass, 0 fail, 3896 expect() calls
```

Contrato novo, `trip-domain/trip-document-freight.contract.ts` (5 testes): cálculo guardado sem
inventar nome; previsão com regra ativa e nome; sem cálculo e sem regra → `missing`; cálculo
rejeitado sem nota direta → `missing`; nota sem `issuedAt` → `missing` mesmo com regra e valor.

Contrato novo, `trip-http/money-redaction.contract.ts` (2 testes adicionados): `freightAmount`
some sem `trip.financials`, `freightRuleName`/`freightSource` continuam; `freightAmount` aparece
com `trip.financials`.

### API — integração (com banco), o segundo comando que a integração exige

Postgres local do Docker (porta 65432, `make up`) está com I/O error nesta máquina (nota já
registrada na memória da sessão — "Banco de teste local quebrado"). Subi um Postgres 18 nativo
descartável (`initdb`/`pg_ctl`, `LC_ALL=C` — sem isso o Postgres 18 do Homebrew recusa subir com
`postmaster became multithreaded during startup`) na porta 65433 e apontei
`DRIZZLE_TEST_DATABASE_URL` para ele:

```
$ DRIZZLE_TEST_DATABASE_URL=postgresql://transportada@127.0.0.1:65433/transportada \
    bun test --timeout 120000 ./test/integration/trip-detail-query-count.integration.ts
# 2 pass, 0 fail, 49 expect() calls
```

Prova CA06: `largeSelectCount === smallSelectCount` — 1 parada/1 nota e 40 paradas/200 notas emitem
o **mesmo número de `select`s** mesmo com a consulta de regras ativas de frete a mais (ela é
company-scoped, não por nota nem por parada).

⚠️ **Não rodei o `test:integration` completo (84 arquivos)**: a suíte inteira depende de
RabbitMQ/MinIO/Keycloak reais (`make up`), que esta sessão não sobe — a sessão principal está
mexendo em `deploy/osrm/data/` e `scripts/` neste worktree e eu não deveria tocar infraestrutura
compartilhada. Rodei o único arquivo que exercita o código que mudei
(`trip-detail-query-count.integration.ts`, only Postgres), que é justamente a prova de CA06. Os
outros 83 arquivos de integração não tocam `drizzle-trip.repository.ts` nem
`trip-document-freight.policy.ts`. Pendência a declarar ao usuário: rodar o `test:integration`
inteiro antes do merge, com a infra completa no ar.

Além do teste de contagem, rodei os outros integration tests de `trips` que só precisam de
Postgres (sem fila/storage/Keycloak):

```
$ DRIZZLE_TEST_DATABASE_URL=postgresql://transportada@127.0.0.1:65433/transportada \
    bun test ./test/integration/trip-repository.integration.ts \
    ./test/integration/trip-detail-close-fields.integration.ts \
    ./test/integration/trip-detail-occurrence-marker.integration.ts \
    ./test/integration/trip-fiscal-readiness.integration.ts
# 12 pass, 0 fail, 82 expect() calls
```

### Frontend — typecheck, lint, contrato

```
$ bun run --cwd apps/frontend-transportada typecheck   # tsc --noEmit -> sem erro
$ bun run --cwd apps/frontend-transportada lint        # eslint . -> sem erro
$ bun test ./test/trip.contract.test.ts
# 1511 pass, 0 fail, 18890 expect() calls
```

Contrato novo, `trip/document-freight-tolerance.contract.ts` (6 testes): API anterior sem os
campos passa; `measured` com valor e sem nome; `estimated` com valor e nome; ausência (`missing`);
`freightSource` fora do vocabulário é recusado; `freightAmount` numérico (não string/nulo) é
recusado.

## Pendências / fora do escopo

- **Revisão de design (CA07)**: não feita nesta rodada — pendente print em 375px e desktop
  (web.md §15). Sinalizar ao usuário antes de fechar a spec.
- **Nome de regra ausente no caminho `measured`**: gap real do domínio (rule_snapshot não congela
  nome), documentado acima e coberto por teste — não é bug desta implementação, é lacuna pré-existente
  em `freight_calculations`. Se o produto decidir fechar o buraco, a mudança é migration aditiva em
  `freight_calculations` (ex.: `frozen_rule_name`) fora do escopo desta spec (RF/CA não pediram
  schema change).
