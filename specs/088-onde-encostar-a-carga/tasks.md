# Tasks

> 🤖 Modelo: `sonnet` (T1 e T5 são 🧠 — validar com `opus`)

## T1 🧠 — O baú ganha medida na ficha
Migration com os três CHECKs, schema, Zod da rota, e os três campos no formulário da frota, com o m³
derivado aparecendo quando eles existem.
**Depende de:** nada. **Verificação:** `bun test ./test/fleet-schema.contract.test.ts` e
`./test/migration.contract.test.ts`. **Aceite:** critérios 1 e 2 da spec.

## T2 — A fileira vira profundidade
`depthM` e `distanceFromDoorM` em `resolveCargoLayout`, nulos sem dimensão.
**Depende de:** T1. **Verificação:** `bun test ./test/cargo-volume.contract.test.ts`.
**Aceite:** critérios 3 e 4.

## T3 — Camadas a partir da caixa medida
`cargo-plan.policy.ts`, e o agrupamento por parada em `loadMeasuredItems`.
**Depende de:** T2. **Aceite:** critério 5.

## T4 — A planta na tela Nova viagem
`TripCargoPlan.component.tsx`, ao lado do painel de fileiras, com régua, porta, faixas e a borda
lateral. Mobile-first: no celular a planta rola no próprio contêiner, nunca a página.
**Depende de:** T2. **Aceite:** critérios 1, 2, 6 e 7.

## T5 🧠 — O que a tela promete
Revisão do texto: a faixa é espaço reservado por volume, não posição de caixa; o aviso de ficha vazia
nomeia o campo e leva até ele.
**Depende de:** T4. **Aceite:** todos.

## T6 — Evidência
`evidence.md` com a cobertura antes/depois: quantos veículos têm ficha preenchida, quantas paradas
mostram camadas, e a planta conferida em 375, 768 e 1280.
