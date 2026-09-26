# Feature 215 — A parada perde as colunas mortas

## Problema e resultado

`trip_stops.latitude`, `trip_stops.longitude` e `trip_stops.geocoding_precision` existem desde a
migration `20260826015435_powerful_dakota_north` e **nunca foram escritas** (spec 079 T009,
2026-09-02). A coordenada viva da parada mora em `geocoded_addresses`, casada pela `address_key`.

As colunas custaram três leituras erradas que devolviam vazio sem erro:

- o mapa da viagem (079 T012, corrigido lendo `geocoded_addresses`);
- `GET /me/trips/current` (199, corrigido do mesmo jeito);
- a pontualidade da foto (159, corrigido em `c3013a71b`, que parou de ler a parada).

Hoje nenhum código de produção as lê. Sobram o schema (`trip.schema.ts`), quatro `CHECK`s e
comentários que explicam por que não ler. Enquanto existirem, a próxima leitura errada é questão de
tempo: a coluna tem o nome certo e responde `null` sem reclamar.

Resultado: as três colunas e os quatro `CHECK`s saem do banco e do schema, sem perda de dado (estão
nulas em toda a base, e isso é conferido antes), sem janela de erro durante o deploy e com rollback
escrito.

## Fora do escopo

- Qualquer mudança em `geocoded_addresses` (sem tenant por decisão, ADR-0044).
- Colunas de coordenada de outras tabelas (`route_suggestion_stops` do worker, eventos de parada,
  comprovantes). Elas são escritas e lidas.
- Leitura nova de coordenada. A spec só remove.

## Histórias priorizadas

### P1 — Quem escreve código novo não acha uma coluna de coordenada que mente

**Given** a base sem as três colunas, **When** alguém procura a coordenada da parada no schema,
**Then** só encontra `address_key`, e o comentário do schema aponta para `geocoded_addresses`.

### P2 — O deploy não derruba a criação de parada

**Given** a API antiga ainda servindo enquanto a nova sobe, **When** a migration roda no pre-deploy,
**Then** nenhuma escrita em `trip_stops` falha por coluna inexistente.

## Requisitos funcionais

- **RF1** — Duas fases, em deploys separados (expandir/contrair):
  - **Fase A (código):** as três colunas e os quatro `CHECK`s saem do schema TS da API. Migration à
    mão com `snapshot.json` do schema novo e SQL **sem efeito** no banco (as colunas continuam lá,
    nulas e ignoradas). O Drizzle deixa de nomear as colunas em `insert`/`returning`.
  - **Fase B (banco):** só depois de a fase A estar em produção **e** em staging, migration que
    remove os quatro `CHECK`s e as três colunas, com `rollback.sql`. O snapshot não muda em relação à
    fase A.
- **RF2** — Antes da fase B, a contagem `select count(*) from trip_stops where latitude is not null
or longitude is not null or geocoding_precision is not null` é **0** no banco de cada ambiente
  (dev, staging, produção). Diferente de zero para tudo.
- **RF3** — Os comentários que hoje dizem "existem e nunca são escritas" passam a dizer que a
  coordenada da parada só existe em `geocoded_addresses` (`trip.port.ts`, `drizzle-trip.repository.ts`,
  `drizzle-current-driver-trip.repository.ts`, `trip-stop-coordinates.support.ts`).

## Requisitos não funcionais

- Migration destrutiva **não** é aplicada automaticamente: a fase B espera aprovação humana escrita
  por ambiente (constitution; CLAUDE.md "Regras que não se negociam").
- Nenhum log com coordenada.

## Casos extremos e falhas

| Caso                                             | Resultado                                                |
| ------------------------------------------------ | -------------------------------------------------------- |
| Contagem do RF2 diferente de zero em um ambiente | a fase B para naquele ambiente; investigar quem escreveu |
| Fase B aplicada com instância da fase anterior   | impedido pela ordem: B só entra com A já em produção     |
| Rollback da fase B                               | `rollback.sql` recria as colunas nulas e os `CHECK`s     |
| `db:generate` depois da fase A                   | `no_changes`; a fase A não pode deixar DROP pendente     |

## Critérios de aceite

- **CA1** — Fase A: `bun --env-file=../../.env run db:generate` devolve `no_changes`;
  `schema-snapshot.contract.ts` verde; `make migration-test` verde; os dois comandos de teste da API
  verdes; typecheck e lint verdes.
- **CA2** — Fase A: contrato estático novo reprova se `trip.schema.ts` voltar a declarar
  `latitude`/`longitude`/`geocodingPrecision` na tabela `trip_stops`.
- **CA3** — Fase B: `make migration-test` aplica, desfaz com `rollback.sql` e reaplica; integração
  contra Postgres prova que as colunas sumiram (`information_schema.columns`) e que criar parada,
  vincular nota e ler `GET /me/trips/current` continuam funcionando.
- **CA4** — RF2 registrado em `evidence.md` com a contagem de cada ambiente e a data.

## Dúvidas

Nenhuma bloqueante. A aprovação humana da fase B é gate de execução, não dúvida de especificação.
