# Evidência — Spec 199

## T1 — o defeito, reproduzido contra Postgres (2026-09-25)

Postgres de teste do Docker (`.env.test`, porta 65432), banco descartável por teste.

```bash
bun --env-file=../../.env.test test ./test/integration/me-trip.integration.ts --timeout 120000 -t "geocodificada"
```

Antes da correção, com `geocoded_addresses` tendo o pino de `3550308|01001000|100`
(`source = manual`, `rooftop`), a primeira parada saiu assim:

```text
-   "latitude": "-23.5503099",
-   "longitude": "-46.6342009",
+   "latitude": null,
+   "longitude": null,
(fail) a viagem no bolso do motorista (spec 057 T017) > a parada geocodificada chega com coordenada, e a sem pino chega vazia
 0 pass / 1 fail
```

No banco de desenvolvimento local, na mesma data: 20 paradas em viagens `route_planned`/`loading`,
todas com pino em `geocoded_addresses`, e `select count(*) from trip_stops where latitude is not null`
= **0**. A coluna nunca é escrita também fora do teste.

## T2 — a correção

`listStops` passou a ler `geocoded_addresses.latitude/longitude` por
`left join … on geocoded_addresses.address_key = trip_stops.address_key`, na mesma consulta. O
recorte de tenant continua no `where` de `trip_stops`.

```text
bun --env-file=../../.env.test test ./test/integration/me-trip.integration.ts --timeout 120000
 10 pass / 0 fail   (inclui "a viagem de uma empresa não alcança o motorista de outra")
```

## T3 — gates

| Gate                                                         | Resultado                                        |
| ------------------------------------------------------------ | ------------------------------------------------ |
| `bun run typecheck` (raiz)                                   | exit 0, 0 `error TS`                             |
| `bun run lint` (raiz)                                        | exit 0                                           |
| `bun run test` (`apps/frontend-driver`)                      | 493 pass, 0 fail                                 |
| `bun --env-file=../../.env.test test --timeout 120000` (API) | 7312 pass, 23 skip (migration sem banco), 0 fail |
| `bun --env-file=../../.env.test run test:integration` (API)  | 616 pass, 7 skip, 0 fail — 112 arquivos, 1024 s  |

Os 7 pulados não aparecem nominalmente na saída do Bun sem TTY; nenhum é da suíte `me-trip`
(10 de 10 passaram na execução isolada acima).

## T4 — preview

O preview no painel (53000) exigia cadastrar o `local-user` como motorista de uma viagem no banco de
dev compartilhado, e essa escrita foi negada. Em troca, leitura só de contagem contra o banco de dev,
com o repositório corrigido, para o motorista que tem viagens:

```text
route_planned: 4 paradas, 4 com coordenada
route_planned: 3 paradas, 3 com coordenada
route_planned: 2 paradas, 2 com coordenada
route_planned: 2 paradas, 2 com coordenada
route_planned: 3 paradas, 3 com coordenada
route_planned: 3 paradas, 3 com coordenada
```

O código da tela não mudou (só o dado que chega nela). O usuário dispensou o preview e autorizou a
publicação em staging em 2026-09-25; a conferência visual fica para staging.
