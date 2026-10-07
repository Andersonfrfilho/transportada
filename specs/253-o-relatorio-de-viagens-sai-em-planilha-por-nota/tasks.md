# Tasks — Spec 253

Gates de **toda** task: typecheck (`tsc --noEmit`), testes do módulo (lista explícita em
`package.json`), commit isolado, linha em `evidence.md`. Escalada: gate falhou 2x → sobe um nível e
registra. Executar em worktree própria: `make worktree NAME=spec-253`.

## Fase 1 — Contrato e regra de tom

> 🤖 Modelo: `opus` (T1.1 🧠) · T1.2 → `sonnet`

- **T1.1 🧠** Validar o contrato HTTP e a junção de contratante do `plan.md` com `architect`; ajustar
  `plan.md` se algo mudar. Aceite: parecer registrado em `evidence.md`. (RF1, RF2)
- **T1.2** Teste primeiro, depois `resolve-trip-report-tone.policy.ts` (pura): cada status → tom;
  `completed` com todas devolvidas → `total_return`; `cancelled` → sem tom; nota liberada ignorada.
  Aceite: teste cobre os 4 tons + bordas, `tsc` limpo. (RF3)

## Fase 2 — API

> 🤖 Modelo: `sonnet`

- **T2.1** `trip-report.schema.ts` + `trip-report.types.ts` + código `TRIP_REPORT_TOO_LARGE`
  (Zod, erros juntos, `limit` ≤ 100, `tripIdIn` ≤ 100). Aceite: testes de validação. (RF2)
- **T2.2** `trip-report.repository.ts` + `list-trip-report.use-case.ts`: junção, filtros no SQL, cursor,
  teto, `amount` só com `trip.financials`, sem `released_at`. Aceite: testes de caso feliz e de falha
  contra o banco de teste. (RF1, RF2)
- **T2.3** Rota `GET /v1/trip-document-report` + permissão + OpenAPI/Scalar; teste "toda rota aparece
  no documento"; teste E2E em `env.test.e2e`. Aceite: E2E verde. (RF1)

- **T2.4** `trip-proof-page.layout.ts` (puro) + `trip-proof-pdf.gateway.ts` + `export-trip-proof-pdf.use-case.ts`
  - rota `POST /v1/trip-document-report/proofs-pdf`: fluxo de blocos (cabe quantos couberem, bloco inteiro ou vai para a próxima página), bloco de aviso sem canhoto,
    "1 de 2" na reentrega, imagem ilegível vira aviso, faixa horizontal 100% da largura com altura de 5 a 7 cm e rotação da foto vertical, teto 200 (`TRIP_PROOF_REPORT_TOO_LARGE`), só
    `kind = photo`, valor só com `trip.financials`, sem bucket/chave. Aceite: testes do layout e do use
    case (com canhoto, sem canhoto, reentrega, imagem ruim, acima do teto) e E2E que baixa o PDF e confere
    `%PDF` e o número de páginas. (RF10, RF11, RF12)

## Fase 3 — Layout da planilha

> 🤖 Modelo: `sonnet`

- **T3.1** `SpreadsheetRowTone`/`SPREADSHEET_ROW_TONES` e `rows` com tom opcional em
  `spreadsheetLayout.service.ts`; zebra preservada para quem não passa tom. Aceite: teste do layout
  (com e sem tom) e dos exportadores existentes sem alteração. (RF6)
- **T3.2** Legenda das quatro cores sob o título + teste de contraste ≥ 4,5:1 dos tons com o texto.
  Aceite: teste verde. (RF6, RF7)

## Fase 4 — Front

> 🤖 Modelo: `sonnet` · T4.4 → `haiku`

- **T4.1** Tipos, `tripReport.service.ts` (páginas por cursor até o teto) e
  `useTripReportExport.hook.ts` (seleção, senão filtro; progresso; erro 422). Aceite: teste do hook
  com serviço falso. (RF5)
- **T4.2** Filtros de nota, contratante, cidade, UF, valor e situação da nota em `TripFilters` com os
  primitivos da aba de notas, pílulas e query params. Aceite: teste do hook de filtros. (RF4)
- **T4.3** Botão **Exportar relatório** (ícone `Download`, `aria-label`) na `bulkBar` e na barra de
  filtros; montagem de linhas + tons + legenda pelo `useSpreadsheetExport`. Aceite: teste do builder de
  linhas. (RF5)
- **T4.5** Botão de exportar na aba de notas (`nfe-workspace`): barra de lote (seleção → `documentIdIn`)
  e barra de filtros (filtro atual → parâmetros do endpoint), com aviso das notas sem viagem. Aceite:
  teste do tradutor filtro-da-aba → parâmetros e do aviso. (RF9)
- **T4.6** Botão **Exportar canhotos (PDF)** (ícone `FileText`) em `/trips` e na aba de notas, com
  `tripProofPdf.service.ts` e `useTripProofPdfExport.hook.ts`; recusa 422 com o teto. Aceite: teste do
  hook com serviço falso. (RF10)
- **T4.4** i18n pt-BR/en acentuado em `trip.locale.json` e `spreadsheet`. Aceite: teste de paridade de
  chaves + grep sem texto fixo. (RF8)

## Fase 5 — Fechamento

> 🤖 Modelo: `haiku` (T5.1) · `sonnet` (T5.2, revisão)

- **T5.1** Docs do módulo de viagens e arquivo de contexto de IA (regra 14); auditoria §15 (N+1,
  `Promise.all`, logs sem PII, sem stack em 500). Aceite: grep e checklist em `evidence.md`.
- **T5.2** Revisão de design de `/trips` contra a aba de notas (vizinhos, contraste, 375/768/1280 px) por
  texto (`read_page`/CSS computado) e **um** print final; `code-reviewer` (sonnet) como segunda passada.
  Aceite: divergências corrigidas ou listadas.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/253-o-relatorio-de-viagens-sai-em-planilha-por-nota/
(leia spec.md, plan.md e tasks.md antes de começar). Trabalhe na worktree `make worktree NAME=spec-253`.
Escopo: planilha colorida por nota (RF1-RF9) e PDF de canhotos em fluxo, vários por página (RF10-RF12);
prévia visual aprovada em https://claude.ai/artifact/QP2xzouhYiVCXz9BoEsz5A.
Uma task por vez, na ordem do tasks.md; testes primeiro e registrados na lista explícita do package.json.
Modelos: Fase 1 → T1.1 🧠 opus (validar com architect antes de implementar), T1.2 executor model=sonnet ·
Fase 2 → executor model=sonnet · Fase 3 → executor model=sonnet · Fase 4 → executor model=sonnet
(T4.4 model=haiku) · Fase 5 → T5.1 haiku, T5.2 e revisão final → code-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com typecheck + testes + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy, migration destrutiva, qualquer [NEEDS CLARIFICATION].
```
