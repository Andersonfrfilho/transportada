# Tasks — 046

> Registro posterior: T001–T006 fecharam antes desta spec existir, e cada uma traz o commit que a
> fechou. T007–T009 estão abertas de verdade — dependem de ADR, e nenhuma delas é código antes disso.

## Fase 1 — Ficha e endereço

> 🤖 Modelo: `sonnet` (T001 é 🧠 — migration em tabela com dado pessoal, validar com `opus` antes)

- [x] **T001** — 🧠 Schema, migration e rollback.
      `src/database/fleet.schema.ts`, `drizzle/20260820002947_fleet_driver_address_and_dates/`.
      **Aceite:** `test/fleet-schema/drivers.contract.ts` cobre as nove colunas, os quatro CHECKs e o
      índice parcial de CNH; `make migration-test` verde. — `8beb89d`

- [x] **T002** — Fronteira HTTP.
      `fleet-request.schema.ts`, `fleet.mapper.ts`, `fleet.port.ts`,
      `drizzle-fleet-driver.repository.ts`.
      **Aceite:** `test/fleet-http/drivers.contract.ts` — aceita, recusa CEP de sete dígitos, UF
      minúscula sobe a caixa. — `8beb89d`

- [x] **T003** — Consulta de endereço no navegador.
      `fleet/shared/driverAddress.service.ts`, `fleet/hooks/useDriverAddressLookup.hook.ts`,
      `DriverAddressFields.component.tsx`.
      **Aceite:** `Promise.any` no CEP, `Promise.allSettled` na busca textual, debounce e
      `AbortSignal`. — `8beb89d`

## Fase 2 — O que era digitação livre e é lista

> 🤖 Modelo: `sonnet`

- [x] **T004** — Data é calendário do produto, não campo nativo.
      `FleetDateField`, `ProfileDateField` sobre `@/components/ui/date-picker`; o `type` que escolhia
      entre texto e data saiu dos dois invólucros — era por ele que o nativo entrava.
      **Aceite:** `test/design-system/date-picker.contract.ts` falha se um nativo reaparecer. —
      `281b0bf`

- [x] **T005** — Cidade é lista do IBGE.
      `fleet/shared/municipality.service.ts`, `DriverCityField.component.tsx`.
      **Aceite:** `test/fleet/driver-city-select.contract.ts` — grafia uniforme, o gravado vence a
      grafia do provedor, sem UF é digitável. — `b069ba4`

- [x] **T006** — Usuário vinculado é lista de vínculos.
      `fleet/shared/driverMembership.service.ts`, `DriverMembershipField.component.tsx`,
      `identity/queries/useCompanyUsers.query.ts`.
      **Aceite:** `test/fleet/driver-membership-select.contract.ts` — vínculo é o valor e a pessoa é o
      rótulo, suspenso não é oferecido, o gravado continua escolhível, sem `users.manage` é
      digitável. — `1905dc1`

## Fase 3 — Decisões abertas (ADR antes de código)

> 🤖 Modelo: `opus` 🧠 — as três são decisão estrutural, não implementação.

- [x] **T007** — 🧠 ADR: consulta de endereço no navegador ou proxy na API.
      `docs/adr/0037-o-endereco-do-motorista-nao-sai-inteiro-do-navegador.md`, **status `aceito`**.
      Decide: sai o mapa (e com ele a geocodificação de confirmação, que era o que mandava o endereço
      inteiro), sai o Nominatim (política que o navegador não deixa cumprir), ficam a consulta de CEP
      e o Photon, **não** há proxy.

- [x] **T007-A** — Executar a ADR-0037.
      Saem `buildMapEmbedUrl`, `locateAddress`, `GeoPoint`, `point`, `toPoint`, `toCoordinate`,
      `MAP_SPAN_DEGREES`, `LOCATE_DEBOUNCE_MS`, o `iframe` de `DriverAddressFields.component.tsx` e
      o provedor Nominatim.
      **Aceite:** `test/fleet/address-map-removed.contract.ts` — falha se um dos símbolos ou um dos
      dois destinos voltar ao bundle, e falha também se um dos três que ficaram desaparecer.

- [x] **T008** — 🧠 CSP com `connect-src`/`frame-src`, depois de T007-A.
      Requisito autônomo do §3 do baseline: hoje não há CSP em lugar nenhum do repositório. Depois da
      ADR-0037 a lista fecha em três destinos mais a origem do Keycloak, e o `frame-src` vira `'none'`
      — o `iframe` do mapa era o único do bundle (`checkLoginIframe: false`). A lista de municípios do
      IBGE entra na diretiva mesmo não sendo PII, senão o select de cidade quebra ao publicá-la.
      **Aceite:** contrato que falha se um destino externo do bundle não estiver na diretiva.

- [x] **T009** — 🧠 ADR: criptografia em repouso dos campos de pessoa física do motorista.
      `docs/adr/0039-a-ficha-do-motorista-se-criptografa-onde-ninguem-le.md`, **status `aceito`**.
      Decide: envelope A256GCM único para `birth_date`, `license_number`, endereço e telefone —
      justamente por não terem leitor, é o momento mais barato que vai existir; índice cego com HMAC
      para a unicidade da CNH; `tax_id`, `linked_tax_id`, `name` e `license_expires_at` ficam em
      claro, cada um com o motivo escrito. A janela que esta task pedia ("decidir antes de o MDF-e
      ler") **já estava fechada para o CPF**: `mdfe-payload.builder.ts:72` o lê hoje, e ele está em
      claro no payload congelado e no XML preservado.

## Fora deste `tasks.md`

O aviso de CNH a vencer (chave nova em `NOTIFICATION_TEMPLATE_KEY`, agendamento, cron) é feature
própria. O texto de ajuda que o prometia foi corrigido em `87d1067` — campo não promete o que o
produto não faz.

**Executar a ADR-0039** também é spec própria, e não tem um "T009-A" aqui de propósito: migração de
expansão, passo de backfill que sela pela aplicação, índice cego, contração **destrutiva com
aprovação humana** e os contratos de teste não caberiam como apêndice de uma task de decisão. A T007-A
existiu porque executar a ADR-0037 era **remoção**, de uma app só.
