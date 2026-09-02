# Tasks — 079 A guarda de chaves mora em oito lugares

Uma task por vez. Contrato **antes** da implementação. Suíte verde **a cada arquivo trocado**.

---

## Fase A — O lugar, e a trava

> 🤖 Modelo: `sonnet`

- [ ] **T001** — Contrato: uma declaração só no repositório, e ela mora em `modules/shared/`.
      **Falha contra as oito de hoje**, nomeando cada uma. (P2 · CA1, CA2)
- [ ] **T002** — Criar `modules/shared/objectKeys.service.ts` com a guarda em _type predicate_ (D1)
      e `hasKeys` junto (RF2 · CA4).

---

## Fase B — As oito

> 🤖 Modelo: `sonnet`

- [ ] **T003** — Trocar as três posicionais (`trip`, `mdfe-manifest`, `nfse-invoice`), mantendo o
      reexport de cada módulo. Suíte verde após cada uma.
- [ ] **T004** — Trocar as cinco de `company-settings`, adaptando a forma de chamada.
      ⚠️ Elas chamam com `{ keys, value }` **depois** de `isRecord` — a troca muda o formato da
      chamada, e é onde a spec 078 falhou em partes por não notar a diferença.

---

## Fase C — Fecho

> 🤖 Modelo: `haiku`

- [ ] **T005** — `make check` verde, smoke verde, e **nenhum teste existente alterado** (CA3) —
      conferido por `git diff --stat` sobre `test/`.
