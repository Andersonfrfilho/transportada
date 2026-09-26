# Plano — Spec 199

## Onde

- `apps/api-transportada/src/trips/infrastructure/drizzle-current-driver-trip.repository.ts`
  (`listStops`): troca `tripStops.latitude/longitude` por `geocodedAddresses.latitude/longitude`,
  com `leftJoin(geocodedAddresses, eq(geocodedAddresses.addressKey, tripStops.addressKey))`. É o
  mesmo casamento de `trip-stop-coordinates.support.ts`, mas `left` em vez de `inner`: a parada sem
  pino não pode sumir da tela do motorista.
- `apps/api-transportada/test/integration/me-trip.integration.ts`: caso novo (CA1).

## O que não muda

- Tipo `DriverTripStop` (`latitude: string | null`), rota, schema de resposta, app do motorista e
  painel. Nenhuma migration.

## Relação com outras specs

- **079** (T009/T012): registrou que as colunas nunca são escritas e fez o mapa ler
  `geocoded_addresses`. Esta spec aplica a mesma leitura ao motorista.
- **082 D2**: a distância na app já existe e já trata `null`; passa a ter dado.
- **084**: a correção manual do pino grava em `geocoded_addresses`; o motorista passa a ver o pino
  corrigido.
- **195/198** (em andamento em outra sessão): mexem no mesmo repositório e acrescentam campos
  diferentes. O conflito, se houver, é de texto.
