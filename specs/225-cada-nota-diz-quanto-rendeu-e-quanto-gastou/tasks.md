# Tasks — 225 Cada nota diz quanto rendeu e quanto gastou

Uma task por vez, na ordem. Cada uma fecha com typecheck + testes da app + commit isolado e evidência
em `evidence.md`.

## Fase 1 — A regra de rateio, antes de qualquer tela

> 🤖 Modelo: `opus` 🧠 — é a decisão estrutural da spec: classificar parcela, fechar a soma ao centavo
> e tratar ausência de roteiro sem inventar zero.

- [ ] **T1.1** Contrato primeiro, em `test/trip-domain/document-cost-apportionment.contract.ts`
      (importado por `test/trip-domain.contract.test.ts`), com trechos sintéticos:
  - CA01: três paradas, cinco notas — `Σ gasto por nota == totalCost` e `Σ frete == totalRevenue`, ao
    centavo;
  - CA02: nota da primeira parada gasta **menos** que nota da última com o mesmo frete;
  - CA03: com retorno, todo `tripShareCostAmount` > 0 e a soma continua fechando;
  - CA04/CA05: sem `planned_route`, sem `legs`, ou contagem de trechos ≠ contagem de paradas → toda
    nota `costBasis: 'unavailable'`, **sem** valor;
  - CA06: nota com `stop_id` nulo — sem gasto de trecho, com rateio de viagem;
  - CA03b (D9): espera no cliente — a parada que esperou mais encarece a nota dela; duas notas na mesma
    parada dividem a espera em duas partes iguais e **o tempo total da viagem não cresce**; sem
    `departed` o último `delivered` serve de saída (`timeBasis: 'partial'`); sem `arrived` a espera é
    zero (`timeBasis: 'incomplete'`);
  - extremos: uma nota só, trecho de duração zero (sem divisão por zero), duas notas na mesma parada;
  - ⚠️ **a classificação das parcelas é exaustiva**: um teste percorre os **nove** tipos de
    `TRIP_COST_KINDS` (`driver`, `fuel`, `other_per_kilometer`, `toll`, `manual`, `delivery_charges`,
    `helper`, `icms`, `pis_cofins`) e reprova qualquer um sem classificação declarada — sem `default`.
    A tabela da classificação está no D1 da spec.

  Aceite: falham pelo motivo certo (a política não existe), e a contagem de testes subiu em N.

- [ ] **T1.2** `trips/domain/document-cost-apportionment.policy.ts` e os tipos
      `Params`/`Result`. Função pura, `Decimal` em tudo, resto de arredondamento determinístico na nota
      de maior gasto. ⚠️ `legs[i]` é o trecho que chega à parada `i+1` — a suposição é prendida por
      asserção, não por comentário.

  Aceite: T1.1 verde; typecheck e lint em exit 0; **provado por mutação** (trocar a classificação de
  `driver` de tempo para distância, e remover o tratamento de ausência, têm de reprovar).

## Fase 2 — A resposta passa a dizer por nota

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Contrato da resposta, em `test/trip-valuation/document-figures.contract.ts`: os campos
      do RF1 presentes com `trip.financials`; **ausentes** sem a permissão; ausentes na resposta do
      portal da contratante. Aceite: vermelho pelo motivo certo.

- [ ] **T2.2** `read-trip-valuation.use-case.ts` chama a política e anexa os campos a `revenueLines`;
      o mapper e a porta declaram os campos. **Nenhum endpoint novo.**

  Aceite: T2.1 e T2.2 verdes, os **dois** comandos da API verdes (contrato e integração), e a
  invariante do D4 conferida em `test/integration/trip-valuation-document-figures.integration.ts`
  contra o `totalCost` que a avaliação já devolve.

## Fase 3 — A tela

> 🤖 Modelo: `sonnet`

- [ ] **T3.1** Guarda de tipo e formatação: `tripResponse.validation.ts` e `trip.types.ts` com os
      campos novos (**sem zod** — esta app usa guarda escrita à mão), mais o contrato do serviço que
      formata "do trecho" e "rateio da viagem".
- [ ] **T3.2** `TripStopList.component.tsx`: a linha da nota mostra frete, gasto e lucro, com as duas
      partes do gasto separadas e o critério nomeado; locales pt-BR e en; CSS por módulo.
- [ ] **T3.3** `TripFinancialPanel.component.tsx`: previsto e fechado **lado a lado** (D6), com a
      diferença, e o aviso de que o fechado ainda não existe na viagem aberta.

  Aceite de cada uma: contratos verdes, typecheck, lint, `bun run --cwd apps/frontend-transportada test`
  (o script do `package.json`, **nunca `bun test` cru** — o cru varre os `.smoke.spec.ts` do
  Playwright e dá vermelho de invocação).

## Fase 4 — Revisão, documentação e portões

> 🤖 Modelo: `opus` 🧠 na revisão; `sonnet` no resto.

- [ ] **T4.1** ⚠️ **Revisão de design com preview local e prints em 1280 e 375 px** (web.md §15),
      comparando a linha da nota com as vizinhas e conferindo contraste em estado normal **e**
      selecionado. **Exige o ok explícito do usuário** — esta task não fecha sozinha. Se a linha ficar
      ilegível em 375 px, "rateio da viagem" vai para o detalhe expandido, e isso é decisão de produto,
      não de implementação.
- [ ] **T4.2** Documentação viva: `docs/ai-context/api-transportada.md` e
      `docs/ai-context/frontend-transportada.md` com a regra de rateio em uma linha, apontando para a
      política.
- [ ] **T4.3** Portão completo na raiz, um comando por vez em primeiro plano (`make check` estoura o
      teto de 600 s): `format:check`, `lint`, `typecheck`, `test`, `build`. ⚠️ `format:check` é portão
      **só na raiz**, e a spec em markdown entra nele — rodar prettier nos `.md` antes.
- [ ] **T4.4** Revisão por `code-reviewer` em `opus`, com a invariante do D4 e a classificação das
      parcelas como foco.

## O que não se decide sozinho

Pare e pergunte antes de: empurrar para staging, deploy, migration (esta spec **não** deve precisar de
nenhuma — se precisar, o desenho mudou e o usuário tem de saber), qualquer `[NEEDS CLARIFICATION]`, e
na **T4.1**, que exige o ok explícito do usuário sobre os prints.

As duas dúvidas de classificação já foram resolvidas com o usuário em 2026-10-02:
`delivery_charges` vai **pela distância** (escolha dele, contra a recomendação — ver o ⚠️ do D1), e
`manual` vai para rateio de viagem **por fato**, não por escolha: `trip_cost_entries` não tem vínculo
com parada nem com nota. Parcela **nova** que apareça depois disso: **pergunte** em vez de escolher —
é dinheiro na tela de quem decide o que carregar.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/225-cada-nota-diz-quanto-rendeu-e-quanto-gastou/
(leia spec.md, plan.md e tasks.md antes de tocar em código). Uma task por vez, na ordem do tasks.md.
Modelos: Fase 1 → opus 🧠 (é a regra de rateio) · Fase 2 → executor model=sonnet ·
Fase 3 → executor model=sonnet · Fase 4 → code-reviewer model=opus na T4.4.
Cada task fecha com typecheck + lint + testes da app + commit isolado e evidência em evidence.md.
Contrato antes da implementação, e toda asserção nova provada por mutação.
PARE E PERGUNTE antes de: empurrar para staging, deploy, qualquer migration, qualquer
[NEEDS CLARIFICATION], classificação ambígua de parcela de custo, e na T4.1 — ela exige prints em
1280 e 375 px e o ok explícito do usuário (web.md §15).
```
