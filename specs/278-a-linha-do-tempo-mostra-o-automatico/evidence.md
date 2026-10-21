# Evidence — 278

21/10/2026, Postgres 16 local (porta do `.env.test`), Bun 1.4.2. Worktree `work/linha-automatica`.

## T1 — motivo do evento (D1, D2)

- Contrato vermelho antes: `contractor-reply.contract.ts` (cópia idêntica no worker) falhou no import de
  `resolveContractorReplyEventReason`; depois → 51 pass (5 casos novos, CA1).
- Migration `20261021030029_contractor_reply_event_document_reasons` (gerada por `db:generate`, com `snapshot.json`): só
  alarga `occurrence_contractor_reply_events_reason_check`. `rollback.sql` recusa com evento gravado nos motivos novos.
  Assertion `contractor-reply-event-document-reasons.assertion.ts` (CHECK larga, rollback estreita e tira o diário,
  reapply) e os rollbacks antigos que recriam a mesma CHECK desfazem a 278 antes. `db:test` → 206 pass, 25 skip, 0 fail.
- Integração `occurrence-contractor-reply-received` — API 20 pass (boleto certo grava `document_confirmed`, sem leitor
  grava `document_without_text`, retorno segue `document_not_confirmed`); worker 14 pass (mesmos casos pelo e-mail, texto
  lido na thread do pdf.js).

## T2 — linha do tempo na API (D3–D6)

- Contrato novo `test/trip-occurrence/timeline-automatic.contract.ts` (ordem no mesmo instante: conferido → recebido →
  entrega → entregue → leitura; marcos; `awaitingAttachment` com retorno aguardando/vencido, sem retorno, sem conversa;
  etapas inalteradas e motivo só na ida ao operador).
- Integração (3 casos novos em `occurrence-contractor-reply-received.integration.ts`, CA4): boleto conferido, entregue pelo
  chat do app ao "Motorista Sintético" (tentativa 1, marco) e lido (`status_times.read`); "Solicitado" sem anexo com
  `awaitingAttachment: true`; motorista sem conta → entrega `skipped`/`driver_without_account`, sem leitura; PDF sem texto
  → `without_text` e etapa com `document_without_text`; outra empresa recebe `null`; nada de endereço no JSON.
- API contratos (`bun --env-file=../../.env.test test --timeout 120000`): 12518 pass, 26 skip, 0 fail (213 arquivos).
- API integração (`test:integration`, 307 arquivos): rodada em duas partes porque a lista inteira passa de 2 h nesta
  máquina — arquivos 0–161 sem nenhuma falha (a execução foi interrompida no 163 para caber no limite, sem resumo);
  arquivos 162–306 → 643 pass, 4 skip, 0 fail. Uma primeira execução concorrente com o worker deu `too many clients`
  (ambiente), refeita sozinha.

## T3 — painel (CA5)

- Contrato novo `test/trip/occurrence-timeline-automatic.contract.ts` (títulos e detalhes, filtro Automático só com
  Sistema, parser estrito dos tipos novos e tolerante ao e-mail da API anterior, locales pt-BR/en com a frase aprovada).
- O painel publicado descarta tipo de evento desconhecido (266 T1.2): a API pode ir antes do painel.

## T4 — aba Tipos (D7)

- Contrato novo `test/trip-hooks/occurrence-type-saved-notice.contract.ts` (hook real + `QueryClient`: aviso depois do
  `PUT` de tipo existente, apagado ao começar outro salvamento, nunca na falha nem no cadastro de tipo novo; painel com
  `role=status` e sem aviso quando há erro).
- Painel `bun run test` → 8512 pass + 1412 pass (hooks), 0 fail.

## Gates

- `bun run typecheck` na raiz (7 apps): limpo. `bun run lint` na API, no worker e no painel: 0 erros (16 avisos antigos
  no painel). `prettier --check` nos arquivos tocados: limpo.
- Worker `bun run test`: 2818 pass, 5 fail — os 5 do decodificador do canhoto em `worker_thread`, os mesmos registrados
  na 276 (ambiente). Worker `test:integration`: 348 pass, 4 skip, 6 fail — RabbitMQ (`ECONNREFUSED 127.0.0.1:61672`),
  SIGTERM, anexo do agregado e canhoto; os mesmos 6 falham com a mudança guardada (`git stash`).

## Não feito / observações

- Item 5 do pedido (leitura do motorista) **foi** feito: há marcador de leitura (`status_times.read` da mensagem do app).
- A etiqueta "NOVO" do preview não entra (pedido).
- Revisão visual com print (frontend CLAUDE.md, `web.md` §15) não foi feita nesta sessão (sem navegador); as linhas
  novas usam as classes existentes da linha do tempo (`occurrenceTimelineNote`) e do aviso (`successNotice`).
