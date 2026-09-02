# Tasks — 078 O deploy parte a tela ao meio

Uma task por vez. Contrato **antes** da implementação, falhando primeiro.

---

## Fase A — A decisão

> 🤖 Modelo: `opus` 🧠

- [x] **T001** — Decidir entre atomicidade e tolerância. **Fechado: atomicidade** (D1).
      ⚠️ A primeira decisão foi tolerância e **estava errada**: catorze testes existentes mostraram
      que rejeitar chave a mais é defesa contra vazamento de token, identidade de tenant e XML
      fiscal — não guarda de contrato. Implementei, os testes reprovaram, revertí.

---

## Fase B — O deploy sobe junto

> 🤖 Modelo: `sonnet`

- [ ] **T002** — Contrato do workflow: commit que toca a API **ou** uma app de cliente dispara o
      deploy das duas. Falha contra a configuração de hoje. (RF3 · CA2)
- [ ] **T003** — Ajustar o filtro de caminho em `.github/workflows/deploy.yml`.
- [ ] **T004** — Contrato: gate vermelho continua **bloqueando os dois** — atomicidade não pode
      virar "sobe metade quando o gate cai".

---

## Fase C — O sentido inverso

> 🤖 Modelo: `sonnet`

- [ ] **T005** — Contrato: campo recém-acrescentado é **opcional** no cliente até a API que o serve
      estar no ar (D2). Caso concreto: `occupancy`, da spec 075.
- [ ] **T006** — Aplicar em `occupancy` e escrever a disciplina onde ela se lê.

---

## Fase D — O sintoma deixa de ser mudo

> 🤖 Modelo: `sonnet`

- [ ] **T007** — Contrato: a versão de cada app é observável sem abrir o bundle e procurar string.
      (P3/RF4 · CA4)
- [ ] **T008** — Implementar nas três apps de cliente, ou registrar por que não (RNF2).

---

## Fase E — Fecho

> 🤖 Modelo: `haiku`

- [ ] **T009** — `make check` e smoke verdes, evidência completa.

---

## Fora, e por quê

⚠️ **A extração das doze cópias de `hasExactKeys` saiu desta spec** (D3). Com a semântica
preservada, ela é faxina — valiosa, e sem relação com o defeito que originou a spec. Juntá-la aqui
misturaria refactor de doze arquivos com mudança de pipeline, e é assim que uma reverte a outra.
