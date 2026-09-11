# Spec 142 — Plano

> 🤖 Modelo: `opus` 🧠 na fase 1 · `sonnet` nas fases 2 e 3

## Fase 1 — Regra e estrutura (🧠 `opus`)

- Extrair de `7a3c6c42` só a correção da escora; nada da busca, da orientação nem do genético.
- Medir a versão extraída (altura maciça) contra `b50a3952` nas quatro viagens, no Atego da fixture e
  no sintético; achar se a perda é física ou regra estrita demais (variante exata, varrendo as caixas).
- Trocar as camadas de altura maciça pela pilha persistente por célula (`stackHeadOf`), com a mesma
  resposta da variante exata.

## Fase 2 — Contratos (`sonnet`)

- `test/cargo-placement/brace-rises-alongside.contract.ts` antes do código (vermelho na base).
- `test/fixtures/mixed-cargo-bank.fixture.ts` trazido de `7a3c6c42` (gerador por semente).
- Reescrever com a razão o teto do sintético de 85 paradas (`dead-space.contract.ts`).

## Fase 3 — Documentação e gate (`sonnet`)

- `docs/domain/cargo-placement.md` §6, `cargo-placement-defects.md`, `CLAUDE.md`, `evidence.md`.
- `bun test ./test/cargo-volume.contract.test.ts`, `bun run typecheck`, `make check`.
