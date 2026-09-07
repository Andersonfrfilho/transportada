# Tasks

> 🤖 Modelo: `sonnet` (T1 é 🧠 — o empacotador é a peça que decide tudo)

## T1 🧠 — O empacotador, puro

`trips/domain/cargo-placement.policy.ts`: camadas por varredura em fileiras, duas orientações no
plano, teto de altura do baú, e o excedente devolvido nomeado em vez de comprimido.
**Depende de:** nada. **Verificação:** `bun test ./test/cargo-volume.contract.test.ts`.
**Aceite:** critérios 1 e 4.

## T2 — A caixa presumida

`resolveFallbackBox`: volume estimado ÷ quantidade, na proporção da mediana das caixas medidas da
empresa; sem nenhuma, na do catálogo de referência. A origem viaja com a caixa.
**Depende de:** T1. **Aceite:** critérios 2 e 3.

## T3 — O plano atravessa a prévia

`CargoLayoutStop` ganha as camadas; `trip-cargo-preview.query.ts` e o detalhe da viagem passam as
caixas por parada que já carregam.
**Depende de:** T1, T2. **Aceite:** critério 5.

## T4 — A planta desenha as camadas

`ScalePlan` ganha o modo camada, com navegação e a marca de presumido em hachura. A linha do que a
planta **não** promete fica fixa.
**Depende de:** T3. **Aceite:** critérios 1, 2, 4 e 6.

## T5 — O teto de tempo

Teste de domínio com 300 notas, medindo. Teto declarado de caixas por camada.
**Depende de:** T1. **Aceite:** critério 7.

## T6 — Evidência

`evidence.md` com a cobertura de medição antes e depois, e a planta conferida em 375, 768 e 1280.
