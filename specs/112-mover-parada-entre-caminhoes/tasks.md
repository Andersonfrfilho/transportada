# Spec 112 — tarefas

> 🤖 Modelo: `sonnet` (T1 é 🧠 — muda a regra de recusa gravada na spec 111)

- [x] **T1 🧠 — O grupo devolve as notas por parada, e o aceite move** (D3, D4). Dep: nenhuma.
      Contrato antes: chave de outro caminhão move parada e notas; mesma chave em dois caminhões é 400.
- [ ] **T2 — Select "Mover para…" por parada, só caminhões com sobra de peso** (D1). Dep: nenhuma.
- [ ] **T3 — Movimento como rascunho nos dois caminhões** (D2). Dep: T2.
- [ ] **T4 — O aceite manda o movimento** (D3). Dep: T1, T3. ⚠️ API sobe antes do front.
