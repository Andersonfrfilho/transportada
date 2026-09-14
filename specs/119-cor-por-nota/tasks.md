# Spec 119 — Tarefas

> 🤖 Modelo: `sonnet` (T3 é 🧠 — a trava de colisão foi decidida com `opus`)

- [x] T1 — Contrato da API: a caixa leva a nota, toda caixa de uma nota está na parada dela, e
      nenhuma posição muda (vermelho antes do código).
- [x] T2 — Contrato do frontend: tom determinístico por nota, trava contra a cor de outra parada,
      presumida sem depender do tom, foco por nota (vermelho antes do código).
- [x] T3 — 🧠 Tons e trava (`noteTone.service.ts`).
- [x] T4 — API: carimbo da nota na prévia e no detalhe; o empacotador só copia.
- [x] T5 — Desenho: `currentColor` + classe de tom, contorno pontilhado, lista de notas na ficha.
- [x] T6 — Prova nas quatro viagens reais: coordenadas idênticas antes e depois.
- [x] T7 — Documentação (CLAUDE.md, `docs/domain/cargo-placement.md`) e `make check`.

Verificação: `bun test ./test/cargo-volume.contract.test.ts` (apps/api-transportada),
`bun test ./test/trip.contract.test.ts ./test/design-system.contract.test.ts`
(apps/frontend-transportada), `bun run typecheck`, `make check`.
