# Tasks

> 🤖 Modelo: `sonnet` (T1 é 🧠 — validar com `opus` antes)

## T1 🧠 — O catálogo ganha carga e os dois tipos que faltam

Migration: `vehicle_volume_references.max_payload_kg`, as linhas de `three_quarter` e `motorcycle`, e
as cargas das sete existentes. Schema Drizzle e `rollback.sql` ao lado.
⚠️ **A ficha não ganha coluna** — `fleet_vehicles.capacity_kg` já é a carga máxima (o `capKG` do
MDF-e), preenchida em 11 de 12.
**Depende de:** nada. **Verificação:** `bun test ./test/fleet-schema.contract.test.ts` e
`bun run --cwd apps/api-transportada test:migration`. **Aceite:** critérios 5, 6 e 8.

## T2 — A carga máxima entra na sugestão

O `maxPayloadKg` da referência alimenta o campo `Capacidade (kg)` que já existe, pelas mesmas regras
da sugestão de dimensão (campo vazio, origem impressa). Sem código de escrita novo: a rota, o
domínio e o formulário já carregam o campo.
**Depende de:** T1, T4. **Aceite:** critério 6.

## T3 — A rota que serve o catálogo

`GET /vehicle-references` sob `fleet.read`, e o teste de isolamento declarando a tabela como exceção
sem tenant, ao lado de `fuel_price_references`.
**Depende de:** T1. **Verificação:** `bun test ./test/fleet-schema.contract.test.ts`.
**Aceite:** critério 5.

## T4 — A sugestão, como serviço puro

`resolveVehicleSuggestion` com a precedência veículo→referência→ausência, a dobra de
`normalizeVehicleCatalogName` no par marca+modelo, e `car`/`tractor_unit` devolvendo ausência.
**Depende de:** nada (é puro; o contrato roda antes da rota existir).
**Verificação:** `bun run --cwd apps/frontend-transportada test`. **Aceite:** critérios 1, 2 e 3.

## T5 — O formulário vem preenchido

Consulta do catálogo, aplicação em campo vazio, rastro de campo tocado no hook, e o texto com origem
e faixa ao lado dos três campos.
**Depende de:** T3, T4. **Aceite:** critérios 1, 2, 3 e 4.

## T6 — O peso ganha teto na montagem

`maxPayloadKg` e `payloadRatio` em `cargoWeight`, e o percentual impresso no painel de carga quando
existe.
**Depende de:** T2. **Aceite:** critério 7.

## T7 — Evidência

`evidence.md` com a cobertura antes/depois: quantos veículos têm baú medido, quantos têm carga
máxima, e a ficha conferida em 375, 768 e 1280.
