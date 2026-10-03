# Tasks

Uma task por vez, na ordem. Cada uma fecha com typecheck, teste e commit isolado, e registra a
evidência em `evidence.md`. Fora da Fase 0.5, só `apps/frontend-transportada` é tocada — task
que precise mexer na API além da leitura da Fase 0.5 é sinal de escopo escorregando, e para.

## Fase 0 — Provar o que o servidor já faz

> 🤖 Modelo: `sonnet`

- [x] **T0.1** Exercitar as duas rotas contra a API local e colar em `evidence.md` o corpo enviado
      e a resposta: correção com dois itens, cancelamento com motivo, e os dois `409`
      (tratativa aberta, já cancelada). Sem isto, o resto é escrito sobre suposição.
- [x] **T0.2** Conferir que a leitura do detalhe devolve `corrections` e `cancellation`
      preenchidos depois das escritas da T0.1, e que os tipos do painel batem com o que chega.
      **Resultado: não devolve.** Nenhuma leitura (detalhe, feed, lista da nota) publica os dois
      campos; só as respostas das escritas. Decisão do usuário em 2026-10-02: a 235 ganha a Fase
      0.5, só de leitura na API.

## Fase 0.5 — A leitura passa a contar o que a 167 grava

> 🤖 Modelo: `sonnet`

Só leitura em `apps/api-transportada`: nenhuma migration, nenhuma rota nova, nenhuma regra nova,
nenhuma mudança nas escritas da 167. Reaproveita a leitura que `drizzle-occurrence-correction.repository.ts`
já faz (`listOccurrenceCorrections`, o mapeamento de `cancellation`), em lote — sem N+1.

- [x] **T0.3** Contrato e integração primeiro, vermelhos: `GET /trip-occurrences/:id` (detalhe) e
      `GET /trips/:tripId/documents/:documentId/occurrences` (lista da nota) devolvem
      `corrections` (`[]` quando não há, mais antiga primeiro) e `cancellation`
      (`null` ou `{ cancelledAt, cancelledBy…, reason }`, mesmo formato da resposta das escritas);
      `GET /trip-occurrences` (feed) devolve `cancellation`. A ocorrência cancelada **continua**
      nas três leituras — marcada, nunca filtrada.
- [x] **T0.4** Implementação nas consultas de leitura, em lote por página (uma consulta de
      correções para o conjunto de ids, agrupada por `Map`), com `companyId` do contexto.
- [x] **T0.5** Gates da API: os dois comandos de teste da API (contrato **e** integração com
      `--env-file=../../.env.test`), typecheck, documentação da API (OpenAPI gerado) e
      `docs/ai-context/api-transportada.md` atualizados.

## Fase 1 — O cliente e as regras puras

> 🤖 Modelo: `sonnet`

- [ ] **T1.1** As duas chamadas em `tripClient.service.ts`, com `Idempotency-Key` (RF1, RF2, RF3).
- [ ] **T1.2** Contrato primeiro, depois a função pura em `tripOccurrenceDetail.service.ts`: quando
      corrigir e cancelar podem agir, e **qual texto** explica quando não podem (RF4, RF10): sem itens, Corrigir não existe; o motivo distingue os estados da tratativa. Ler a regra da janela em `correct-occurrence-items.use-case.ts`/`cancel-occurrence.use-case.ts` e espelhar exatamente, sem inventar.
- [ ] **T1.3** Mutação: arrancar a condição de tratativa aberta deixa a T1.2 vermelha. Execução
      vermelha em `evidence.md`.
- [ ] **T1.4** Mutações das mutações de dados com invalidação de detalhe, feed e linha do tempo
      (RF8).

## Fase 2 — Corrigir

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Botão **Corrigir** no detalhe, com o estado desabilitado e o motivo em texto
      (CA02, CA03).
- [ ] **T2.2** `TripOccurrenceCorrectionForm`, reaproveitando o formulário de itens do registro,
      pré-preenchido com o conjunto atual e enviando o conjunto inteiro (RF2, CA01).
- [ ] **T2.3** As quatro mensagens de erro por código estável, via `getApiErrorCode()` (RF7, CA05).
- [ ] **T2.4** Mutação: trocar a mensagem de `409` pela genérica deixa a T2.3 vermelha.

## Fase 3 — Cancelar

> 🤖 Modelo: `sonnet`

- [ ] **T3.1** `TripOccurrenceCancelDialog` com motivo obrigatório, confirmar desabilitado em
      branco e em espaços, foco preso e devolvido (RF3, CA04).
- [ ] **T3.2** Marca de cancelada no detalhe, no feed e na linha do tempo, com motivo acessível,
      pela mesma função pura — nenhuma segunda cópia da conta (RF6, CA06).

## Fase 4 — O histórico

> 🤖 Modelo: `sonnet`

- [ ] **T4.1** Lista de correções no detalhe: autor, data e o conjunto que passou a valer (RF5, P3).
- [ ] **T4.2** Contrato de duas correções seguidas, provando que as duas aparecem na ordem certa.

## Fase 5 — Fechamento

> 🤖 Modelo: `sonnet`; revisão final com `code-reviewer` em `opus`

- [ ] **T5.1** Revisão de design e usabilidade, com print nas três larguras, incluindo o diálogo
      aberto e o estado desabilitado com motivo (CA07).
- [ ] **T5.2** Marcar no `tasks.md` da spec 167 o que de fato está feito, com a evidência da T0.1 —
      a lista de lá está inteiramente desmarcada e mente sobre o estado da API.
- [ ] **T5.3** Gates: `bun run typecheck`, `bun run lint` com a app como cwd,
      `bun run --cwd apps/frontend-transportada test` (nunca `bun test` cru) e `format:check` na
      raiz.
- [ ] **T5.4** `evidence.md` consolidado.

⚠️ Todo arquivo de teste novo entra na lista do `package.json` da app — fora dela, não roda.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/235-a-correcao-da-ocorrencia-ganha-tela/
(leia spec.md e plan.md antes de começar). Uma task por vez, na ordem do tasks.md.
Esta spec é só de frontend: nada muda na API da spec 167, e task que precise mexer no servidor
para — é sinal de escopo escorregando, pergunte antes.
Modelos: todas as fases → executor model=sonnet · revisão final → code-reviewer model=opus.
Comece pela Fase 0: sem o corpo e a resposta reais das duas rotas em evidence.md, não escreva
componente. Cada task fecha com typecheck + teste + commit isolado.
As tasks de mutação (T1.3, T2.4) só fecham com a execução vermelha registrada, não com a
afirmação de que falharia. O teste da app é `bun run --cwd apps/frontend-transportada test`,
nunca `bun test` cru, e teste novo precisa entrar na lista do package.json.
Pare e pergunte antes de: deploy, qualquer mudança de regra de negócio da 167, qualquer
[NEEDS CLARIFICATION].
```
