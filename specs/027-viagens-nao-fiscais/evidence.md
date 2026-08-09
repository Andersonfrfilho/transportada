# Evidências — Feature 027

Formato de cada registro: task, comando rodado, saída relevante e o que ela prova. Nenhuma senha,
código de ativação, segredo de client, contato em claro ou dado fiscal real entra aqui.

## T001 — migration de expansão (`trips`, `trip_drivers`, `trip_documents`, `mdfe_manifests.trip_id`)

```
$ bun run db:check
$ drizzle-kit check --config drizzle.config.ts
Everything's fine 🐶🔥
```

`db:generate`/`db:check` limpos confirmam que o schema em `src/database/trip.schema.ts` bate com a
migration versionada em `apps/api-transportada/drizzle/20260805020005_trip_planning_expansion/`.
`mdfe_manifests.trip_id` nasceu nullable de propósito (ADR-0023) — a coluna vira `not null` só na
contração (T003, fora de escopo desta rodada, depende de validação em staging com dado real).

Gap encontrado e fechado nesta rodada: `test/mdfe-schema/manifests.contract.ts` ainda esperava a
lista de colunas de `mdfe_manifests` sem `trip_id` — sobrou de quando T001 foi implementado numa
sessão anterior. Corrigido (`trip_id` inserido entre `vehicle_id` e `status`, a posição real da
coluna) e confirmado na suíte completa abaixo.

## T002 — backfill de `trips`/`trip_drivers` a partir de `mdfe_manifests` pré-existentes

```
$ bun test ./test/database-migration.contract.test.ts   (DRIZZLE_TEST_DATABASE_URL apontando pro Postgres da infra local)
 12 pass
 0 fail
 359 expect() calls
Ran 12 tests across 1 file. [2.10s]
```

Essa suíte cobre três frentes:

1. `test/database-migration/static-migration.contract.ts` — a migration
   `20260805030010_trip_backfill_existing_manifests` está na ordem certa do diretório, é DML puro
   (nenhum `CREATE TABLE/TYPE/SEQUENCE`, nenhum `DROP TABLE/COLUMN/INDEX/SEQUENCE/TYPE/VIEW` de
   verdade — só `ON COMMIT DROP` da tabela temporária de mapeamento) e o `rollback.sql` reverte
   `mdfe_manifests.trip_id` para `null`, apaga as linhas de `trips`/`trip_drivers` criadas por ela e
   guarda a linha do journal (`__drizzle_migrations`) pelo par nome+hash exato.
2. `test/database-migration/trip-backfill.integration.ts` (novo, escrito nesta rodada) — aplica as
   migrations só até a expansão (via `runDatabaseMigrations({ migrationsFolder })` apontando pra um
   diretório temporário com o subconjunto certo), semeia um `mdfe_manifests` em `draft` e outro
   `authorized` (com `mdfe_manifest_drivers` só no autorizado) com `trip_id` ainda `null`, confirma
   isso, aplica o resto das migrations (incluindo o backfill) e prova:
   - os dois manifestos ganham `trip_id` preenchido;
   - a viagem do manifesto `draft` nasce com `status = 'open'`; a do `authorized` nasce `'closed'`
     (a viagem herda o status do manifesto: rascunho ainda não fechou o vínculo, manifesto que já
     saiu de rascunho já teve o processo fiscal assumido);
   - `trip_drivers` da viagem do manifesto autorizado tem exatamente a linha copiada de
     `mdfe_manifest_drivers` (`driver_id`, `driver_tax_id` batendo); a viagem do rascunho (sem
     condutor no manifesto de origem) não ganha nenhuma linha em `trip_drivers`.
3. `test/database-migration/database-migration.integration.ts` — suíte pré-existente, roda no mesmo
   `runDatabaseMigrations` e não regrediu.

Isso satisfaz o critério do task: "teste confere `trip_id` preenchido em todo manifesto
pré-existente."

## T003 — migration de contração (`mdfe_manifests.trip_id not null`)

**Não implementada nesta rodada — está fora de escopo por definição do próprio `tasks.md`.**
Depende de T002 confirmado em ambiente com dado real (staging) antes de rodar em produção; rodar a
contração contra dado sintético local não prova nada sobre o dado real que existe hoje em staging.

## T004 — isolamento de tenant para `trips`/`trip_drivers`/`trip_documents`

```
$ bun test ./test/trip-schema.contract.test.ts
 4 pass
 0 fail
 10 expect() calls
Ran 4 tests across 1 file. [46.00ms]
```

`test/trip-schema/tenant-safety.contract.ts` segue o padrão já usado em `fleet`/`mdfe`: cada uma
das três tabelas novas é varrida por índice/constraint que amarra a linha ao `company_id` do
tenant, provando que nenhuma query de negócio pode vazar linha de outra empresa por construção.

## T005 — `trip.policy.ts` (disponibilidade de veículo/condutor)

```
$ bun test ./test/trip-domain.contract.test.ts
 8 pass
 0 fail
 8 expect() calls
Ran 8 tests across 1 file. [8.00ms]
```

`src/trips/domain/trip.policy.ts` extrai a regra de `resolveManifestVehicle`/`resolveManifestCrew`
(`src/mdfe-manifests/application/mdfe-manifest-crew.service.ts`), mas **não** é uma cópia literal:
o original faz I/O (`repository.findVehicle`, `repository.listDrivers`); `domain/` neste repo é
"regras puras... sem I/O" (confirmado contra `src/fleet/domain/driver-vehicle-ownership.policy.ts`
como precedente real, não só a regra abstrata do `CLAUDE.md`). `resolveTripVehicle` e
`resolveTripCrew` recebem dado já resolvido (veículo candidato, lista de condutores candidatos) e
só decidem — a busca no repositório fica para a camada de aplicação (T006, fora de escopo).

`test/trip-domain/trip-policy.contract.ts` cobre, como o task pede:

- duplicidade de condutor na mesma tripulação → `TripDriverDuplicatedError`;
- condutor inativo → `TripDriverNotAvailableError`;
- veículo inexistente → `TripVehicleNotFoundError`; veículo não-tração ou inativo →
  `TripVehicleNotAvailableError` (paridade com o equivalente do manifesto);
- condutor não cadastrado na empresa → `TripDriverNotFoundError`;
- ordem pedida vira posição na tripulação, o primeiro é o motorista principal.

## T012 — emenda ao spec 013 e ao ADR-0016 apontando para o ADR-0023

`docs/adr/0016-fleet-drivers-and-mdfe-manifest.md:76` já trazia a nota de emenda ("Emendado pelo
ADR-0023...") de uma sessão anterior. Faltava a mesma nota no spec 013. Adicionado em
`specs/013-fleet-and-mdfe/spec.md`, dentro de "Fora do escopo", logo abaixo do item que a emenda
reverte ("o manifesto como agregado de viagem"):

```
> **Emenda (ADR-0023, spec 027 — viagens não fiscais):** a premissa "o manifesto é a viagem"
> acima foi revertida. `trips` passa a ser entidade própria, desacoplada de `mdfe_manifests`
> (`mdfe_manifests.trip_id` é FK opcional, não o inverso) — existem viagens sem MDF-e e viagens
> organizadas antes de todo CT-e da carga estar emitido. Ver
> `docs/adr/0023-trip-decoupled-from-mdfe-manifest.md` e `specs/027-viagens-nao-fiscais/spec.md`.
```

## T006 — use-cases de viagem (`src/trips/application/trip.use-case.ts`)

O `[NEEDS CLARIFICATION]` que bloqueava esta task foi resolvido com o usuário (ver `spec.md` §
Dúvidas, reescrita): nota cancelada/rejeitada depois do vínculo **não bloqueia nada e não
desvincula automaticamente**, mesmo já `delivered_at` — sem tratamento de domínio novo. Por isso
`trip.use-case.ts` não tem nenhuma regra para esse caso; o aviso (leitura de
`nfe_documents`/`cte_fiscal_documents`) fica para T010 (frontend), sem coluna nova.

```
$ bun test ./test/trip-application.contract.test.ts
 10 pass
 0 fail
 24 expect() calls
Ran 10 tests across 1 file. [53.00ms]
```

`test/trip-application/trip-use-case.contract.ts` cobre, com um repositório-dublê em memória:

- criar viagem resolvendo veículo de tração ativo e tripulação ordenada (reaproveita
  `resolveTripVehicle`/`resolveTripCrew` de T005 via o novo `trip-crew.service.ts`, no mesmo
  desenho de `mdfe-manifest-crew.service.ts` — busca em lote via `findVehicle`/`listDrivers`, nunca
  `findById` em loop);
- vincular nota por `nfeDocumentId` xor `freightCalculationId` (`assertTripDocumentReference`,
  nova regra pura em `trip.policy.ts`, espelhando o check `trip_documents_entity_xor_check` do
  banco como defesa em profundidade) — recusa com/sem as duas referências
  (`TRIP_DOCUMENT_REFERENCE_INVALID`);
  propaga sem engolir o conflito de "nota já viva em outra viagem" quando o repositório lança
  `TripDocumentAlreadyLinkedError` (409) — a detecção de fato (índice único condicional) é
  responsabilidade da infraestrutura (T007), mirando `DrizzleFleetVehicleRepository`'s
  `runGuarded`/`violatedUniqueConstraint`;
- desvincular nota não entregue (permitido) e recusar desvínculo de nota já entregue
  (`TripDocumentAlreadyDeliveredError`, 422) — exatamente os dois casos pedidos pelo `tasks.md`;
- marcar como entregue é idempotente (reclicar não falha nem regrava);
- encerrar viagem é idempotente (ADR-0017: mesmo padrão do `discard` de manifesto); qualquer
  mutação (vincular/entregar/desvincular) numa viagem já encerrada recusa com `TRIP_CLOSED` (422)
  — decisão de design desta rodada, não estava escrita no `spec.md`: encerrar é terminal, documentada
  no comentário de `TripClosedError` em `trip.error.ts`;
- `TRIP_NOT_FOUND` (404) quando a viagem não existe nesta empresa (isolamento de tenant, mesmo
  padrão de `findById` scoped por `companyId`).

Novos arquivos: `src/trips/application/trip.port.ts` (tipos + `TripRepositoryPort`, mesmo desenho
de `MdfeManifestRepositoryPort` — cada módulo define suas próprias leituras estreitas de
veículo/condutor em vez de importar `FleetVehicleRepositoryPort`/`FleetDriverRepositoryPort` de
outro módulo), `src/trips/application/trip-crew.service.ts`, `src/trips/application/trip.use-case.ts`.
Novos erros em `src/trips/domain/trip.error.ts`: `TripNotFoundError`, `TripClosedError`,
`TripDocumentReferenceInvalidError`, `TripDocumentNotFoundError`, `TripDocumentAlreadyLinkedError`,
`TripDocumentAlreadyDeliveredError`. Nova regra pura em `trip.policy.ts`:
`assertTripDocumentReference`.

Registrado em `apps/api-transportada/package.json` → `scripts.test` (a lista é explícita; teste
novo não roda se não entrar ali).

## T007 — `DrizzleTripRepository` (`src/trips/infrastructure/`)

Teste de integração escrito antes da implementação, seguindo o único padrão do repositório que
efetivamente exercita um repositório Drizzle contra Postgres real: `test/integration/*.integration.ts`
com banco descartável (`withDisposableDatabase`, o mesmo desenho de
`test/integration/billing-repository.integration.ts` — cria um banco `transportada_t007_<uuid>`,
roda `runDatabaseMigrations`, derruba o banco ao final). Os testes de infraestrutura "leves"
(`test/fleet-infrastructure`, `test/mdfe-infrastructure`) só cobrem query builders puros ou gateways
HTTP — nenhum dos dois módulos tem um `*-repository.integration.ts` próprio; `trips` ganhou o seu
porque o T007 pede explicitamente verificar a tradução de violação de constraint única, que só o
Postgres real reforça.

Arquivos novos: `src/trips/infrastructure/drizzle-trip.repository.ts` (implementa
`TripRepositoryPort` inteiro — `close`, `create`, `deliverDocument`, `findById`, `findDocumentById`,
`findVehicle`, `linkDocument`, `listDrivers`, `releaseDocument`), `src/trips/infrastructure/trip.mapper.ts`,
`src/trips/infrastructure/trip-queryable.type.ts` (mesmo desenho de `mdfe-queryable.type.ts`).
`linkDocument` captura a violação dos dois índices condicionais (`trip_documents_live_nfe_document_unique`
e `trip_documents_live_freight_calculation_unique`) via `violatedUniqueConstraint` e traduz para
`TripDocumentAlreadyLinkedError` (409) — mesmo padrão de `DrizzleFleetVehicleRepository`/
`DrizzleMdfeManifestRepository` com `runGuarded`. `releaseDocument` reforça a mesma regra do domínio
na cláusula `where` (`isNull(deliveredAt) and isNull(releasedAt)`) — defesa em profundidade: mesmo
que o use-case (T006) já cheque antes, uma corrida entre a leitura e o update não passa despercebida,
o `update` simplesmente não encontra linha e devolve `null`.

```
$ DRIZZLE_TEST_DATABASE_URL="postgresql://transportada:transportada@localhost:55432/transportada" \
  bun test ./test/integration/trip-repository.integration.ts
 1 pass
 0 fail
 23 expect() calls
Ran 1 test across 1 file. [969.00ms]
```

O teste cobre, contra Postgres real: criação da viagem com tripulação ordenada por posição;
isolamento de tenant em `findById`/`findVehicle`/`listDrivers`/`findDocumentById`/`close` (empresa
vizinha nunca enxerga, sem lançar — só filtra); vínculo de nota crua (`nfeDocumentId`) e de frete já
calculado (`freightCalculationId`) na mesma viagem; conflito 409 ao tentar vincular a mesma nota (ou
o mesmo frete) já vivo em outra viagem, nos dois índices condicionais separadamente; entrega
(`deliverDocument`); `releaseDocument` recusado (devolve `null`) depois de entregue; `releaseDocument`
aceito antes de entregue; e a prova de que, uma vez liberado, o mesmo frete pode migrar para uma
segunda viagem — o índice único só enxerga linhas com `released_at is null`.

Registrado em `apps/api-transportada/package.json` → `scripts["test:integration"]` (lista explícita
separada de `scripts.test`; `test:integration` exige Postgres vivo, por isso não entra no gate
padrão `bun run check`/`make check`).

```
$ source .env && cd apps/api-transportada && bun run test:integration
 61 pass
 2 skip
 0 fail
 647 expect() calls
Ran 63 tests across 18 files. [20.52s]
```

Rodar `test:integration` só com `DRIZZLE_TEST_DATABASE_URL`/`DATABASE_URL` isolados falha em
`server.integration.ts` (sobe um subprocesso `bun src/main.ts` completo, que precisa do `.env`
inteiro — Keycloak, RabbitMQ etc.) — não é regressão, é a env parcial da minha primeira tentativa;
com o `.env` completo carregado (`source .env`), a suíte inteira passa, `trip-repository.integration.ts`
incluído.

Infra local subida via `make up` (Postgres/MinIO/Keycloak/RabbitMQ/Mailpit, todos `Healthy`) para
rodar este teste — deixada de pé para as próximas tasks da mesma rodada (T008 em diante também
precisam de Postgres).

## Verificação de regressão — suíte completa de `apps/api-transportada`

```
$ bun run test
 1541 pass
 2 skip
 0 fail
 6767 expect() calls
Ran 1543 tests across 71 files. [775.00ms]
```

`bun run test` usa a lista explícita do `package.json` (inclui agora
`test/trip-application.contract.test.ts`) — é o gate real, diferente de `bun test` sem argumento,
que também descobre `test/user-activation.contract.test.ts` e
`test/user-administration-http.contract.test.ts` (WIP não registrado de outra feature/sessão, com
módulos ainda inexistentes) e falha 36 vezes por módulo faltante, sem nenhuma relação com `trip`
— confirmado varrendo a saída completa por "trip": nenhum resultado.

`bunx tsc --noEmit` (rodado de novo após T006) só mostra os mesmos 4 erros pré-existentes, sem
relação com esta feature, em `test/fixtures/user-activation-http.fixture.ts`,
`test/fixtures/user-administration-http.fixture.ts` e
`test/user-activation/password-handoff.contract.ts` — baseline de outra feature, não tocado aqui;
zero erros mencionando `trip`.

`bunx eslint` limpo (`--max-warnings=0`, sem saída) em `src/trips` e nos testes novos
(`test/trip-application`, `test/trip-application.contract.test.ts`), além dos arquivos de T002/T005.

Após T007: `bunx tsc --noEmit` repetido mostra os mesmos 4 erros pré-existentes de outra feature
(zero relacionados a `trip`); `bunx eslint src/trips test/integration/trip-repository.integration.ts
--max-warnings=0` sem saída (limpo); `bun run test` (gate padrão, sem Postgres) continua
`1541 pass / 0 fail` — o repositório novo só é exercitado por `test:integration`, que roda à parte.

## T008 — rotas HTTP de viagem (`src/trips/presentation/`)

Teste de contrato HTTP escrito seguindo o único padrão real do repositório para rota nova
(`test/fleet-http/*.contract.ts` + `test/fixtures/fleet-http.fixture.ts` +
`test/fixtures/fleet-http-payload.fixture.ts`): dependências fake em memória (rastreando chamadas
via `structuredClone`), roteadas por `createTripRoutes`/`createRouter`/`createRequestHandler`
reais, com `authentication.authenticate()`/`tenantContext.resolveCompany()` fake mas
`AuthorizationService` real — sem Postgres, então entra em `scripts.test`, não em
`scripts["test:integration"]`.

Arquivos novos: `src/trips/presentation/trip-request.schema.ts` (schemas Zod `.strict()`),
`src/trips/presentation/trip.schema.ts` (funções `parse*` envolvendo `parseBody`),
`src/trips/presentation/trip.routes.ts` (`createTripRoutes`, 5 rotas via `defineRoute`).
`src/shared/api.constant.ts` ganhou `API_TRIPS_PATH = '/trips'`. `src/main.ts` ganhou a
composição (`DrizzleTripRepository` → `createTripUseCase` → `createTripRoutes`) dentro de
`createApplicationRoutes`.

Três decisões de design fechadas nesta rodada, sem estarem escritas explicitamente em `spec.md`/
`plan.md` além do que segue:

1. **Mínimo de 1 condutor na criação.** `spec.md` linha 66 exige "mínimo 1" condutor, mas T006 não
   impôs a regra em domínio/aplicação (`trip.use-case.ts`/`trip-crew.service.ts` aceitavam
   `driverIds: []`, delegando tudo à resolução de tripulação). Fechado na fronteira HTTP:
   `createTripSchema` usa `driverIds: z.array(z.uuid()).min(1).max(MAX_TRIP_DRIVERS)`
   (`MAX_TRIP_DRIVERS = 10`, comentado com a origem), espelhando exatamente o mesmo padrão de
   `mdfe-manifest-request.schema.ts` (`driverIds: z.array(z.uuid()).min(1).max(MAX_DRIVERS_PER_MANIFEST)`)
   e coerente com o teto de `MAX_DRIVERS_PER_TRIP = 10` já existente (não exportado) em
   `src/database/trip.schema.ts`.
2. **Uma única policy `fleet.manage` para as 5 rotas.** Confirmado em `spec.md` § Dúvidas:
   "Permissão: `fleet.manage` — sem papel novo por enquanto." Diferente de `fleet`/`mdfe-manifests`
   (que separam `fleet.read`/`fleet.manage`), viagem não tem nenhuma rota de leitura no contrato
   fechado (ver item 3), então não existe policy de leitura a separar — `TRIP_MANAGE_POLICY` é a
   única, aplicada às 5 rotas.
3. **Nenhuma rota `GET /trips`/`GET /trips/:id` implementada.** A seção "Contratos/API/eventos" de
   `plan.md` lista exatamente 6 endpoints fechados: `POST /trips`, `POST /trips/:id/documents`,
   `POST /trips/:id/documents/:documentId/deliver`, `DELETE /trips/:id/documents/:documentId`,
   `POST /trips/:id/close` (todos T008) e `POST /trips/:id/mdfe-manifests` (T009). Nenhum GET está
   no contrato fechado. Decisão conservadora desta rodada: **não inventar** rota de leitura fora do
   contrato — T008 implementa só os 5 endpoints de escrita listados. **Gap sinalizado, não
   resolvido**: T010 (frontend) vai precisar listar/detalhar viagens; alguém vai ter que decidir se
   isso é uma rota `GET` nova (exige voltar ao `plan.md`) ou se o frontend deriva o estado de outra
   fonte (ex.: os próprios manifestos/eventos). Não decidido aqui.

```
$ bun test ./test/trip-http.contract.test.ts
 18 pass
 0 fail
 54 expect() calls
Ran 18 tests across 1 file. [42.00ms]
```

`test/trip-http/create.contract.ts` cobre: criação com tripulação e veículo, tomando a empresa do
token (não do body — payload com `companyId` estranho é rejeitado, 400); recusa de tripulação vazia
e de campo desconhecido (`.strict()`); recusa de tripulação com mais de 10 condutores; propagação
de `TripVehicleNotAvailableError` (422) do domínio sem ser engolida pela rota.

`test/trip-http/documents.contract.ts` cobre: vínculo por `nfeDocumentId` e por
`freightCalculationId` (o XOR em si é regra de domínio de T005/T006, não duplicada aqui — a rota só
repassa o par nulo/preenchido do body); propagação de `TripDocumentReferenceInvalidError` (422),
`TripDocumentAlreadyLinkedError` (409, nota/frete já vivo em outra viagem) e
`TripDocumentAlreadyDeliveredError` (422, tentativa de liberar nota já entregue); entrega
(`POST .../deliver`) e liberação (`DELETE .../:documentId`) com os dois parâmetros de rota
(`id`, `documentId`) extraídos e passados corretamente; `id`/`documentId` fora do formato UUID
canônico nunca casa a rota (404, não 400 — o `matchRoute` já filtra antes do handler).

`test/trip-http/close.contract.ts` cobre: encerramento com sucesso; propagação de
`TripNotFoundError` (404) e `TripClosedError` (422, ADR-0023 — encerrar é terminal); path não-UUID
nunca casa a rota.

`test/trip-http/security.contract.ts` cobre: as 5 rotas recusam com 403/`FORBIDDEN` quando o
contexto não tem `fleet.manage` (nenhuma delas é liberada por outra permissão, diferente do padrão
`fleet.read` de outros módulos); corpo com campo fora do schema declarado é recusado (400).

Registrado em `apps/api-transportada/package.json` → `scripts.test` (lista explícita).

```
$ bun run test
 1559 pass
 2 skip
 0 fail
 6821 expect() calls
Ran 1561 tests across 72 files. [732.00ms]
```

```
$ bunx tsc --noEmit
(mesmos 4 erros pré-existentes de outra feature — test/fixtures/user-activation-http.fixture.ts,
test/fixtures/user-administration-http.fixture.ts (x2), test/user-activation/password-handoff.contract.ts;
zero erros mencionando trip)
```

```
$ bunx eslint src test drizzle.config.ts eslint.config.js --max-warnings=0
(sem saída — limpo)
```

Nenhuma regressão: `bun run test` foi de `1541 pass`/`71 files` (fechamento de T007) para
`1559 pass`/`72 files` (T008 acrescenta 18 testes em 1 arquivo novo — bate exatamente).

## T009 — `POST /trips/:id/mdfe-manifests` (delega ao use-case existente de mdfe-manifests)

Duas partes: (1) conectar `tripId` (já existente na coluna `mdfe_manifests.trip_id` desde T001,
mas completamente desconectado das camadas de aplicação/infraestrutura/apresentação do módulo
`mdfe-manifests`) através de porta → mapper → repositório Drizzle → use-case → rota de criação
direta; (2) a rota nova em si, que delega ao use-case existente injetando `tripId`/`vehicleId`/
`driverIds` já resolvidos da viagem — exatamente como fechado em `plan.md`: "substitui a criação
direta de manifesto quando originada de uma viagem; internamente delega ao use-case existente de
criação de manifesto, injetando `tripId`, `vehicleId` e `driverIds` já resolvidos da viagem."

**Parte 1 — fiação de `tripId`** (campo `readonly tripId: string | null` acrescentado em):
`src/mdfe-manifests/application/mdfe-manifest.port.ts` (`MdfeManifest`, `CreateMdfeManifestHeader`),
`src/mdfe-manifests/infrastructure/mdfe-manifest.mapper.ts` (`mapManifest`),
`src/mdfe-manifests/infrastructure/drizzle-mdfe-manifest.repository.ts` (`insertManifest`),
`src/mdfe-manifests/application/mdfe-manifests.use-case.ts` (`CreateMdfeManifestFields`, `create()`),
`src/mdfe-manifests/presentation/mdfe-manifests.routes.ts` (`serializeManifest` inclui `tripId`; a
rota `POST /mdfe-manifests` de criação direta agora injeta `tripId: null` explicitamente no `parse`,
com comentário "criação direta nunca nasce de uma viagem" — quebra a igualdade estrutural que antes
permitia repassar o body do Zod direto como `manifest`).

**Parte 2 — rota nova e delegação**: arquivo novo
`src/mdfe-manifests/application/create-trip-mdfe-manifest.use-case.ts` —
`createTripMdfeManifestUseCase({ manifests, trips })` busca a viagem (`trips.get`), deriva
`driverIds` de `trip.drivers.map(d => d.driverId)` (já ordenado por posição na origem — T007 usa
`.orderBy(asc(tripDrivers.position))`) e `vehicleId`/`tripId` de `trip.vehicleId`/`trip.id`, então
chama `manifests.create(...)` — o use-case de criação já existente, sem reimplementar nenhuma regra
de elegibilidade de documento/agrupamento de cidades/totais. `CreateTripMdfeManifestFields` é
`Omit<CreateMdfeManifestFields, 'driverIds' | 'tripId' | 'vehicleId'>` — o corpo HTTP não pode
enviar esses três campos.

Schema Zod: `createTripManifestSchema` em `mdfe-manifest-request.schema.ts` é
`createManifestSchema.omit({ driverIds: true, vehicleId: true })` (reaproveita todas as regras de
validação existentes em vez de duplicá-las) + `parseCreateTripManifestRequest` em
`mdfe-manifest.schema.ts`. Rota `POST /trips/:id/mdfe-manifests` em `trip.routes.ts`
(`TRIP_MDFE_MANIFESTS_PATH`), policy `mdfe.manage` (não `fleet.manage` — é uma operação de
manifesto, a mesma permissão que a criação direta já exige) e serializador local
`serializeMdfeManifestDetail` (convenção confirmada em T009/T008: cada `*.routes.ts` define seu
próprio `serialize*`, sem importar o de outro módulo, mesmo importando tipos/schemas dele — precedente
`cte-issuance.routes.ts` importando de `cte-batches`). Composição em `src/main.ts`:
`createTripMdfeManifest = createTripMdfeManifestUseCase({ manifests: mdfeManifests, trips })`,
passado a `createTripRoutes`.

```
$ bun test ./test/trip-http.contract.test.ts
 21 pass
 0 fail
 64 expect() calls
Ran 21 tests across 1 file. [56.00ms]
```

`test/trip-http/mdfe-manifest.contract.ts` (3 testes novos) cobre: criação a partir da viagem,
confirmando que `driverIds`/`vehicleId`/`tripId` no `manifest.create` são derivados da viagem (não
do body) e que o body aceito no HTTP tem só os campos do manifesto sem tripulação/veículo;
"nota sem CT-e" recusada — propagação de `MdfeManifestDocumentsBlockedError` (422,
`MDFE_MANIFEST_DOCUMENTS_BLOCKED`) do use-case existente, sem duplicar a regra de elegibilidade,
igual à rota de criação direta; corpo tentando enviar `driverIds` é recusado (400,
`INVALID_REQUEST`) pelo `.strict()` do schema — reforça que a fronteira barra a tentativa de a UI
escolher tripulação numa criação vinda de viagem.

`test/trip-http/security.contract.ts` ganhou a rota nova na verificação de 403 sem permissão
(sem `mdfe.manage`, que `NO_PERMISSIONS` também não tem) — comentário do describe atualizado para
não afirmar mais que uma única policy cobre toda a superfície de viagens.

Fixtures ajustadas para a nova coluna `tripId` (obrigatória em `MdfeManifest`/
`CreateMdfeManifestHeader`, presente em toda leitura/gravação): `MANIFEST` em
`test/fixtures/mdfe-http.fixture.ts` ganhou `tripId: null`; `fields()`/o objeto `manifest` esperado
em `test/mdfe-application/manifests.contract.ts` ganharam `tripId: null`; `test/mdfe-http/manifests.contract.ts`
teve o `manifest` esperado em `createCalls` ajustado com `tripId: null`. `test/fixtures/trip-http-payload.fixture.ts`
ganhou `MDFE_MANIFEST_DETAIL`, `CREATE_TRIP_MDFE_MANIFEST_BODY`, `tripMdfeManifestsPath` e as
constantes de id associadas; `test/fixtures/trip-http.fixture.ts` ganhou a dependência
`createTripMdfeManifest` e `mdfe.manage` no `COMPANY_CONTEXT` padrão.

```
$ bun run test
 1562 pass
 2 skip
 0 fail
 6831 expect() calls
Ran 1564 tests across 72 files. [714.00ms / 662.00ms em reexecução]
```

```
$ bunx tsc --noEmit
(mesmos 6 erros pré-existentes de outra feature em WIP não commitada — identity/invitation,
test/fixtures/user-activation-http.fixture.ts, test/fixtures/user-administration-http.fixture.ts,
test/user-activation/password-handoff.contract.ts; zero erros mencionando trip/mdfe-manifest)
```

```
$ bunx eslint src test drizzle.config.ts eslint.config.js --max-warnings=0
(sem saída — limpo)
```

```
$ bunx prettier --check <arquivos tocados por T009>
(sem saída após --write nos 3 arquivos que o Prettier reformatou:
create-trip-mdfe-manifest.use-case.ts, trip-http.fixture.ts, security.contract.ts)
```

Nenhuma regressão: `bun run test` foi de `1559 pass`/`72 files` (fechamento de T008) para
`1562 pass`/`72 files` (T009 acrescenta 3 testes no arquivo `test/trip-http/mdfe-manifest.contract.ts`,
mais 0 arquivos novos de teste no total — o arquivo já existia sendo criado nesta mesma rodada,
listado em `test/trip-http.contract.test.ts`).

## T009b — `GET /trips` (lista paginada/filtrável) e `GET /trips/:id` (detalhe com status fiscal

derivado)

Fecha o gap sinalizado em T008: `plan.md` § Contratos/API/eventos ganhou os dois endpoints de
leitura nesta rodada, sem alterar nenhum dos 6 endpoints já fechados. Duas decisões de design,
seguindo precedente já existente no repositório em vez de inventar convenção nova:

1. **Paginação por cursor (keyset), não `sortBy`/`sortDirection`/`filters[]`.** Confirmado por
   busca no repositório: esse trio de query params citado em `apis.md` não tem nenhuma
   implementação real em nenhum módulo. O padrão real é o de `mdfe-manifests` (`GET
/mdfe-manifests`): cursor opaco `<ISO-8601>::<uuid>` via `encodeKeysetCursor`/
   `decodeKeysetCursor` (`src/shared/keyset-cursor.support.ts`), ordenação fixa
   `desc(createdAt), desc(id)`, filtros como chaves de query flat (`statusEq`, `vehicleIdEq`,
   `driverIdEq`, `createdFrom`, `createdUntil`). Replicado identicamente em `trip.port.ts`
   (comentário deixado no arquivo explicando a divergência do padrão documentado) e
   `trip.query.ts` (`buildTripListFilters`).
2. **`fiscalStatus` da nota/frete vinculado é derivado por `leftJoin` em tempo de leitura, nunca
   persistido em `trip_documents`.** `readTripDetail` (`drizzle-trip.repository.ts`) faz dois
   `leftJoin` (`nfeDocuments`, `freightCalculations`), cada um por `companyId` + a FK nullable
   correspondente — a constraint `trip_documents_entity_xor_check` já garante que só um lado é
   não-nulo por linha. `mapTripDocumentDetail` (`trip.mapper.ts`) resolve
   `fiscalStatus = nfeDocumentStatus ?? freightCalculationStatus`, com `throw` defensivo
   (`TRIP_DOCUMENT_FISCAL_STATUS_MISSING`) se os dois vierem nulos (não deveria acontecer dado o
   XOR do banco).

Filtro `driverIdEq` usa `exists` correlacionado via `sql` tagged template
(`tripDriverExistsCondition` em `trip.query.ts`) — precedente de `billingItemExistsExpression()`
em `drizzle-cte-batch-item.repository.ts` — porque `trips`↔`fleetDrivers` é N:N via
`trip_drivers` sem combinador `exists()`/`inArray` pronto no repositório. Comentário deixado no
código: nenhum índice em `trips` cobre esse filtro hoje (aceito como característica de
performance, não bloqueante).

Rotas novas em `trip.routes.ts` (`GET /trips`, `GET /trips/:id`) usam `TRIP_READ_POLICY =
{permission: 'fleet.read', scope: 'company'}` — permissão já existente, ao lado da
`TRIP_MANAGE_POLICY` (`fleet.manage`) das 5 rotas de escrita de T008/T009. `parseTripList`
(`trip.schema.ts`) segue o mesmo padrão local de `parseIsoDateTime` duplicado por schema
(confirmado presente em `freight.schema.ts`, `cte-batch.schema.ts`, `nfe-imports.schema.ts` — não
existe helper compartilhado para isso em `request-parsing.service.ts`).

```
$ bunx tsc --noEmit
test/fixtures/user-activation-http.fixture.ts(138,32): error TS2307: Cannot find module '../../src/identity/presentation/user-activation.routes.js' or its corresponding type declarations.
test/fixtures/user-administration-http.fixture.ts(205,32): error TS2307: Cannot find module '../../src/identity/domain/company-user.error.js' or its corresponding type declarations.
test/fixtures/user-administration-http.fixture.ts(216,5): error TS2307: Cannot find module '../../src/identity/presentation/user-administration.routes.js' or its corresponding type declarations.
test/user-activation/password-handoff.contract.ts(12,17): error TS2307: Cannot find module '../../src/identity/application/activate-invitation.use-case.js' or its corresponding type declarations.
(mesmos 4 erros pré-existentes de feature 026 WIP não commitada; zero erros mencionando trip)
```

```
$ bun test ./test/trip-http.contract.test.ts ./test/trip-application.contract.test.ts
 40 pass
 0 fail
 116 expect() calls
Ran 40 tests across 2 files. [59.00ms]
```

`test/trip-http/list.contract.ts` (4 testes, novo) cobre: listagem sem filtro devolvendo página +
cursor; repasse de todos os filtros (`statusEq`, `vehicleIdEq`, `driverIdEq`, `createdFrom`,
`createdUntil`) + `cursor`/`limit` explícitos para o use-case; recusa (400) de query desconhecida
(`companyId` no query string, `statusEq` inválido, `limit` fora de 1–100, `cursor`/datas
malformados, UUIDs inválidos em `vehicleIdEq`/`driverIdEq`); 403 sem `fleet.read`/`fleet.manage`.

`test/trip-http/detail.contract.ts` (4 testes, novo) cobre: detalhe com documentos (incluindo
`fiscalStatus`) e condutores; path não-UUID nunca casa a rota (404); propagação de
`TripNotFoundError` (404, tenant errado ou id inexistente); 403 sem `fleet.read`/`fleet.manage`.

`test/trip-application/trip-use-case.contract.ts` ganhou 1 teste novo: delegação de `list()` ao
repositório, companyId/cursor/filtros/limit repassados sem transformação.

```
$ DATABASE_URL="postgresql://transportada:transportada@localhost:55432/transportada" bun test ./test/integration/trip-repository.integration.ts
 1 pass
 0 fail
 34 expect() calls
Ran 1 test across 1 file. [722.00ms]
```

`test/integration/trip-repository.integration.ts` ganhou, dentro do teste único já existente: (a)
duas asserções logo após os dois `linkDocument` (nota e frete) confirmando `fiscalStatus:
'authorized'`/`'snapshotted'` vindos do `leftJoin`, nunca de uma coluna persistida; (b) um bloco de
`list()` ao final cobrindo `statusEq` (viagem fechada exclusa), `vehicleIdEq` (as duas viagens do
veículo), `driverIdEq` (só a viagem com aquele condutor na tripulação), paginação por cursor
(página de 1 item, segunda página com item diferente, `nextCursor` não nulo/nulo conforme
esperado) e isolamento de tenant (`otherCompanyId` sempre `{items: [], nextCursor: null}`).

```
$ bunx eslint src test drizzle.config.ts eslint.config.js --max-warnings=0
(sem saída — limpo)
```

```
$ bunx prettier --check <16 arquivos tocados por T009b>
All matched files use Prettier code style!
(após --write nos 6 arquivos que o Prettier reformatou: trip.port.ts, trip.use-case.ts,
trip.query.ts, trip.routes.ts, trip-use-case.contract.ts, trip-repository.integration.ts —
puramente formatação, revalidado com typecheck/lint/testes depois do --write, sem mudança de
comportamento)
```

```
$ bun run test
 1571 pass
 2 skip
 0 fail
 6859 expect() calls
Ran 1573 tests across 72 files. [806.00ms]
```

Nenhuma regressão: `bun run test` foi de `1562 pass` (fechamento de T009) para `1571 pass` — T009b
acrescenta 9 testes (4 em `list.contract.ts` + 4 em `detail.contract.ts`, ambos novos arquivos
importados pelo agregador `test/trip-http.contract.test.ts`, + 1 em
`trip-application/trip-use-case.contract.ts`).

## T010 — Frontend: módulo `trip` (listagem, detalhe, vínculo de nota)

`apps/frontend-transportada/src/modules/trip/` — segue o subconjunto do contrato de
`docs/frontend/data-tables.md` documentado no ADR-0024 (4 colunas reais, sem endpoint de lote no
backend, paginação por cursor genuína): sem gerenciamento de coluna, sem seleção em massa, sem
construtor de filtro avançado — ordenação client-side só na página corrente, filtros de valor
único mapeados 1:1 para os parâmetros do backend, zebra striping, contador de resultado e estados
vazio/proibido.

Arquivos: `shared/` (tipos, cliente HTTP, adapters de resposta, guards, tabela/paginação,
filter-pills, validação de formulário, constantes, rota), `hooks/` (`useTripWorkspace.hook.ts`,
`useTripTable.hook.ts`, `useTripCreation.hook.ts`, `useTripDocumentLinkForm.hook.ts`),
`components/` (`TripFilters`, `TripTable`, `TripCreationPanel`, `TripDetail`), `pages/`
(`TripWorkspace.page.tsx`, `TripDetail.page.tsx`), `styles/trip.module.css`, `locales/` (pt-BR
acentuado + inglês). Wiring em `src/modules/shared/i18n/i18n.service.ts` (registro dos locales) e
`src/main.tsx` (item de navegação, resolução de rota `/trips`/`/trips/:id`, grupo `fiscal`).

Testes novos (test-first quebrado nesta rodada — implementação já existia de uma sessão anterior;
os contract tests abaixo foram escritos e rodados de verdade contra o código já escrito, e um bug
real foi encontrado e corrigido antes de fechar a task):

`test/trip/trip.fixture.ts` (novo) — IDs sintéticos, fixtures `TRIP`/`SECOND_TRIP`/`TRIP_DETAIL`/
`TRIP_DOCUMENT`/`TRIP_DOCUMENT_DETAIL`/`TRIP_PAGE`/`CREATE_TRIP_BODY` tipadas com
`as const satisfies`, `loadFutureModule`.

`test/trip/client-and-controller.contract.ts` (novo, 8 testes) — cobre `tripClient.service.ts`
(list/create/get/close/linkDocument/deliverDocument/releaseDocument sobre requests autenticadas
`no-store`, incluindo o método `DELETE` de `releaseTripDocument`), propagação do código de erro da
API em vez de falha genérica, `tripResponse.validation.ts` (dto estrito, payload malformado
rejeitado) e `createTripController` de `useTripWorkspace.hook.ts` (gating por `fleet.read`/
`fleet.manage`, nenhuma mutação chega ao cliente sem `fleet.manage`).

`test/trip/table-and-form.contract.ts` (novo, 4 testes) — `tripTable.service.ts` (ordenação
asc/desc/none por coluna, paginação por cursor com histórico e volta), `tripFilterPills.service.ts`
(descreve só os filtros ativos, limpa um campo por vez) e `tripForm.service.ts`
(`validateTripForm`/`buildLinkTripDocumentBody`).

`test/trip.contract.test.ts` (novo, agregador) importa os dois arquivos acima.
`apps/frontend-transportada/package.json` — `"test"` ganhou `test/trip.contract.test.ts` no fim da
lista.

**Bug real encontrado pelo contract test e corrigido**: em
`src/modules/trip/shared/tripResponse.validation.ts`, `isDetail()` chamava `isTrip(value)` e
`isDocumentDetail()` chamava `isDocument(value)` — mas essas funções internas refaziam
`hasExactKeys` contra o conjunto de chaves mais estreito (`TRIP_KEYS`/`TRIP_DOCUMENT_KEYS`), que
falha sempre porque o objeto composto carrega chaves extras (`documents`/`drivers`, ou
`fiscalStatus`). Ou seja, `tripDetailFromApi` nunca conseguia validar um payload real de viagem
com pelo menos um documento vinculado. Corrigido extraindo `isTripFields`/`isDocumentFields` (só a
checagem de campo, sem `hasExactKeys`) e reutilizando-as nos dois níveis.

```
$ bun test test/trip.contract.test.ts
bun test v1.3.14 (0d9b296a)
 10 pass
 0 fail
 74 expect() calls
Ran 10 tests across 1 file. [25.00ms]
```

```
$ bun run typecheck
$ tsc --noEmit
(sem saída — limpo)
```

```
$ bun run lint
$ eslint .
(sem saída — limpo)
```

Ajustes de tipagem/lint feitos para fechar os gates: `TripTable.component.tsx` e
`TripDetail.component.tsx` retornavam `styles.statusBadge` direto num branch (com
`noUncheckedIndexedAccess`, acesso a módulo CSS tipado por index signature vira
`string | undefined`) — corrigido envolvendo em template literal, igual ao padrão já usado em
`MdfeManifestTable.component.tsx`. `tripFilterPills.service.ts` usava desestruturação com
`_campo` para omitir chave (dispara `no-unused-vars`, sem `argsIgnorePattern` configurado no
`eslint.config.mjs`) — reescrito com `omitFilterKeys` via `Object.fromEntries`. Import não usado de
`Trip` removido de `tripClient.service.ts`.

```
$ bun run test
bun test v1.3.14 (0d9b296a)
 626 pass
 0 fail
 3475 expect() calls
Ran 626 tests across 16 files. [176.00ms]
```

A suíte completa (todos os módulos, incluindo `test/design-system.contract.test.ts`) passou de
616 para 626 testes. O contrato `icon.contract.ts` ("gives every icon-only button an accessible
name") pegou os botões de paginação de `TripTable.component.tsx` — o botão "próxima página" tem o
`<Icon>` como último filho antes do texto visível, mesmo padrão que a regra trata como botão
"ícone só" — corrigido acrescentando `aria-label` explícito nos dois botões de paginação.

```
$ bun run build
$ vite build
✓ 415 modules transformed.
✓ built in 1.03s
PWA v1.3.0 — 11 entries precached, dist/sw.js e dist/workbox-e4022e15.js gerados
```

## T011 — Frontend: modal de CT-e pendente na ação "emitir MDF-e" da viagem

`apps/frontend-transportada/src/modules/trip/` — depende de T009 (`POST
/trips/:id/mdfe-manifests`, já recusa nota sem CT-e autorizado) e T010 (módulo `trip`, já
concluídos). Trabalho desta rodada: gate de UI que impede o clique em "Emitir MDF-e" de navegar
quando alguma nota vinculada ainda não tem CT-e autorizado, mostrando um modal com a lista das
notas pendentes e um atalho para a emissão de CT-e; quando todas as notas estão com CT-e
autorizado, navega direto para a tela de manifestos MDF-e (`/mdfe-manifests`), que já cobre a
criação do manifesto (T009).

Novos arquivos:

- `src/modules/trip/shared/tripMdfeGate.service.ts` — `selectPendingCteDocuments`/`canIssueMdfe`,
  função pura sobre `TripDocumentDetail.cteAuthorized`.
- `src/modules/trip/shared/tripNavigation.service.ts` — `navigateToMdfeManifests`/
  `navigateToNfeWorkspace`/`createBrowserWorkspaceNavigator`, mesmo padrão de navegação por
  `pushPath`/`rememberWorkspace`/`dispatchPopState` usado no resto do app (sem router).
- `src/modules/trip/components/TripMdfePendingDialog.component.tsx` — modal em portal
  (`document.body`), mesmo motivo do `CteEmissionDialog` de `nfe-workspace` (overlay não pode
  herdar `transform` de transição de página); reutiliza `useModalDialog` (foco, `Escape`, trava de
  scroll).

`TripDetail.component.tsx` ganhou o botão "Emitir MDF-e" (só quando `canManageTrips`, viagem
aberta e há ao menos um documento vinculado) e o gate: `handleIssueMdfe` abre o modal se houver
`selectPendingCteDocuments(trip.documents).length > 0`, senão navega direto para
`/mdfe-manifests`.

**Decisão de escopo (P3):** o botão não chama a rota de criação de manifesto diretamente — ele
navega para a tela `/mdfe-manifests` já existente (T009 já cobre a criação server-side). Chamar a
rota direto exigiria coletar aqui os mesmos campos que a tela de manifestos já pede (motorista
condutor, dados do manifesto), duplicando UI; navegar é a integração mínima que ainda cumpre a
regra de negócio (bloquear com nota pendente).

```
$ bun test test/trip.contract.test.ts
bun test v1.3.14 (0d9b296a)
 13 pass
 0 fail
 82 expect() calls
Ran 13 tests across 1 file. [26.00ms]
```

Dois `describe` novos em `test/trip/table-and-form.contract.ts`: `trip mdfe gate contract`
(`selectPendingCteDocuments`/`canIssueMdfe` — bloqueia com 0 ou com pelo menos uma nota pendente,
libera só quando todas as notas estão `cteAuthorized: true`) e `trip navigation contract`
(`navigateToMdfeManifests`/`navigateToNfeWorkspace`, spy de `WorkspaceNavigator` conferindo a
ordem exata `pushPath` → `rememberWorkspace` → `dispatchPopState`, mesmo padrão usado em
`test/nfe-workspace/cte-emission-profile-access.contract.ts`).

```
$ bun run typecheck
$ tsc --noEmit
(sem saída — limpo)
```

```
$ bun run test
bun test v1.3.14 (0d9b296a)
 629 pass
 0 fail
 3483 expect() calls
Ran 629 tests across 16 files. [180.00ms]
```

Nenhuma regressão: de `626 pass`/`3475 expect` (fechamento de T010) para `629 pass`/`3483 expect`.

### E2E (Playwright) — exigência explícita da task

Dois testes novos em `test/responsive.smoke.spec.ts`, com mock de API dedicado em
`test/trip-smoke.helper.ts` (mesmo padrão de `cte-batch-smoke.helper.ts`): uma viagem com duas
notas (uma `cteAuthorized: true`, outra `false`) e uma viagem com todas as notas autorizadas.

```
$ VITE_SMOKE_AUTH_BYPASS=true playwright test --grep "MDF-e"
Running 2 tests using 1 worker
  ✓  1 viagem com nota sem CT-e bloqueia a emissão do MDF-e num modal, sem navegar (379ms)
  ✓  2 viagem com todas as notas com CT-e autorizado emite o MDF-e sem exibir o modal (374ms)
  2 passed (7.3s)
```

```
$ VITE_SMOKE_AUTH_BYPASS=true playwright test
Running 32 tests using 1 worker
  ... (30 testes pré-existentes) ...
  ✓  31 viagem com nota sem CT-e bloqueia a emissão do MDF-e num modal, sem navegar (379ms)
  ✓  32 viagem com todas as notas com CT-e autorizado emite o MDF-e sem exibir o modal (374ms)
  32 passed (18.4s)
```

Suíte completa de smoke E2E: 32/32, sem regressão nas 30 pré-existentes.

**Nota operacional (para quem reproduzir):** o `playwright.config.ts` sobe frontend e API reais via
`webServer` e espera-os nas portas `PLAYWRIGHT_API_PORT`/`PLAYWRIGHT_FRONTEND_PORT` (default
`53001`/`53000`, que batem com `.env` da infra local — `make up`). O script `smoke` do
`package.json` já usa `ENV_FILE=${ENV_FILE:-../../.env}` por padrão — **não** `.env.test`: usar
`.env.test` (portas `53101`/`53100`, infra dedicada de `make e2e-up`) faz a API subir na porta
errada para o que o Playwright está esperando, e o `webServer` estoura o timeout de 60s sem nenhum
teste rodar. Foi exatamente esse engano que bloqueou esta rodada até ser diagnosticado — a infra de
`make e2e-up` não é usada por este smoke, a infra local de `make up` (já em execução) é suficiente
e é o que o script espera.

Três ajustes de seletor descobertos só ao rodar o E2E de verdade (esperado — é exatamente o que a
task pede em vez de só teste de contrato): `getByRole('heading', { name: 'Viagens' })` colidia com
o wordmark do cabeçalho e a legenda da tabela (`level: 1` resolve); mesma colisão em "Detalhe da
viagem" (`h1` da página vs. `h2` do painel); o botão "Fechar" existe duas vezes no modal (ícone com
`aria-label` e botão de rodapé com texto) — o teste usa o botão do `footer`.

## Pendências desta rodada

- **T003** (contração `not null`) — não implementada; depende de validação em staging com dado
  real, fora do alcance de uma sessão local.
