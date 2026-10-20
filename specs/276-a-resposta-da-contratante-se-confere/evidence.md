# Evidence — 276

## T1 — resposta sem anexo continua aguardando (20/10/2026)

Postgres 16 local (porta do `.env.test`), Bun 1.4.2.

- API, contratos: `bun test ./test/occurrence-conversation.contract.test.ts` → 735 pass, 0 fail.
- Worker, contratos (inclui a paridade da política): `bun test ./test/occurrence-conversation.contract.test.ts` → 81 pass, 0 fail.
- API, integração: `bun --env-file=../../.env.test test ./test/integration/occurrence-contractor-reply-received.integration.ts
./test/integration/occurrence-conversation-portal.integration.ts` → 21 pass, 0 fail, 85 expect.
- Worker, integração: `bun --env-file=../../.env.test test ./test/integration/occurrence-contractor-reply-received.integration.ts`
  → 11 pass, 0 fail (foto só e dois PDFs seguem em `needs_operator`).
- `tsc --noEmit` na API e no worker, `eslint` e `prettier --check` nos arquivos tocados: limpos.

## T2 — conferência do boleto (20/10/2026)

Postgres 16 local, Bun 1.4.2.

- Contrato novo `contractor-reply-document.contract.ts` (31 casos: DV de cada campo, arrecadação mod 10/11, chave de
  acesso de 44 dígitos não é linha, número com ponto/zeros, número dentro de outro não vale, DANFE sem linha, PDF sem
  texto) e casos `boleto_pdf` em `contractor-reply.contract.ts`; os dois, e o fixture de PDF, idênticos no worker
  (paridade).
- Texto real: `contractor-reply-document-text.contract.ts` lê o PDF sintético pelo unpdf (API) e pela thread do pdf.js
  (worker) e o boleto confirma, o DANFE não.
- API, `bun --env-file=../../.env.test test` (script de contratos): 12507 testes, 0 fail.
- Worker, `bun run test`: 2808 pass, 5 fail — os 5 são `threaded canhoto barcode decoder` (thread sai com código 13 no
  Bun 1.4.2 desta máquina) e falham igual com a mudança guardada (`git stash`); nada desta tarefa.
- API, integração: `occurrence-contractor-reply-received` + `occurrence-conversation-portal` → 24 pass, 0 fail (boleto
  com linha e número → `awaiting_operator`; DANFE → `needs_operator`/`document_not_confirmed`, evento do sistema, nenhuma
  entrega; sem leitor → operador).
- Worker, integração `occurrence-contractor-reply-received` → 14 pass, 0 fail (mesmos três casos pelo e-mail, texto
  lido na thread).
- Migration: `db:test` → 231 pass, 0 fail; `contractor-reply-boleto-check.assertion.ts` prova recusa do rollback com
  tipo `boleto_pdf`, rollback limpo, CHECK estreita de volta e reapply. Roda antes dos rollbacks antigos: eles recriam a
  CHECK estreita com o diário da 276 ainda gravado.
- Painel (`bun run test`) 1407 pass; app do motorista 2106 pass; `bun run typecheck` na raiz, `eslint` e `prettier
--check` nos arquivos tocados: limpos.

## T3a — etapas e tempo de solução (20/10/2026)

Postgres 16 local, Bun 1.4.2.

- Contrato novo `test/trip-occurrence/timeline-stages.contract.ts` (12 casos: prorrogação do boleto ponta a ponta com as
  durações, tratativa que abre e soluciona, retorno atrasado não abre etapa, "Solicitado" não é a resposta quando há
  retorno da 248, PDF que não é o boleto → aguardando o operador com o motivo, reaberta e `resolvedAt` da última,
  cancelada terminal sem tempo de solução, autor de cada etapa, evento `contractor.reply`).
- API, integração: `trip-occurrence-timeline` (etapas e `resolvedAt` da tratativa encerrada) e
  `occurrence-contractor-reply-received` (o DANFE leva a etapa a `awaiting_operator` com `document_not_confirmed`; outra
  empresa não lê nada) → 19 pass, 0 fail.
- Painel: `test/trip/occurrence-timeline-stages.contract.ts` (frase do retorno, duração encerrada/correndo/terminal, cliente
  com e sem `stages`, etapa desconhecida descartada, lista de etapas igual à da API, locales) e `bun run test` → 8465 + 1407
  pass, 0 fail. `tsc --noEmit` e `eslint` limpos.
- Para a média por tipo (outra conversa): `timings.resolvedAt` é o início da última etapa quando ela é `resolved`, senão
  `null`; `openSince` é o registro.
