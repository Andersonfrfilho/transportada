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

## T001 — …

_(a preencher quando a task rodar)_
