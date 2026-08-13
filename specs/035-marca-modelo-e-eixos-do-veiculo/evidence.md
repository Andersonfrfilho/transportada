# 035 — Evidência

## Levantamento anterior às tasks

O que foi conferido no código, não de memória, antes de escrever a spec:

- **`fleet_vehicles` não tem marca, modelo, ano, eixos nem número de frota.** Colunas hoje:
  `id, company_id, plate, renavam, role, status, tare_weight_kg, capacity_kg, capacity_m3,
wheel_type, body_type, state, ownership, owner_tax_id, owner_name, owner_state, owner_rntrc,
owner_tax_regime, version, created_at, updated_at`.
- **A consulta por placa já devolve marca, modelo e ano.** `vehicle-lookup-payload.policy.ts` mapeia
  `marca`/`brand` → `brand`, `modelo`/`model` → `model`, `ano`/`anomodelo` → `modelYear`, e ainda
  quebra o campo combinado `"MARCA/MODELO"` no separador `/`.
- **O frontend descarta os três de propósito.** `fleet.constant.ts`, `VEHICLE_LOOKUP_FORM_KEYS`, com
  o comentário: _"Campos da consulta por placa que existem no formulário; marca, modelo e ano não têm
  campo."_
- **O botão de consulta está depois dos dez campos.** `VehicleForm.component.tsx` renderiza
  `<VehicleIdentityFields>` inteiro e só então o bloco `lookupAction`.
- **`ownership` está no bloco errado.** É o último campo de `VehicleIdentityFields`, mas é ele que
  decide se `VehicleOwnerFields` aparece.
- **Veículo sem rodado é salvável e não emite MDF-e.** `mdfe-payload.builder.ts:148` lança
  `MdfePayloadMissingWheelTypeError` quando `wheelType === ''`; o cadastro aceita vazio.
- **O `cInt` do `veicTracao` sai vazio hoje.** O builder preenche `placa`, `tara`, `tipoCarroceria`,
  `tipoRodado`, `capacidadeKg` e o bloco de proprietário — `cInt` não aparece em nenhum lugar de
  `mdfe-manifests/`.
- **Nenhum campo de eixos no pacote fiscal.** `@adatechnology/fiscal-provider`, `veicTracao`:
  `cInt`, `placa`, `RENAVAM`, `tara`, `capKG`, `capM3`, `tpProp`, `tpVeic`, `tpRod`, `tpCar`, `UF`.
  Zero ocorrência de `categComb`, `valePed` ou `eixo` no pacote inteiro.
- **FIPE não cobre implemento.** A base tem `carros`, `caminhoes` e `motos`; semirreboque e carreta
  não estão em nenhuma delas.
- **O espelho da BrasilAPI é instável** — respondeu `429` embrulhado num `500` na primeira chamada
  da sondagem. Daí a decisão 4 da spec.

## T000 — padrão e UX da tela atual

Contrato escrito antes da implementação: `apps/frontend-transportada/test/fleet/screen-standards.contract.ts`,
importado por `test/fleet.contract.test.ts` (já na lista literal do `package.json`). Primeira execução
com o contrato pronto e nada implementado: **33 pass, 6 fail**, com `ENOENT` em
`FleetTableSkeleton.component.tsx`, `FleetEmptyState.component.tsx` e
`VehicleOperationFields.component.tsx` — vermelho pelos motivos certos.

O que estava fora do padrão, conferido no código:

- **Barra de filtro desalinhada.** `<input type="search">` na métrica cheia (`--field-height`, 3rem) ao
  lado de dois `Select` `compact` (2.4rem). O módulo `fleet` era o único sem nenhuma ocorrência de
  `--field-height-compact` — `billing`, `nfse-invoice`, `cte-batch`, `operations`, `mdfe-manifest` e
  `nfe-workspace` já usavam.
- **Foco invisível.** Nenhuma regra `input:focus` no módulo; `company-settings` e `cte-profiles`
  declaram o anel de cobre.
- **Sem os resets de campo.** Faltava `min-width: 0` (valor longo estourava a coluna do grid),
  `border-radius: 0`, e havia `font-family: inherit` em vez de `font: inherit`.
- **Carregamento fora de `docs/frontend/loading.md`.** `FleetStatusHint` imprimia a frase "Carregando
  frota" e o painel renderizava `null` enquanto a lista era `undefined` — o piscar que a regra proíbe.
- **Estado vazio real era invisível.** `createFleetViewModel` só devolve `status: 'empty'` quando
  veículos **e** motoristas estão vazios; 0 veículos com 3 motoristas mostrava um `<thead>` sozinho,
  sem uma palavra.
- **Ordem do formulário contra a ordem do trabalho.** O botão "Buscar pela placa" vinha **depois** dos
  dez campos que ele preenche, e `ownership` era o último campo do bloco de identificação, longe do
  bloco que ele comanda.

O que foi feito:

- `fleet.module.css`: métrica compacta para `.filterBar input`, métrica cheia para
  `.fieldGrid input`/`.plateRow input`, os três resets nas duas, anel de foco `2px` em cobre com
  `outline-offset`, e as classes `.plateRow`, `.skeletonTable`, `.skeletonRow`, `.emptyState`.
  `.lookupAction` foi removida — o botão saiu do bloco solto.
- `FleetTableSkeleton.component.tsx`: `SkeletonGroup` com 4 linhas × `columnCount` colunas (a coluna de
  ações entra na conta quando o operador pode gerenciar), no lugar da frase de carregamento.
- `FleetEmptyState.component.tsx`: título, motivo e o botão que resolve — ação opcional por ausência da
  prop, com `IconName` explícito (não existe ícone de caminhão na biblioteca; o botão carrega `add` ou
  `close`).
- `FleetStatusHint`: `loading` e `empty` mapeados para `null` — carregar é esqueleto, vazio é convite.
  A dica sobrou para `error` e `forbidden`, que continuam sendo texto.
- `VehiclePanel`/`DriverPanel`: corpo próprio por aba, com três saídas — esqueleto, vazio (dois textos
  distintos: "nada cadastrado" com o botão de cadastrar, "nenhum resultado para este filtro" com
  "Limpar filtros") e a lista.
- Formulário em três blocos: `VehicleIdentityFields` (placa + consulta ao lado, renavam, UF),
  `VehicleOperationFields` (função, rodado, carroceria, tara, capacidades) e `VehicleOwnerFields`
  (propriedade primeiro; os campos de proprietário só quando não é próprio).
- Locales pt-BR/en: `vehicleOperationLegend`, `vehicleOwnershipLegend`, `clearFilters`, e os quatro
  textos de vazio. `vehicleOwnerLegend` saiu junto com o consumidor.
- `test/fleet/vehicle-lookup.contract.ts` passou a procurar a consulta por placa em
  `VehicleIdentityFields` — ela mudou de lugar, e o contrato antigo apontava para `VehicleForm`.

Verificação:

```
bun test test/fleet.contract.test.ts   → 39 pass, 0 fail (250 expect)
bun run test                           → 1043 pass, 0 fail (5167 expect, 17 arquivos)
bun run typecheck (tsc --noEmit)       → sem saída
bun run lint (eslint .)                → sem saída
bunx prettier --check                  → verde após --write em 2 arquivos
```

`bun test` sem argumento falha em `test/responsive.smoke.spec.ts` ("Playwright Test did not expect
test() to be called here") — é o spec de Playwright sendo varrido pelo runner do Bun, alheio a esta
task; a lista literal do `package.json` não o inclui.

## T001 — …

_(a preencher quando a task rodar)_
