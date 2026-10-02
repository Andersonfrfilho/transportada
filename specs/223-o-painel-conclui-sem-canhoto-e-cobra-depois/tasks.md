# Tasks — Feature 223

## Fase 1 — A API aceita a baixa sem canhoto

> 🤖 Modelo: `sonnet` (T1.1 é 🧠 — é mudança de regra de negócio)

- [x] **T1.1 🧠** Inverter os testes que fixam o 422 e abrir a policy (RF1/RF2/RF3), expor
      `proofPending` na resposta e remover o erro morto. Evidência: 136 contratos de `driver-trip`,
      42 de integração do escritório contra Postgres real, 8481 contratos da API, 6356 do painel.
      Commit `e9074b6b4`.

## Fase 2 — A nota baixa pelo painel, uma e em massa

> 🤖 Modelo: `sonnet`

- [x] **T2.1** Contrato do painel: "Marcar entregue" por nota chama `fieldDeliverDocument` e mostra
      o resultado (incluindo o aviso de canhoto pendente).
- [x] **T2.2** Ligar o botão por nota no detalhe da viagem (RF6).
- [x] **T2.3** Contrato do lote: leque com concorrência 3, chave de idempotência por nota, falha
      isolada e nota que falha de volta na seleção.
- [x] **T2.4** "Marcar entregue" em massa na barra de ações da seleção (RF7).

## Fase 3 — A lista de viagens encerra em massa

> 🤖 Modelo: `sonnet`

- [x] **T3.1** Contrato da seleção de viagens na lista.
- [x] **T3.2** Seleção de linhas + "Encerrar viagens" em massa sobre `POST /trips/:id/close` (RF8).

## Fase 4 — A dívida fica visível

> 🤖 Modelo: `sonnet`

- [x] **T4.1** Contrato: a leitura do detalhe devolve a pendência de canhoto por nota (RF4).
- [x] **T4.2** Expor a pendência na leitura do detalhe.
- [x] **T4.3** Contrato do filtro "com canhoto pendente" na lista de viagens (RF4).
- [x] **T4.4** Filtro na API + na UI da lista.
- [x] **T4.5** Selo "canhoto pendente" na linha da nota (RF9).

## Fase 5 — Revisão

> 🤖 Modelo: `opus`

- [x] **T5.1 🧠** Revisão de design e usabilidade das telas tocadas, com print.
- [ ] **T5.2 🧠** Revisão de código da feature inteira por `code-reviewer`.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/223-o-painel-conclui-sem-canhoto-e-cobra-depois/
(leia spec.md, plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
As Fases 1, 2 e 3 já estão concluídas — comece na T4.1.
Modelos: Fases 2, 3 e 4 → executor model=sonnet · Fase 5 → code-reviewer model=opus.
Cada task fecha com typecheck + contratos do que foi tocado + commit isolado, evidência em
evidence.md. Task que mexe em test/integration/** roda
`bun --env-file=../../.env.test run test:integration` com Postgres de pé.
Pare e pergunte antes de: deploy, migration destrutiva, qualquer [NEEDS CLARIFICATION].
```
