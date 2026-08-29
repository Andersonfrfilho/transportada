# Tasks — 066

> 🤖 Modelo por fase conforme `model-economy.md`. **T001 e T002 estão bloqueadas** por
> `[NEEDS CLARIFICATION]` na `spec.md` — nenhuma task de implementação começa antes das quatro
> respostas (amostra de CCMEI, prazo de retenção, destino do anexo aprovado, MEI declarado ou
> inferido).

## Fase 0 — Destravar

> 🤖 Modelo: conversa, não código

- [ ] T001 Conseguir um CCMEI real (fora do repositório) e fechar o mapa de rótulos — sem isso a fase 4 não existe
- [ ] T002 Responder as outras três dúvidas da `spec.md` e registrá-las nela

## Fase 1 — A tela que falta (independente das demais)

> 🤖 Modelo: `sonnet` — API pronta, é consumo

- [ ] T003 [P] Hook e cliente de anexo no painel — `modules/fleet/shared/aggregateDocumentClient.service.ts`, `hooks/` — contrato de leitura
- [ ] T004 Card de anexos na candidatura com ícone de tipo, badge de status e estado vazio — `AggregateDocumentsCard.component.tsx` — contratos de render
- [ ] T005 Aprovar e reprovar por linha, motivo obrigatório na recusa — mesmo arquivo — contrato: recusa sem motivo é bloqueada na tela **e** na API
- [ ] T006 Abrir o arquivo por URL assinada — contrato: nenhum link sem assinatura no DOM
- [ ] T007 Smoke: aprovar muda o estado na tela real — `bun run smoke`

## Fase 2 — O CNPJ preenche a empresa

> 🤖 Modelo: `sonnet`

- [x] T008 [P] Ampliar `CompanyProfileLookupResult` e o gateway com os campos hoje descartados — contratos de mapeamento
- [x] T009 `GET /public/cnpj-info` com projeção pública, rate limit e timeout curto — contrato: IE, e-mail e telefone **ausentes** do corpo
- [x] T010 Bloco Empresa no `/cadastro`, preenchido no blur do CNPJ, editável, com marca de origem — contratos + `docs/SECURITY.md`

## Fase 3 — O anexo se vincula à candidatura

> ⛔ **Fase substituída pela Fase 5.** As tasks T011–T014 nasceram de novo lá, com as duas
> correções que a decisão de 2026-08-27 impôs (sem `expires_at`, cópia para `aggregate_documents` na
> aprovação). Elas ficam sem marca aqui de propósito: marcá-las diria que o caminho descrito **nesta**
> fase foi o percorrido, e não foi. T015 foi **cancelada** — sem prazo de validade não há o que expurgar.
> T016 virou T025.

> 🤖 Modelo: `opus` 🧠 — é onde mora o risco de sobrescrita e de sonda

- [ ] T011 Tabela `aggregate_application_attachments` + migration aditiva — `drizzle/` — migration revisável
- [ ] T012 Use case de rascunho e vínculo, reusando `assertAggregateDocumentBytes` e o storage port — contratos incluindo P4 (nada tocado em `aggregate_documents`)
- [ ] T013 Rota pública de upload com Turnstile e rate limit — contrato: resposta não revela existência
- [ ] T014 `attachmentDraftIds` no submit, vínculo na mesma transação, `draftId` inválido não derruba a candidatura
- [ ] T015 Expurgo de rascunho vencido no `cron-transportada` — teste de retenção
- [ ] T016 Anexos da candidatura aparecem na fila do painel (liga a fase 1)

## Fase 4 — O CCMEI preenche o que a consulta não prova

> 🤖 Modelo: `opus` 🧠 na T017 (mexe em app verde), `sonnet` no resto

- [x] T017 Extrair `document-intake` para `packages/document-intake/` **sem alterar comportamento** — gate: 2012 contratos + 36 smokes do painel verdes antes de seguir
- [x] T018 Mapa de rótulos do CCMEI + dígito verificador de CNPJ — contratos com PDF sintético de camada real
- [x] T019 Leitura no navegador da landing por `import()`, com a CSP intacta — gate: `dist/content-security-policy.txt` sem `unsafe-eval` e sem `blob:`
- [x] T020 Divergência CNPJ digitado × CNPJ do documento sinalizada, sem sobrescrever — contrato
- [x] T021 Smoke da landing: arquivo solto na tela real preenche os campos

## Fase 5 — O anexo chega ao operador

> 🤖 Modelo: `sonnet`; T023 é 🧠 (rota pública é superfície de abuso)

A fase 4 lê o documento no navegador e sinaliza a divergência para **quem preenche**. A tabela de
casos-limite da spec pede que ela chegue ao **operador**, e o caminho é este.

⚠️ Duas correções ao `plan.md`, que é anterior às decisões de 2026-08-27:

- **sem `expires_at` e sem `expireDrafts`** — o rascunho é guardado sem prazo, porque é o comprovante
  do que o motorista digitou. Some o job de expiração que o plano previa.
- **o anexo aprovado copia para `aggregate_documents`** — a spec 064 herda, e a cópia entra no escopo
  da ADR-0039 junto com o original.

- [x] T022 Tabela `aggregate_application_attachments` + migration com rollback — contrato de schema e
      de isolamento por tenant
- [x] T023 🧠 `uploadDraft` + `POST /public/aggregate-application-attachments` — Turnstile, limite de
      taxa, validação de bytes e armazenamento; teto real é o do transporte (2 MiB do servidor), não
      os 10 MiB do domínio, e a recusa diz isso
- [x] T024 `attachmentDraftIds` no submit da candidatura, vinculando os rascunhos — contrato
- [x] T025 O operador vê os anexos da candidatura e decide um por um; aprovar copia para
      `aggregate_documents`

## Gates de toda task

`bun run lint`, `bun run typecheck`, `bun test` e `bun run build` do app tocado; commit isolado por
task; `evidence.md` só depois da verificação executada, com o que ficou de fora escrito nele.
