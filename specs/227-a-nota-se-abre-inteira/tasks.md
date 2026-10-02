# Tasks — 227 A nota se abre inteira

Uma task por vez, na ordem. Cada uma fecha com typecheck + lint + testes da app + commit isolado e evidência
em `evidence.md`. Contrato antes da implementação, **toda asserção nova provada por mutação**.

⚠️ Nada daqui começa antes da **Fase 0**. **Nenhum `[NEEDS CLARIFICATION]` aberto**: N1 a N5 foram respondidas em
2026-10-02. A **Fase 5** espera a **spec 228** (D12).

## Fase 0 — O chão

> 🤖 Modelo: `opus` 🧠 — rebase com conflito em `trip.schema.ts` e migration reencadeada.

- [x] **T0.1** Renumerar `225-cada-nota-diz-quanto-rendeu-e-quanto-gastou` → `226-…` (`git mv`) e **todas** as
      referências a "spec 225" em código, testes, docs e locales. `grep` antes e depois; contagem no
      `evidence.md`. Aceite: nenhuma referência a 225 como _esta_ spec; typecheck e testes verdes.
- [x] **T0.2** Rebase das 28 commits em `origin/staging`. Resolver os 12 arquivos medidos. ⚠️ **Nunca**
      `git stash` cru. Aceite: `bun install --frozen-lockfile`, typecheck e testes das **sete** apps verdes
      **depois** do rebase (rebase limpo não é typecheck verde).
- [x] **T0.3** Reencadear a migration da 196 (procedimento no `plan.md`). Aceite: `db:generate` =
      `no_changes`, `schema-snapshot.contract.ts` verde e **`make migration-test`** verde.
- [x] **T0.4** Integração **inteira** da API (~19 min, em primeiro plano) sobre a base rebaseada. É o gate de
      push das specs 196 e 226.

## Fase 1 — O acordeão

> 🤖 Modelo: `sonnet`

- [x] **T1.1** Contrato: só uma nota aberta; abrir outra fecha a anterior; o checkbox **não** abre nem fecha;
      âncora da linha do tempo abre a nota; o cabeçalho **não** aninha checkbox em botão. Atualizar
      `document-row-structure.contract.ts` (spec 181 T202) **sem afrouxar**.
- [x] **T1.2** Estado compartilhado de "nota aberta" e o cabeçalho checkbox + botão. Aceite: contrato verde,
      suíte do painel verde, `scrollWidth <= innerWidth` em 375.

## Fase 2 — Dados da nota

> 🤖 Modelo: `sonnet`

- [x] **T2.1** Contrato: Série própria, CNPJ impresso, `CopyButton` por campo com rótulo que diz **o que**
      copia, sem permissão nada de dinheiro.
- [x] **T2.2** Série, CNPJ (formatador do painel), `CopyButton`, e o custo e lucro (spec 226) para dentro de
      _Dados da nota_.
- [x] **T2.3** **API** (N4 = sim). `volumeCount` em `serializeTripDocumentDetail` classificado na
      `FieldPolicy`, sem N+1 (teste por contagem de `select`, como na 226), com contrato de tenant. Aceite: os
      **dois** comandos da API verdes.

## Fase 3 — Ocorrências por nota

> 🤖 Modelo: `sonnet`

- [x] **T3.1** Contrato + implementação: seção própria, link por ocorrência (`<a href>` + `onClick` +
      `navigateToTripOccurrence`), vazio dito. Cuidado com a spec 167.

## Fase 4 — Comprovante unificado

> 🤖 Modelo: `sonnet`

- [x] **T4.1** Contrato dos **dois** selos (D4), cobrindo **cada combinação** de conferência (inclusive
      **Recusado**) × pontualidade × `proofPending`. Aceite: nenhuma combinação **esconde** um eixo — um
      recusado **e** longe do ponto diz as duas coisas.
- [x] **T4.2** Comprovante visível ao abrir a nota, via `GET /trips/:id/delivery-proofs` (spec 222).

## Fase 5 — Eventos da nota e raio

> 🤖 Modelo: `opus` 🧠 na API e na spec 228; `sonnet` no painel

⚠️ **Bloqueada pela spec 228** (os dois eventos novos, D12) **e pela spec 206** (dona do `stop.departed`).
Nenhum `[NEEDS CLARIFICATION]` aberto nesta spec.

- [ ] **T5.0** Escrever a **spec 228** — "Foto do canhoto" e "Endereço da parada (geocodificado)" como eventos
      (D12). Lê antes `specs/196-…`, `specs/206-…`, o ADR-0088 e a spec 218. Responde, **antes de qualquer
      migration**: de quem é o evento do endereço e quando nasce. Número 228 conferido contra `origin/staging`.
      **Pare e pergunte antes de qualquer migration.**
- [x] **T5.1** API: filtro por nota em `GET /trips/:id/timeline`, no servidor, com contrato de tenant e de
      permissão (`trip.event-location`). Não depende da 228.
- [x] **T5.2** API: o raio na resposta do comprovante (D6), resolvido por contratante, sem
      `settings.manage` do leitor. Não depende da 228.
- [ ] **T5.3** Painel: _Eventos desta entrega_ por nota; rótulo do `departed` = **"Saída para esta
      parada"** (D11); círculo do raio **só** com o dado; os dois eventos novos quando a 228 existir.

## Fase 6 — Comparação, revisão e portões

> 🤖 Modelo: `opus` 🧠 na revisão; `sonnet` no resto

- [ ] **T6.1** **Comparar com o canvas**, lado a lado (spec, "A referência é um canvas"). Prints da tela real e
      da prancha, em 1280 e 375 px, dark e light, **cada divergência listada** no `evidence.md` como
      defeito corrigido ou pendência declarada. Olha estrutura, ordem, vocabulário, cor e estados — **não** os
      números (D10). **Exige o ok explícito do usuário** (web.md §15).
- [ ] **T6.2** Documentação viva: `docs/ai-context/frontend-transportada.md` (e `api-transportada.md`).
- [ ] **T6.3** Portão completo na raiz, um comando por vez em primeiro plano; `format:check` é gate **só da
      raiz** e a spec em markdown entra nele.
- [ ] **T6.4** Revisão por `code-reviewer` em `opus`, com **cinco políticas de permissão na mesma tela** e a
      revogação da spec 181 como foco.

## O que não se decide sozinho

Pare e pergunte antes de: empurrar para staging, deploy, **qualquer migration**, qualquer `[NEEDS
CLARIFICATION]`, e na **T6.1**, que exige o ok do usuário sobre os prints.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/227-a-nota-se-abre-inteira/ (leia spec.md, plan.md e
tasks.md antes de tocar em código). Uma task por vez, na ordem do tasks.md, começando pela Fase 0.
Modelos: Fase 0 → opus 🧠 · Fases 1, 2, 3 → executor model=sonnet · Fase 4 → executor model=sonnet · Fase 5 → opus 🧠 na API e sonnet no painel, depois da spec 228 · Fase 6 → opus 🧠 na
revisão e code-reviewer model=opus na T6.4.
Cada task fecha com typecheck + lint + testes da app + commit isolado e evidência em evidence.md.
Contrato antes da implementação, e toda asserção nova provada por mutação.
PARE E PERGUNTE antes de: empurrar para staging, deploy, qualquer migration, qualquer [NEEDS CLARIFICATION]
(nenhum aberto), e na T6.1 — ela compara com o canvas aprovado e exige o ok explícito do usuário (web.md §15).
```
