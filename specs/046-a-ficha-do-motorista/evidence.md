# 046 — Evidência

> Registro posterior: os números abaixo foram colhidos em 2026-08-20, com todas as tasks fechadas já
> em `HEAD`. **Não há vermelho-antes registrado para nenhuma task** — nem para as duas que nasceram de
> contrato: `b069ba4` e `1905dc1` trazem o contrato e o serviço no mesmo commit, então o histórico não
> prova a ordem e a saída do vermelho não foi preservada. Essa ausência é ela mesma a evidência do
> desvio de processo que a `spec.md` declara no topo, e reconstruir o vermelho agora seria inventá-lo.

## T001 — Schema, migration e rollback

`drizzle/20260820002947_fleet_driver_address_and_dates/migration.sql` — nove `add column`, um
`create unique index ... where length("license_number") > 0` e quatro CHECKs. Aditiva: nenhum
`drop`, nenhum `not null` retroativo sem `default`.

```
$ make migration-test
73 pass · 0 fail · 825 expect() calls · 11.16s
```

O gate inclui `test/database-migration/fleet-constraints.assertion.ts`, que exercita cada CHECK
contra o banco descartável.

## T002 — Fronteira HTTP

```
$ bun test ./test/fleet-http.contract.test.ts ./test/fleet-schema.contract.test.ts
92 pass · 0 fail · 314 expect() calls
```

## T003 — Consulta de endereço no navegador

Coberta pelos gates do frontend abaixo. O que o código garante e o teste fixa: `Promise.any` nos dois
provedores de CEP, `Promise.allSettled` nos dois de busca textual, `SEARCH_DEBOUNCE_MS = 400`,
`LOCATE_DEBOUNCE_MS = 900`, mínimo de cinco caracteres e `AbortSignal` por tecla.

## T004 — Data é calendário do produto

`test/design-system/date-picker.contract.ts` varre `src/**/*.tsx` fora de `src/components/ui/` e
falha se um campo de data nativo reaparecer. Verde no gate do design system abaixo.

## T005 — Cidade é lista do IBGE

Verde em `test/fleet/driver-city-select.contract.ts`, dentro do gate de `fleet` abaixo. Sem
vermelho-antes registrado: `b069ba4` traz `municipality.service.ts` e o contrato no mesmo commit.

## T006 — Usuário vinculado é lista de vínculos

Verde em `test/fleet/driver-membership-select.contract.ts` (11 casos), dentro do gate de `fleet`.
Mesmo caso de T005: `1905dc1` traz serviço, componente, hook e contrato juntos.

## Gates do frontend

```
$ bun test test/fleet.contract.test.ts
206 pass · 0 fail · 2146 expect() calls

$ bun test test/design-system.contract.test.ts
139 pass · 0 fail · 502 expect() calls

$ bun run typecheck
$ tsc --noEmit          (sem saída)

$ bun run lint
$ eslint .              (sem saída)

$ bun run test
1477 pass · 0 fail · 7892 expect() calls · 18 arquivos
```

## Gates da API

```
$ bun run typecheck     (sem saída)
$ bun run lint          (sem saída)
$ bun run test
2690 pass · 15 skip · 0 fail · 10979 expect() calls · 112 arquivos
```

## T007–T009

Abertas. Nenhuma evidência a registrar — as três dependem de ADR, e ADR não escrito não tem gate. O
que existe hoje são os dois achados datados em `docs/SECURITY.md` (2026-08-20), que é onde a decisão
pendente fica visível em vez de sumir no histórico de conversa.
