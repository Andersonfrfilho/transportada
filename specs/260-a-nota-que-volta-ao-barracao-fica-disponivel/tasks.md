# Tarefas — Feature 260

> 🤖 Modelo: Fase 1–2 `sonnet` (T1.1 e T2.1 são 🧠 — validar com `opus` antes), Fase 3–4 `sonnet`, Fase 5 `haiku`.

Pré-requisito: resolver NC1 e NC2 em `spec.md`. **Nenhuma task começa com `[NEEDS CLARIFICATION]` aberto.**

## Fase 1 — Soltar ao voltar ao barracão

> 🤖 Modelo: `sonnet` (T1.1 🧠 → `opus`)

- [ ] T1.1 🧠 Decisão: onde soltar (use case da tratativa) e como manter a transação única com a transição.
- [ ] T1.2 Teste de contrato vermelho: `allowed` solta; `blocked`/`unset` não; histórico preservado.
- [ ] T1.3 Implementar; teste de regressão de `allowed-actions`.

## Fase 2 — Transferência de carga (API)

> 🤖 Modelo: `sonnet` (T2.1 🧠 → `opus`)

- [ ] T2.1 🧠 Contrato da rota, idempotência e o que a transação desfaz.
- [ ] T2.2 Testes de contrato vermelhos (feliz, destino recusa, nota entregue, atomicidade).
- [ ] T2.3 Implementar rota, use case e auditoria; atualizar docs/ai-context da API.

## Fase 3 — Painel: transferir

> 🤖 Modelo: `sonnet`

- [ ] T3.1 Ação e diálogo de transferência; seletor de viagem de destino; erro por nota.
- [ ] T3.2 Contrato de hook com DOM; locales pt-BR e en.

## Fase 4 — Painel: aba Ocorrências

> 🤖 Modelo: `sonnet`

- [ ] T4.1 Leitura derivada `awaitingRedelivery`; selo e filtro na aba.

## Fase 5 — Revisão

> 🤖 Modelo: `haiku`

- [ ] T5.1 Revisão de design com print; nota na spec 164; `evidence.md`.

## Prompt de execução

Spec com `[NEEDS CLARIFICATION]` aberto: sem prompt de execução. Perguntas pendentes: NC1 e NC2.
