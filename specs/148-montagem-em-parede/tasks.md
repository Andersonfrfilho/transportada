# Spec 148 — Tarefas

| fase | tasks | modelo recomendado | fallback se der 429 |
| ---- | ----- | ------------------ | ------------------- |
| 1    | T1    | `sonnet`           | `opus`              |
| 2    | T2 🧠 | `opus`             | `fable`             |
| 2    | T3 🧠 | `opus`             | `fable`             |
| 3    | T4    | `sonnet`           | `opus`              |
| 3    | T5    | `sonnet`           | `opus`              |
| 4    | T6    | `haiku`            | `sonnet` → `opus`   |

## Fase 1 — Reproduzir a base

> 🤖 Modelo: `sonnet`

- [ ] T1 — No worktree do pacote, em `feat/cargo-placement` @ `0925c14`, rodar o harness (`harness/README.md`)
      sobre as 6 entradas de `harness/inputs/` com `enclosedBody: true, securesCargo: false, deliveryReachM: 2`
      e reproduzir a tabela da spec (Atego 162, 27 paradas 11, Sprinter 6, Fiorino 4, Accelo 0, Iveco antiga
      0), com `check.ts` e `tall.ts` em zero violações. Registrar em `evidence.md`.

## Fase 2 — A montagem em parede (🧠)

> 🤖 Modelo: `opus`

- [ ] T2 🧠 — Desenhar e implementar a montagem em parede (D1) no pacote, como ordem de colocação do baú
      fechado: canto → fileira pela largura → próxima fileira encostada na anterior, cada pilha subindo até o
      teto dentro da D23/D25. Partir de `feat/cargo-placement`; a branch `wip/cargo-wall-building` tem uma
      primeira versão (`wallBuilding`) e a D25 para consulta, não para herdar sem medir. Contrato vermelho
      antes: com `enclosedBody`, a primeira pilha de cada fileira fica no canto (cabeceira + lateral) e cada
      pilha alta tem encosto no sentido da cabeceira + lateral; sem `enclosedBody` o desenho é idêntico ao
      de `0925c14`.
- [ ] T3 🧠 — Medir base / parede / parede + D25 nas 6 entradas (caixas de fora, tempo, retrabalho),
      `classify.ts` no que sobrar, e adotar como padrão do baú fechado o que medir melhor sem violação (D2).
      Suíte do pacote sem falha nova (G3); `exact-edges` e `complement` verdes. Se não zerar sem regra
      protegida, parar e levar ao usuário o que sobra, a regra e o número (D3).

## Fase 3 — App

> 🤖 Modelo: `sonnet`

- [ ] T4 — Commitar o pacote, `pnpm run build`, e no app confirmar que `CARGO_LAYOUT_POLICY_VERSION` novo
      invalida os hashes (as plantas se recalculam); gate completo de API e worker com zero linhas `(fail)`.
- [ ] T5 — Reiniciar o worker do worktree, refazer no navegador a proposta ("Montar roteiro pela busca de
      notas" → 342 notas, 6 motoristas, 6 veículos → "Propor roteiro"), abrir cada caminhão, contar no banco
      as caixas de fora por planta (`trip_cargo_layouts.layout->'placement'->'unplaced'`) e conferir com o
      usuário, no mapa 3D, que nenhuma pilha alta ficou isolada (G4).

## Fase 4 — Documentação

> 🤖 Modelo: `haiku`

- [ ] T6 — Atualizar `docs/domain/cargo-placement-defects.md`, `docs/ai-context/api-transportada.md` e a
      ADR-0063 com a montagem em parede e as regras D23–D26; fechar `evidence.md`.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/148-montagem-em-parede/ (leia spec.md, plan.md, tasks.md e
harness/README.md antes de começar; leia também a memória "caixa-de-fora-e-a-prioridade" e as decisões
D21–D26 em specs/145-a-planta-e-do-worker/spec.md). Trabalhe no worktree ../transportada-wt/cargo-missing-box
(branch work/cargo-missing-box) e no worktree do pacote ~/Documents/personal/adatechnology-packages-wt/cargo-placement
(branch feat/cargo-placement). Uma task por vez, na ordem do tasks.md, contrato vermelho antes do código.
Modelos: T1 → executor model=sonnet · T2 🧠 e T3 🧠 → executor model=opus (plano validado antes por architect
model=opus) · T4, T5 → executor model=sonnet · T6 → writer model=haiku · revisão final → code-reviewer
model=opus. Se o modelo der 429, siga o fallback da tabela do tasks.md.
Regras que não se negociam: nenhuma pilha alta isolada (encosto no SENTIDO da cabeceira + ≥ 1 lateral,
vizinha escora com 80% da borda, porta livre, inclusive no complemento); apoio mínimo de 80%, célula de 5 cm
e STABLE_STACK_SLENDERNESS inalterados; alcance de 2 m; nenhum baú fora do fechado desenha menos caixas.
Caixa de fora é o defeito nº 1 do usuário: conte e reporte as caixas de fora de cada veículo em toda task.
Cada task fecha com typecheck + testes (conte as linhas "(fail)" — só entra com zero, fora as falhas que já
existiam no 0925c14) + commit isolado, sem push, evidência em specs/148-montagem-em-parede/evidence.md.
Pare e pergunte antes de: push, publicar o pacote, mudar qualquer regra física protegida, deploy, e se a meta
de zero caixa de fora não fechar sem regra protegida (leve o que sobra, a regra e o número).
```
