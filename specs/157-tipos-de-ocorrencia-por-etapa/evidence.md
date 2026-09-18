# Evidências — spec 157

## A regra confirmada (RF4)

Havia duas leituras em conflito no repositório:

- `occurrence.policy.ts` (spec 079 T020): "a rota do galpão não grava ocorrência de rua".
- `test/trip-occurrence/register.contract.ts` ("o escritório registra os dois grupos, e a
  permissão dele é trip.manage") e o comentário de `trip.routes.ts` ("o caso de uso o confere"),
  sem conferência nenhuma no caso de uso.

Venceu a primeira, pelo que o produto faz hoje:

| Papel           | `trip.manage` | `trip.report` | `trip.report-on-behalf` |
| --------------- | ------------- | ------------- | ----------------------- |
| `company-admin` | sim           | não           | sim                     |
| `operator`      | sim           | não           | sim                     |
| `separator`     | sim           | não           | não                     |
| `driver`        | não           | sim           | não                     |

(`resolveCompanyPermissions`, medido em 2026-09-18.)

- `company-admin` e `operator` registram ocorrência de rua em nome do motorista pela rota da
  spec 156 (`POST /trips/:id/documents/field-occurrences`). Fechar a rota do galpão não lhes tira
  nada.
- Quem ganharia com a rota do galpão aceitando rua é só o `separator` — a elevação que a política
  descreve.
- Os dois chamadores de `registerTripOccurrence` já oferecem só `separation`:
  `TripOccurrences.component.tsx:60` (tela do escritório) e
  `register-operator-trip-flow-actions.ts:503,548` (WhatsApp do operador).

O contrato da 079 foi reescrito para a regra nova, com o motivo no comentário.

## T1 — `GET /me/trips/current/occurrence-types`

Arquivos: `me-trip.routes.ts` (rota + dependência), `main.ts` (liga ao `listFieldOccurrenceTypes`
da L2 da spec 156).

Teste antes (red): `bun test ./test/driver-trip.contract.test.ts` → 3 falhas em "os tipos de
ocorrência do motorista (spec 157)" (rota inexistente). Depois (green): 152 pass com
`trip-occurrence`.

Contratos (`test/driver-trip/me-routes.contract.ts`):

- a rota fica sob `/me/trips/current`, pede `trip.report`, e o `authorize` real deixa o `driver` passar;
- o handler devolve só `{ id, name }`, com o `companyId` do token;
- conta sem cadastro de motorista recebe `DriverNotRegisteredError` sem consultar os tipos;
- os contratos existentes da árvore (`trip.read`/`trip.report` apenas, sem id de viagem, nenhuma
  rota do escritório alcançável pelo `driver`) continuam verdes com a rota nova.

## T2 — PWA do motorista

Arquivos: `driverTripClient.service.ts` (caminho), `driverTrip.types.ts` (`DriverOccurrenceType`
vira `{ id, name }`; `driverSelectableOccurrenceTypes` sai — o filtro é do servidor),
`DriverStopCard.component.tsx`, `test/driver-trip-smoke.helper.ts` (dublê da rota nova).

Teste antes (red): `bun test ./test/driver-trip.contract.test.ts` (frontend) → 2 falhas (caminho
`/company-settings/occurrence-types`). Depois: 119 pass.

## T3 — guarda de etapa no galpão

Arquivos: `trip.error.ts` (`OccurrenceTypeNotSeparationError`, 422
`OCCURRENCE_TYPE_NOT_SEPARATION`), `register-trip-occurrence.use-case.ts` (guarda logo após ler o
tipo, antes de gravar e de avisar), comentários de `trip.routes.ts` e `occurrence.policy.ts`.

Teste antes (red): `SyntaxError: Export named 'OccurrenceTypeNotSeparationError' not found`.
Depois: 69 pass em `trip-occurrence.contract.test.ts`.

- tipo de rua → 422 `OCCURRENCE_TYPE_NOT_SEPARATION`, `saveOccurrence` e notificador não chamados;
- tipo de galpão → grava e avisa;
- `notification.contract.ts` e `template-key.contract.ts` usavam tipo de rua no caso de uso do
  galpão (caminho que a regra fecha); os fixtures passaram a `separation` — o que eles testam
  (aviso e template) não depende da etapa.

## Gates

- `make check` (format:check + lint + typecheck + test + build): verde, 12.500 testes, 0 falhas.
- Smoke (`bun run smoke -- test/responsive.smoke.spec.ts -g motorista`): 3 passed, incluindo o
  novo "o motorista vê os tipos de ocorrência de rua da empresa" (dublê de
  `/me/trips/current/occurrence-types` em `driver-trip-smoke.helper.ts`).
- Print: `prints/driver-occurrence-types-mobile.png` (375×812) — o seletor abre com o tipo de rua.
- Não rodado: `test/integration/whatsapp-operator-flow-actions.integration.ts` (Postgres). O fluxo
  já só oferece `separation` (`register-operator-trip-flow-actions.ts:503,548`), então a guarda
  não muda o caminho exercitado ali.

## Revisão de design

Sem mudança visual: o seletor é o mesmo, e agora tem conteúdo. A degradação para lista vazia em
erro continua (fora do escopo, `spec.md`).
