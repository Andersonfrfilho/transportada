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

## T3b — fechar sozinha depois de entregar (20/10/2026)

Postgres 16 local, Bun 1.4.2. Publicação em duas partes (ADR-0081 §9): painel e app tolerantes primeiro (PR #317, em
staging), servidor e editor depois.

- Migration `20261020181920_contractor_reply_resolve_on_delivery`, aditiva: `company_occurrence_types.contractor_reply_resolve_on_delivery`
  (padrão `false`) e `trip_occurrence_resolution_events.contractor_reply_id` (FK composta, único parcial). A CHECK do `system`
  passa a exigir **uma** causa (`case_event_id` ou `contractor_reply_id`). O `rollback.sql` recusa com o tipo usando a opção ou
  com resolução causada pelo retorno. `db:test` → 231 pass (recusa, rollback e reaplicação).
- Entregue ao motorista com a opção ligada, a mesma transação grava `resolved`/`system` com `contractor_reply_id`, sob
  `FOR NO KEY UPDATE` na ocorrência; cancelada ou já resolvida (último por `seq`) não grava. Repetir a entrega não grava de novo.
  O motorista lê `phraseKey: contractor_reply_delivered`; o painel mostra "Resolvida automaticamente ao entregar o documento ao motorista".
- API: contratos → 12498 pass, 0 fail; integração `occurrence-contractor-reply-received`, `occurrence-type-contractor-reply-write`,
  `trip-occurrence-timeline` → 25 pass, 0 fail (uma execução anterior teve 1 falha que não se repetiu).
- Worker: a cópia `contractor-reply-driver-delivery.support.ts` é igual byte a byte (paridade passa). 2808 pass; as 5 falhas são
  do decodificador do canhoto em `worker_thread` (`exited with 13`) e aparecem iguais na árvore sem esta mudança — ambiente local.
- Painel: caixa "Fechar a ocorrência sozinha depois de entregar ao motorista" no bloco do retorno; o `PUT` leva os doze campos.
  `bun run test` → 8475 + 1407 pass, 0 fail. `tsc` limpo nas três apps; `eslint` sem erro (avisos antigos).
- Limite conhecido: a resolução automática pela entrega não dispara `trip.occurrence-resolved`; o motorista já recebe o documento
  na mesma hora.

## T4 — trava de pedido repetido na mesma nota (20/10/2026)

Postgres 16 local, Bun 1.4.2. Painel tolerante no #322; servidor e editor no #327 (em staging, CI verde).

- Migration `20261020193306_occurrence_duplicate_request_policy`: padrão `allow`; o tipo que já pede retorno à contratante
  passa a `while_request_open`. `db:test` → 231 pass (recusa do rollback, rollback e reaplicação).
- Integração `occurrence-duplicate-request`, `occurrence-type-contractor-reply-write`, `occurrence-contractor-reply-received` →
  pass. Contratos da API → 12500 pass, 0 fail; `trip-schema` → 265 pass.
- Painel: seletor "Pedido repetido na mesma nota" no cadastro e no editor (tipo novo nasce `while_request_open`); aviso
  "Esta nota já tem esse pedido em andamento." `bun run test` → 8484 + 1407 pass, 0 fail. `tsc`, `eslint`, `prettier` limpos.
- Limites conhecidos: o recebimento da carga (237) não passa pela trava; as fotos de um pedido do motorista recusado pela
  trava ficam sem referência até o expurgo.

## T5 — resposta automática à contratante (20/10/2026)

Postgres 16 local, Bun 1.4.2.

- Migration `20261020204714_contractor_reply_acknowledgement`, aditiva: a coluna nula no tipo e o alvo
  `contractor_acknowledgement` na CHECK de `occurrence_contractor_reply_deliveries`. O `rollback.sql` recusa com tipo usando a
  opção ou com resposta automática registrada. `db:test` → 231 pass.
- `queueContractorReplyAcknowledgement` (cópia igual na API e no worker, paridade passa) roda depois da entrega automática ao
  motorista, num savepoint: e-mail na mesma thread (`Re:` do último assunto, para o remetente da resposta), mensagem
  `automatic` na conversa, outbox e linha de entrega com chave `contractor_acknowledgement:<conversa>`. Sem remetente
  verificado ou sem thread, grava a entrega como falha e não derruba a entrega ao motorista.
- O salvar do tipo recusa resposta rápida inativa, do motorista, de outra empresa ou inexistente com
  400 `OCCURRENCE_TYPE_ACKNOWLEDGEMENT_INVALID`; ausente mantém, `null` desliga.
- Integração: `occurrence-contractor-reply-received` (envia uma vez na mesma thread; a segunda é `already_queued`; desligada ou
  inativa não envia; aguardando o operador não envia) e `occurrence-type-contractor-reply-write` (7 pass). Contratos da API →
  12506 pass, 0 fail. Worker: `tsc` limpo, 2812 pass; as 5 falhas são as do decodificador do canhoto, iguais às da T3b.
- Painel: seletor "Resposta automática à contratante" no bloco do retorno, com "Desligada" e as respostas rápidas ativas da
  contratante; API anterior ao campo não mostra o seletor nem manda a chave; o parser aceita a chave antes da API.
  `bun run test` → 8494 + 1407 pass, 0 fail. `tsc` limpo; `eslint` sem erro (avisos antigos).
- Limites conhecidos: só por e-mail; não sai quando o operador aprova à mão (só na entrega automática).
