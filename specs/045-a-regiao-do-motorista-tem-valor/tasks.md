# 045 — Tarefas

## Fase 1 — Domínio da região

> 🤖 Modelo: `sonnet`

- [x] **T001** — Contrato da zona acumulativa.
      `test/freight-regions-domain/coverage.contract.ts`: `parseRegionCode('1.002')` devolve
      `{family: '1', zone: 3}`; `coversRegion` diz que a zona 3 de Barretos cobre as zonas 1, 2 e 3
      da mesma família e não cobre a 4 nem outra família; a matriz (`0.001`, zona 0) cobre só a si.
      **Aceite:** vermelho registrado.

- [x] **T002** — `freight-regions/domain/region-coverage.policy.ts`.
      Puro, sem I/O. Normalização de nome de cidade na mesma dobra do resto do produto
      (trim + caixa alta + espaço único).
      **Aceite:** T001 verde.

---

## Fase 2 — Persistência

> 🤖 Modelo: `sonnet` (T003 é 🧠 — a migration mexe em `fleet_vehicles`, validar com `opus` antes)

- [x] **T003** — 🧠 Schema e migration.
      `database/freight-region.schema.ts` com `freight_regions`, `freight_region_cities`,
      `freight_region_driver_rates`; `fleet_drivers` ganha `fleet_driver_regions`;
      `fleet_vehicles` ganha `freight_class`. Unicidade da cidade é
      `(company_id, region_id, city, state)` — **nunca** `(company_id, city)`, BARRINHA/SP prova.
      A migration preenche `freight_class` pelo rodado (`01→truck`, `02→toco`, `04→van`,
      `05→utility`) e deixa `03`/`06` vazios. `rollback.sql` ao lado.
      **Aceite:** `make migration-test` verde.

- [x] **T004** — Contrato de tenant.
      `test/freight-regions-schema/tenant-safety.contract.ts`: as quatro tabelas novas filtram por
      `company_id`, e a mesma cidade existe em duas regiões da mesma empresa sem violar constraint.
      **Aceite:** suíte verde, e vermelha se o filtro for removido.

- [x] **T005** — Repositórios Drizzle.
      `drizzle-freight-region.repository.ts` e `drizzle-fleet-driver-region.repository.ts`.
      Leitura de região traz cidades e valores em **uma** consulta por página, nunca por linha.
      **Aceite:** contratos de repositório verdes.

---

## Fase 3 — Fronteira HTTP

> 🤖 Modelo: `sonnet`

- [x] **T006** — Rotas de região.
      `POST/PUT/DELETE /freight-regions` sob `settings.manage`, escopo `company`; `GET` sob
      `fleet.read`. Valor por classe no mesmo corpo. Zod `strict()`.
      A permissão de leitura desceu de propósito: a cobertura do motorista mora no formulário da
      frota, e exigir `settings.manage` para listar deixaria o campo de região em branco justo para
      o `operator`, que é quem cadastra motorista. Escrever na tabela de rotas continua sendo
      configuração.
      **Aceite:** `freight-regions-http` verde.

- [x] **T007** — Cobertura do motorista.
      `GET/PUT /fleet/drivers/{id}/regions`, lista misturando `scope: 'region'` e `scope: 'city'`.
      `city` sem cidade é 400 `FLEET_DRIVER_REGION_CITY_REQUIRED`; zona **com** cidade é 400
      `FLEET_DRIVER_REGION_CITY_UNEXPECTED` — as duas metades do CHECK da tabela, ditas na
      fronteira. Cobertura é dado da frota: ler é `fleet.read`, escrever é `fleet.manage`, sem
      `settings.manage`.
      **Aceite:** contrato de fronteira verde.

- [x] **T008** — Classe de frete no veículo.
      `freightClass` entra em `POST`/`PATCH` de veículo e na listagem. Sugestão pelo rodado é do
      frontend; a API aceita vazio e recusa valor fora da tabela.
      A atualização de veículo desta API é `PATCH`, não `PUT` — o texto original dizia `PUT`, e o
      roteador não casa o método errado: responderia 404, não 405.
      **Aceite:** `fleet-http` verde.

- [ ] **T009** — Importação.
      `POST /freight-regions/import`: CSV, chave natural, resumo `{created, updated, deactivated}`.
      Reimportar o mesmo arquivo devolve `created: 0`. Região ausente do arquivo vai a `inactive`,
      nunca é apagada.
      **Aceite:** contrato de idempotência verde.

---

## Fase 4 — Frontend

> 🤖 Modelo: `sonnet`

- [ ] **T010** — Aba **Regiões** em `fleet`.
      Registro em `SETTINGS_PANEL_PLACEMENT`, guarda `settings.manage`, consulta com
      `enabled: canManageSettings && settingsScope.<source>`. Tabela seguindo
      `docs/frontend/data-tables.md`.
      **Aceite:** `company-settings/tabs` e contrato da tabela verdes.

- [ ] **T011** — Cobertura no formulário de motorista.
      Campo somando zonas e cidades soltas, com pílulas removíveis de
      `@/components/ui/filter-pills`.
      **Aceite:** contrato do formulário verde.

- [ ] **T012** — Classe de frete no formulário de veículo.
      Select ao lado de **Tipo de rodado**, valor sugerido pelo rodado e editável, dica dizendo por
      que VUC e 3/4 não estão no rodado.
      **Aceite:** contrato do formulário verde.

- [ ] **T013** — Locales.
      Verbetes nos dois idiomas, pt-BR acentuado.
      **Aceite:** `locale-accents` verde.

---

## Fase 5 — Fechamento

> 🤖 Modelo: `sonnet`

- [ ] **T014** — Dados do cliente e gates.
      Importar `specs/045-.../data/regioes.csv` + `valores.csv` no ambiente do cliente pela rota de
      importação (não por seed em `src/`). `make check`, `make migration-test`, `evidence.md`.
      **Aceite:** tudo verde, evidência escrita.
