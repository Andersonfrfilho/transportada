# Tasks — 078 O deploy parte a tela ao meio

Uma task por vez. Contrato **antes** da implementação, falhando primeiro.

---

## Fase A — A guarda tolera o que não usa

> 🤖 Modelo: `sonnet`

- [x] **T001** — Decidir entre atomicidade e tolerância, por escrito. **Fechado: tolerância** (D1),
      porque a chave desconhecida é a única que derruba e a única que não protege nada.
- [ ] **T002** — Contrato da guarda compartilhada: chave desconhecida **passa**; chave ausente
      **reprova**; chave de tipo errado **reprova**. Falha antes de existir. (RF2 · CA2, CA3)
- [ ] **T003** — Extrair a guarda para `modules/shared/`, com a semântica nova. ⚠️ São **doze
      cópias** hoje (D3) — a extração é parte da mudança, não faxina à parte.
- [ ] **T004** — Trocar as doze, com a suíte inteira verde a cada troca.
- [ ] **T005** — Contrato de paridade: nenhum módulo redeclara a guarda. Sem ele, a décima terceira
      cópia nasce na próxima spec.

---

## Fase B — O sentido inverso

> 🤖 Modelo: `sonnet`

- [ ] **T006** — Contrato: campo recém-acrescentado é **opcional** no cliente até a API que o serve
      estar garantidamente no ar (D2). O caso concreto é `occupancy`, da spec 075.
- [ ] **T007** — Aplicar em `occupancy`, e documentar a disciplina onde ela se lê — não numa spec
      que ninguém abre depois.

---

## Fase C — O sintoma deixa de ser mudo

> 🤖 Modelo: `sonnet`

- [ ] **T008** — Contrato: a versão de cada app é observável sem abrir o bundle e procurar string.
      (P3/RF4 · CA4)
- [ ] **T009** — Implementar nas três apps de cliente, ou registrar por que não (RNF2).

---

## Fase D — Fecho

> 🤖 Modelo: `haiku`

- [ ] **T010** — `make check` e smoke verdes, evidência completa.
