# Spec 115 — Tarefas

> 🤖 Modelo: `opus` (empacotador; nenhuma tarefa barata nesta spec)

- [x] T1 — Medir as quatro viagens reais pela resposta de `POST /trips/cargo-preview` e reproduzir
      local com a mesma entrada (bate caixa a caixa com a tela). Dependência: nenhuma.
- [x] T2 — Contrato `real-mixed-cargo.contract.ts` + fixture anonimizada; provado vermelho contra
      `84cce6a2` (4 de 6 falham). Dependência: T1.
- [x] T3 — D4 e D5: assento que desliza e sombra da carga mais tardia. Dependência: T2.
- [x] T4 — D1: esbeltez acima da contenção. Dependência: T2.
- [x] T5 — D2: grade que coloca tudo. Dependência: T4.
- [x] T6 — D3: teto só de desenho. Dependência: T2.
- [x] T7 — Reescrever `placement` (teto), `grid` (forma da decisão) e `slices` (ordem sob equilíbrio)
      com a razão no teste. Dependência: T3–T6.
- [x] T8 — `docs/domain/cargo-placement.md`, `CLAUDE.md` e `evidence.md`. Dependência: T7.

Verificação: `bun test ./test/cargo-volume.contract.test.ts`, `bun run typecheck`, `make check`.
