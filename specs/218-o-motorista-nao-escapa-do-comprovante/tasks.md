# Tasks — Spec 218 (o motorista não escapa do comprovante)

**Status: todas as fases fechadas (29/09/2026).** Fase 5 dispensada por decisão do usuário. Ver
`evidence.md` para números de gate por fase e as divergências registradas.

## Fase 0 — Localização (concluída, ver `evidence.md`)

> 🤖 Modelo: `sonnet`

- [x] **T0** Achados registrados em `evidence.md` (T0.1-T0.4): call sites de `deliveryProof` e
      `attachmentMode`, junção emitente→`contractors`, arquivo de rotas do catálogo.
- [x] **T0b** Achado registrado em `evidence.md`: os dois caminhos de ocorrência usam modelos de
      dado incompatíveis. Decisão do usuário (29/09/2026): migrar o enum fixo de "Deu problema" para
      dentro de `company_occurrence_types`, com campo novo `flow` (`document | stop`) editável em
      `OccurrenceTypeCatalogPanel`. Ver spec.md D1 e RF-B5.

## Fase 1 — Comprovante por contratante (RF-C, RF-D1)

> 🤖 Modelo: `sonnet` (T2 é 🧠 — migration com backfill, validar antes de aplicar)

- [x] **T1** Contratos antes, vistos falhar. Commit `ab766e954`.
- [x] **T2** 🧠 Schema + migration (`deliveryProofSettingContractorOverrides`, FK de destinatário
      com backfill de `delivery_clients` órfão). Commit `69d2fda7d`.
- [x] **T3** `resolve-with-overrides.policy.ts` + `resolveDeliveryProofSettings` de 3 camadas +
      repositório + rotas de exceção por contratante. Commit `51ac7aea3`.
- [x] **T4** Plugado nos dois call sites (`toDriverDocument`, `listPendingProofs`). Commit
      `873394539`. Fixtures de outros arquivos quebradas pela FK nova, corrigidas em `3b5b10e7f` e
      `086b7256e`.

## Fase 2 — Vocabulário de ocorrência (RF-B5) e exceções (RF-B, reaproveita RF-D1)

> 🤖 Modelo: `sonnet` (T5 é 🧠 — migration mexe em dado gravado de viagens reais)

- [x] **T5** 🧠 RF-B5: `flow` em `company_occurrence_types`, 5 linhas `flow: 'stop'` semeadas por
      empresa, `trip_stop_occurrences.occurrence_type_id` com backfill. Commit `7d75bda73` (junto
      com T7). ⚠️ Deixou a escrita pela metade — ver D2/Fase 4b abaixo, fechado depois.
- [x] **T6** `resolve-with-overrides.policy` para ocorrência, 4 combinações. Commit `a48d295b6`.
- [x] **T7** Tabelas de override (`companyOccurrenceTypeContractorOverrides`/`...RecipientOverrides`).
      Commit `7d75bda73` (junto com T5).
- [x] **T8** Rota `attachment-overrides` + campo `flow` no cadastro. Commit `39ca9f411`.
- [x] **T9** Resolução de 3 camadas em `list-field-occurrence-types.use-case.ts`. Commit `c6e97ea2a`.

## Fase 3 — Painel: telas de configuração (RF-C4, RF-B4, RF-B5)

> 🤖 Modelo: `sonnet`

- [x] **T10** Exceção de comprovante por contratante no painel. Commits `cf00f3f43`, `6215a4135`
      (fix de tradução).
- [x] **T11** Campo `flow` + seção "Exceções" no catálogo de ocorrência. Commit `729d918eb`.
- [x] **T12** Revisão de design feita com print real (bancada isolada — Postgres, Keycloak e API
      dedicados, sem tocar na infra compartilhada), 375px e desktop, claro e escuro. Achado: o
      placeholder do seletor "Contratante" ("Buscar contratante por nome ou CNPJ", 36 caracteres)
      estourava a largura do campo em 375px e truncava para "Buscar contratante por nome ou C…" —
      o texto some no meio da palavra. Corrigido para "Buscar por nome ou CNPJ" (mais curto que o
      padrão já usado em `delivery-clients`/`extra-charges`, e sem repetir "contratante", que já é o
      rótulo do campo), nas 4 chaves de locale (pt-BR/en) que o spec 218 introduziu:
      `trip.locale.json` (`deliveryProofSettings.contractorOverrides.contractorPlaceholder`) e
      `companySettings.locale.json` (`occurrenceTypeCatalog.exceptions.contractorPlaceholder` e
      `settingsResolution.contractorPlaceholder`, mais os pares `.en.locale.json`). Resto da tela —
      espaçamento, cor, borda dos `Select`/botões — bate com os elementos vizinhos já revisados.

## Fase 3b — Painel: tela de verificação (RF-E)

> 🤖 Modelo: `sonnet`. Depende de T3/T8 (lê os overrides que essas tasks gravam); não depende da
> Fase 4.

- [x] **T13** Rota `GET /company-settings/settings-resolution`, 4 combinações. Commit `8e8b46023`.
- [x] **T14** Tela "Verificar configuração efetiva". Commit `3dc4747d8`.
- [x] **T15** Revisão de design feita com print real, 375px e desktop, claro e escuro (mesma
      bancada de T12; o placeholder do seletor "Contratante" desta tela usa a mesma chave de
      locale, já corrigida em T12). Layout consistente com o resto do painel — rótulo/valor em
      linha, `Select`/input com borda e contraste iguais aos campos vizinhos.

## Fase 4 — App do motorista: extração + gate de entrega (RF-A1–A4)

> 🤖 Modelo: `opus` 🧠 — cruza o componente mais testado do app (30+ contratos), risco de regressão
> alto; validar a extração (T16) sozinha, com os testes de hoje verdes, antes de somar qualquer
> comportamento novo.

- [x] **T16** Extração de `ProofCaptureFields`. 762 pass/0 fail antes e depois, diff de nomes vazio.
      Commit `227b8b83b`.
- [x] **T17** Contratos do gate, vistos falhar (incluindo o caso "entrega em aberto" pedido pelo
      usuário). Commit `57056ce5d`.
- [x] **T18** `PreDeliveryProofGate` + fila `awaiting-delivery:<id>` (RF-A3 revisado — a API recusa
      canhoto sem entrega registrada, então o anexo espera o "Confirmar entrega" antes de entrar na
      drenagem). Commit `5dbf1761c`. Smoke real rodado (53112): 2/2 + 24/24.
- [x] **T19** Confirmado: nenhuma lógica de precedência no app, só leitura do valor resolvido.
      Commit `da4be2632`.
- [x] **T20** Revisão de design — prints reais por Playwright em
      `specs/218-o-motorista-nao-escapa-do-comprovante/prints/`. Commit `654842c86`.
- [x] **Fase 4c (fora da numeração original, pedido do usuário)** — 3 lacunas do gate corrigidas:
      fila cheia não marca foto como anexada (`3ba6c6762`), comprovante não some visualmente após a
      entrega (`013ca9350`), foto órfã descartada ao cancelar/"Não entreguei" (`65791ed98`). 808
      pass/0 fail no fim, smoke verde.

## Fase 4b — App do motorista: botão único de ocorrência (RF-A5, D1, D2, D3, D4, RF-B5)

> 🤖 Modelo: `opus` 🧠. Depende de T5/T9 (catálogo com `flow`) e T16 (`ProofCaptureFields`
> extraído). Parou uma vez para decisão de produto (D2/D3/D4, ver `spec.md` e `evidence.md`) antes
> de escrever código — não presumiu.

- [x] **T-D2** (backend, achado nesta fase, fora da numeração original) `stop_kind` em
      `company_occurrence_types`, rota de parada aceita `occurrenceTypeId`, deriva `kind` da coluna
      em vez do nome do tipo. Commits `a6092990b` (contrato), `e0a73b41b` (implementação).
- [x] **T21** Contratos do botão único, vistos falhar (0 pass/11 fail). Commit `83449e0d9`.
- [x] **T22** `DriverOccurrenceRegistrationForm` + `useOccurrenceRegistrationForm` +
      `occurrenceRegistration.service.ts` — substitui os dois pontos de entrada antigos por um botão
      "Ocorrência" por nota, sempre visível (D4); reaproveita o bloco de foto de ocorrência que já
      existia, não `ProofCaptureFields` (evitaria o defeito que a spec 209 corrigiu); roteia por
      `flow` (D2 pra parada, D3 pra nota com/sem foto). Commit `8b705e800`. `check` verde (832
      testes) + smoke verde (25/25, dois casos novos).
- [x] **T23** Revisão de design — prints reais por Playwright (375px, claro e escuro), commit
      `6e4f660eb`. Achado: caixa "O que aconteceu" não ocupa a largura toda em 375px (defeito
      pré-existente do antigo "Deu problema", não corrigido).

## Fase 5 — Legado `/minha-viagem` — **dispensada**

> 🤖 Modelo: `sonnet`

- [x] **T24** Usuário confirmou: `VITE_DRIVER_APP_URL` já ligada em produção, legado não serve mais
      ninguém ("pelo menos após essa correção vamos apenas utilizar o app novo", 29/09/2026).
- [x] **T25** Dispensada por T24. ⚠️ **Mas o contrato de paridade byte-a-byte entre o painel e a
      app nova (`pending-queue.contract.ts`) continua no `check` do painel independente de a UI ser
      usada** — a Fase 4/4c mudou `countPending` na app nova e quebrou essa paridade. Corrigido à
      parte (fora da numeração de fase, achado só na verificação consolidada final): `isAwaitingDeliveryKey`
      copiado por valor para o painel (sempre `false` na prática lá), commit `d1aab4c9e`.

## Fase 6 — Evidência final

> 🤖 Modelo: `sonnet`

- [x] **T26** `evidence.md` completo com os achados de todas as fases. Verificação consolidada final
      rodada depois de todas as fases fecharem: `db:check` limpo, `make migration-test` 112/0,
      `format:check` limpo na raiz, `bun run check` verde nos três apps (API 8262/8263 pass — 1 flake
      de carga em `deploy.contract.test.ts`, não relacionado, confirmado 199/199 isolado; app do
      motorista 832/0; painel 5732/0 depois da correção de paridade).

## Pendências fora desta spec (registradas, não bloqueantes)

- Exceção de ocorrência por contratante/destinatário não chega ao app do motorista (P3) — o
  snapshot não traz `contractorId`/`recipientTaxId` da nota. Precisa de mudança no snapshot numa
  spec futura.
- A rota de ocorrência de nota não recusa um tipo `flow: stop` enviado por engano — o app nunca
  manda isso, mas o servidor não tem essa validação de defesa em profundidade.
- A rota do escritório (em nome do motorista) para ocorrência de parada ainda manda só `kind`, sem
  `occurrence_type_id` — paridade motorista/escritório incompleta.

## Prompt de execução (histórico — já executado)

```text
/oh-my-claudecode:autopilot Execute a spec specs/218-o-motorista-nao-escapa-do-comprovante/ (leia
spec.md, plan.md, tasks.md e evidence.md antes de começar — a Fase 0 já rodou, não repita). Uma
task por vez, na ordem do tasks.md. Fases 1 e 2 podem correr em paralelo entre si; Fase 3 depende de
T3/T5/T8; Fase 3b depende de T3/T8; Fase 4 depende de Fases 1 e 2 fechadas (T19 depende de T4/T9);
Fase 4b depende de T5/T9/T16.
Modelos: Fase 1 → executor model=sonnet (T2 🧠) · Fase 2 → executor model=sonnet (T5 🧠, migration
em dado gravado — validar contra fixture de empresa com trip_stop_occurrences antes de aplicar) ·
Fase 3 e 3b → executor model=sonnet · Fase 4 e 4b → opus (T16 é o ponto de maior risco de
regressão — parar e confirmar os testes de hoje continuam verdes antes de seguir) · Fase 5 →
executor model=sonnet, só depois de confirmar com o usuário (T24) · revisão final →
code-reviewer model=opus.
Cada task fecha com os gates listados nela + commit isolado. Pare e pergunte antes de: aplicar
qualquer migration em staging/produção, decidir se a Fase 5 é necessária (T24), e qualquer
divergência entre o que uma task encontrar e o que o plan.md supõe.
```
