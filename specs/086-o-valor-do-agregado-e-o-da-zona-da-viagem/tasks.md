# Tasks — 086

Uma task por vez. Teste de contrato **antes** da implementação. Nenhuma fecha sem evidência.

---

## T1 — `foldRegionCity`, a chave de casamento ✅

> 🤖 `sonnet`

**Arquivo:** `apps/api-transportada/src/freight-regions/domain/region-coverage.policy.ts`

**Teste primeiro:** `test/freight-regions-domain/coverage.contract.ts`

- `RIBEIRAO PRETO` e `Ribeirão Preto` dobram no mesmo valor
- `SAO CARLOS` / `São Carlos`, `MATAO` / `Matão`, `GUAIRA` / `Guaíra`
- a caixa e o espaço colapsado continuam funcionando (não regride)
- ç dobra em c (`CONCEICAO` / `Conceição`)

**Dependência:** nenhuma.
**Verificação:** `bun run --cwd apps/api-transportada test test/freight-region.contract.test.ts`
**Aceite:** os quatro pares acima dobram; nenhum teste existente de importação quebra.

**Feito em 2026-09-05.** `foldRegionCity` acrescentada (não é `normalizeRegionCity` alterada — ver a
correção no `plan.md`: a forma gravada continua acentuada). 10 contratos no arquivo, 4275 testes da
API verdes, `tsc --noEmit` limpo.

---

## T2 — A idempotência da importação sobrevive à dobra ✅

> 🤖 `sonnet`

**Arquivo:** `apps/api-transportada/src/freight-regions/application/import-freight-regions.use-case.ts`

**Teste primeiro:** estender o contrato de importação

- reimportar o mesmo arquivo devolve `{0, 0, 0}` **depois** de T1
- um arquivo com `SAO CARLOS` e outro com `São Carlos` não criam duas cidades

**Dependência:** T1.
**Verificação:** `bun run --cwd apps/api-transportada test test/freight-region.contract.test.ts`
**Aceite:** idempotência preservada; a cidade acentuada e a sem acento são a mesma linha.

---

## T3 — `resolveTripDriverZone`, política pura ✅

> 🤖 `sonnet`

**Arquivo novo:** `apps/api-transportada/src/trips/domain/trip-driver-zone.policy.ts`

**Teste primeiro:** `test/trip-valuation/driver-zone.contract.ts`

- paradas em 1.001 e 1.003, motorista cobre até 1.003 → **1.003** (D1)
- **o teste falha se a ordem das paradas for invertida na entrada e o resultado mudar** — é o
  defeito que a spec existe para consertar
- última parada sem cidade resolvível → cai para a anterior
- cidade fora de `freight_region_cities` → `{ gap: CITY_WITHOUT_REGION, cityToRegister: 'ITOBI/SP' }`
- motorista não cobre a zona do destino → `NO_DRIVER_RATE`
- sem ordem (prévia): zona mais alta da família; famílias diferentes → lacuna

**Dependência:** T1.
**Verificação:** `bun run --cwd apps/api-transportada test test/trip-valuation.contract.test.ts`
**Aceite:** nenhum caminho devolve número escolhido por ordem de linha.

---

## T4 — A lacuna nova, nomeada ✅

> 🤖 `sonnet`

**Arquivos:** `trips/domain/trip-valuation.policy.ts` (`VALUATION_GAPS.cityWithoutRegion`),
`apps/frontend-transportada/src/modules/trip/locales/trip*.locale.json`,
`.../trip-financials/locales/tripFinancials*.locale.json`

**Teste primeiro:** o contrato de rótulos falha se a chave nova não tiver texto nos quatro arquivos.

**Dependência:** T3.
**Verificação:** `bun run --cwd apps/frontend-transportada test`
**Aceite:** a lacuna nomeia a cidade; nenhum rótulo cru (`CITY_WITHOUT_REGION`) chega à tela.

---

## T5 — 🧠 As duas consultas param de decidir

> 🤖 `opus` — **PARAR e trocar de modelo antes de começar** (`model-economy.md`)

**Arquivo:** `apps/api-transportada/src/trips/infrastructure/trip-valuation.query.ts`

`readCrew` e `readPreviewCrew` trazem cobertura **e** destino das paradas e chamam
`resolveTripDriverZone`. O bloco `byDriver` que fica com a primeira linha com valor **sai**.

**Teste primeiro:**

- `test/trip-valuation/crew-parity.contract.ts` — `readCrew` e `readPreviewCrew` devolvem o mesmo
  para a mesma viagem: divergir faria a prévia prometer um preço e a viagem cobrar outro
- `test/trip-schema/tenant-safety.contract.ts` — `company_id` em toda junção nova

**Dependência:** T3, T4.
**Verificação:** `bun run --cwd apps/api-transportada test` + `make migration-test`
**Aceite:** uma consulta só (sem N+1 por motorista ou parada); paridade afirmada; contrato negativo
de tenant passa.

---

## T6 — Evidência contra o dado real

> 🤖 `sonnet`

**Arquivo:** `evidence.md`

Rodar contra o dado de staging já carregado em local (29 zonas, 83 cidades, 146 preços) e registrar:

- um motorista que cobre duas zonas → o preço é o do último destino, e **qual** era o preço errado
  que ele recebia antes (medido: 1.086,12 contra 1.508,51 em BARRETOS/`truck`)
- o casamento de cidade antes e depois da dobra de acento (39/76 → 65/76)
- as 12 cidades que continuam ausentes, com a lacuna nomeando cada uma
- `tractor_unit` continua em `NO_DRIVER_RATE`

**Dependência:** T5.
**Verificação:** `make check`
**Aceite:** o que ficou de fora está escrito. Spec com buraco silencioso é pior que spec aberta.
