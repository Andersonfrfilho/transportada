# Tasks — 300 O bot fala num padrão só

Uma task por vez, no worktree `../transportada-wt/spec-300`. Cada task fecha com typecheck + testes da API + commit
isolado, evidência em `evidence.md`. Teste novo entra na lista explícita do `package.json`. Na API são **dois**
comandos (de dentro de `apps/api-transportada`), e nenhum cobre o outro:

```bash
bun --env-file=../../.env.test test --timeout 120000   # contrato
bun --env-file=../../.env.test run test:integration    # integração (obrigatório se mexeu em test/integration/**)
```

O texto de referência de toda mensagem é `conversas.html` (abrir no navegador; o array `flows` tem o texto cru).
Nenhum `[NEEDS CLARIFICATION]` aberto.

## Fase 0 — Medir antes de mexer

> 🤖 Modelo: `sonnet` (T0.1 é 🧠 — `opus`)

- [x] **T0.1 🧠** Decidir a origem de distância/tempo da lista (OSRM `table` × `RouteGeometryPort` por parada com
      `allSettled`), o corte por tamanho (4096 caracteres, medir com 15 paradas e mapa) e a forma da lista na conversa
      individual (limites da Meta). Aceite: decisões com arquivo:símbolo em `plan.md` e `evidence.md`.
- [x] **T0.2** Medir em staging (leitura) quais nós `fala_*` a empresa editou e confirmar que a publicação do grafo
      preserva o editado (`whatsapp-flow-graph-diff.policy.ts`). Aceite: lista em `evidence.md`; se a publicação
      sobrescreve, parar e perguntar.

## Fase 1 — O módulo de formatação

> 🤖 Modelo: `sonnet`

- [x] **T1.1** Contratos vermelhos de `whatsapp-message-format.policy.ts` (RF1–RF3c, RF7b): bloco nas duas variantes,
      cabeçalhos, citação certa/fora da rota, linha que some sem dado, link `dir`, "não entendi" com opções por extenso.
      Aceite: contrato vermelho pelo motivo certo.
- [x] **T1.2** Implementar o módulo. Aceite: T1.1 verde, typecheck.

## Fase 2 — Dados novos da lista

> 🤖 Modelo: `sonnet`

- [x] **T2.1** `district`, `city`, `coordinate` na parada candidata e na consulta que monta a lista (grupo e
      individual). Integração contra Postgres com nota de destinatário com e sem endereço. Aceite: integração verde.
- [x] **T2.2** Distância e tempo da lista conforme T0.1, com dublê de rota em contrato (com ponto, sem ponto, OSRM fora,
      uma parada sem estrada). Aceite: contrato verde; nenhuma falha derruba a lista.

## Fase 3 — Saí, cheguei e próxima parada (fluxos 1–4)

> 🤖 Modelo: `sonnet`

- [x] **T3.1** Menu e desfechos gerais (fluxo 1 + RF8: "Não entreguei" no menu). Contratos com o texto de
      `conversas.html`. Aceite: contratos verdes.
- [x] **T3.2** Lista de paradas (RF4–RF7b) no grupo e na individual. Aceite: texto igual ao desenho com a fixture das
      paradas 3–7.
- [x] **T3.3** Saída: localização, registrada, já a caminho com menu (RF9), repetida, baixa pendente, fora da rota.
- [x] **T3.4** Chegada: endereço sem localização, registrada, repetida, fora da rota.
- [x] **T3.5** Próxima parada e rota concluída com o nome (RF12).

## Fase 4 — Entreguei e não entreguei (fluxos 5–6)

> 🤖 Modelo: `sonnet`

- [x] **T4.1** Escolha da nota e comprovante com contador desde a primeira pergunta (RF10) e "quem recebeu" (RF13).
- [x] **T4.2** Confirmação da entrega e registro.
- [x] **T4.3** Canhoto: leitura, repetido, troca, foto que não parece canhoto.
- [ ] **T4.4** Entrega fora da rota e nota já baixada.
- [ ] **T4.5** Não entreguei: motivo, registro, sem nota.

## Fase 5 — Ocorrência, boleto, encerrar, erros, atendente (fluxos 7–11)

> 🤖 Modelo: `haiku` (T5.3 → `sonnet`: muda o que o encerramento lista)

- [ ] **T5.1** Ocorrência (grupo e individual) e "só pelo aplicativo".
- [ ] **T5.2** Boleto: retorno e pedir de novo.
- [ ] **T5.3** Encerrar a rota com as notas que ficam sem baixa (RF11).
- [ ] **T5.4** Tempo esgotado, desistência, áudio e recusas da API.
- [ ] **T5.5** Atendente: baixa em lote.

## Fase 6 — Conversa individual e fechamento

> 🤖 Modelo: `sonnet`

- [ ] **T6.1** Nós `fala_*` e textos de `register-driver-flow-actions.ts` no padrão, preservando os editados (T0.2).
      Aceite: contrato 286 RF9 verde sem exceção nova; republicação em contrato não toca nó editado.
- [ ] **T6.2** Gate completo (`make check`), revisão (`code-reviewer`), publicar em staging e conferir no grupo de
      staging as conversas 1–11 contra `conversas.html` (o que o bot mandou, colado em `evidence.md`).
- [ ] **T6.3** Atualizar `apps/api-transportada/CLAUDE.md` (§ jornada do bot) e `docs/ai-context/api-transportada.md`.
      Ida para `main` só com aprovação do dono.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/300-o-bot-fala-num-padrao-so/ no worktree ../transportada-wt/spec-300
(leia spec.md, plan.md, tasks.md e abra conversas.html antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 → executor model=sonnet, T0.1 🧠 → opus (validar com architect antes) · Fases 1–4 → executor
model=sonnet · Fase 5 → executor model=haiku (T5.3 → sonnet) · Fase 6 → executor model=sonnet · revisão final →
code-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com typecheck + os dois comandos de teste da API + commit isolado, evidência em evidence.md. O texto de
cada mensagem é o de conversas.html, comparado inteiro no contrato (nunca toContain).
Pare e pergunte antes de: publicar o grafo se T0.2 mostrar sobrescrita de nó editado, deploy em main, migration
destrutiva, qualquer [NEEDS CLARIFICATION].
```
