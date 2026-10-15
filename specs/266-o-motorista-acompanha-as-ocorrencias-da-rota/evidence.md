# Evidência — 266 O motorista acompanha as ocorrências da rota

## Decisões do dono (chat, 2026-10-15)

- Prévia aprovada: "certo aprovado pode fazer".
- Escopo: "App-motorista + API + e o painel verifique se o painel está pronto também".
- Reabrir: "ele pode reabrir e responder e tudo registrado em evento".
- Documentos: anexos do chat + fotos do motorista.

### Decisões do dono (chat, 2026-10-15, após a revisão de arquitetura)

- **A. Reabrir é explícito.** Na ocorrência resolvida o composer do chat fica travado; o motorista toca em "Reabrir" e só
  então envia, com a primeira mensagem indo com `reopen: true`. Tocou em Reabrir e não enviou: nada é gravado. Resposta
  sem `reopen` (app antigo, WhatsApp) é gravada sem reabrir.
- **B. Resolução automática mostra frase fixa.** Por status terminal da tratativa: `closed` → "Encerrada pelo escritório",
  `returned_to_warehouse` → "Mercadoria devolvida ao armazém", `cancelled` → "Tratativa cancelada pelo escritório". Nunca a
  nota interna. O critério de aceite 5 mudou. A resolução manual mostra a observação do operador, e o formulário do painel
  avisa "o motorista vai ler esta observação".
- **C. Só enquanto a viagem não termina.** Lista, detalhe e links assinados do motorista valem para viagem não finalizada.
  Depois: 404 no detalhe e "Viagem encerrada" no app num link antigo. `trip.occurrence-resolved` não é enviada se a viagem
  já terminou.
- **D. `trip.occurrence-resolved` vai à equipe inteira** (motorista e ajudantes).

## Levantamento contra `origin/staging` (d6459e4cd, 2026-10-15)

Feito por três buscas paralelas, só de leitura. A T0.1 confere as linhas antes de qualquer código.

### API

- A tratativa (`trip_occurrence_cases`, `trip.schema.ts:3550`) só abre com política de reentrega `allowed`/`blocked`
  (`occurrence-case.policy.ts:20`). A ocorrência de parada (`trip_stop_occurrences`, :1625) nunca abre tratativa.
- Estados: `recorded`, `under_review`, `returned_to_warehouse`, `awaiting_contractor`, `decided`, `closed`,
  `cancelled`. O terminal é protegido por `trip_occurrence_case_events_terminal_check` (:3720). Não existe
  `resolved` nem reabertura.
- "Recusada" não é estado do servidor: é a rejeição do registro na fila offline do app (246).
- Rota do motorista `GET /me/trips/current` (`me-trip.routes.ts:346`): `registeredOccurrences` só traz as que abriram
  retorno com a contratante (248); a parada não traz ocorrência.
- Foto e assinatura do motorista são servidas só ao escritório (`GET /trip-occurrences/:id/attachments`).
  `signature_object_id` é gravado e nunca lido.
- Conversa da ocorrência (183): uma por (ocorrência, participante), sempre "aberta", sem relação com a tratativa.
  O motorista não cria conversa de ocorrência (263 D4).
- Notificações: só inbox e e-mail. Nada notifica mudança de estado da tratativa
  (`occurrence-case.use-case.ts:88`).

### App do motorista

- Não existe entidade de ocorrência no cliente. `DriverRegisteredOccurrence` = `{ id, contractorReply }`
  (`driverTrip.types.ts:54`).
- "Enviada" vem de `sentReportKeys` da sessão; as chaves ficam em estado da página e se perdem ao recarregar.
- `OPENABLE_SUBJECT_TYPES = ['document','trip']` (`driverConversation.constant.ts:20`).
- O cabeçalho (`DriverShellHeader.component.tsx:40-78`) tem fila, sino e avatar. O alerta entra entre a fila e o sino.
- Faltam os ícones `share`, `paperclip` e `arrow-left`. Não há `navigator.share`; existe `saveDriverFile`.
- CSP: `frame-src 'none'`, `object-src 'none'`.

### Painel — veredito: não pronto

- A tratativa aparece só para `source === 'document'` (`TripOccurrenceDetail.page.tsx:436`,
  `TripOccurrenceTable.component.tsx:207`).
- Não há resolver com observação, reabrir ou selo de reaberta. "Fechar" não pede nota e é terminal.
- **Guardas estritos:** status desconhecido reprova `isFeedItem` e `readPage` lança `RESPONSE_INVALID` para a lista
  inteira (`tripOccurrenceFeedClient.service.ts:148,372`). Um `kind` desconhecido derruba a linha do tempo
  (`tripOccurrenceTimeline.validation.ts:49`). Daí a Fase 1 antes da API.

## T0.1 — Conferência do levantamento

Conferido no worktree `spec-266` (base `origin/staging` d6459e4cd, 2026-10-15). Caminhos do painel em
`apps/frontend-transportada/src/modules/trip/`, da API em `apps/api-transportada/src/`, do app em
`apps/frontend-driver/src/`.

| Afirmação                                                              | Status | Referência correta / nota                                                                                                                                                                |
| ---------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guarda `case.status` em `tripOccurrenceFeedClient.service.ts:~148`     | ✅     | `shared/tripOccurrenceFeedClient.service.ts:148` (`TRIP_OCCURRENCE_CASE_STATUSES.includes`)                                                                                              |
| `readPage` lança `RESPONSE_INVALID` (~:372)                            | ✅     | `:372` (`every(isFeedItem)`); outros `RESPONSE_INVALID` em :326, :355, :370                                                                                                              |
| `tripOccurrenceTimeline.validation.ts:~49` rejeita `kind` desconhecido | ✅     | `default: return false` em `:49`; `isOccurrenceTimeline` exige `events.every(isEvent)`                                                                                                   |
| `TripOccurrenceDetail.page.tsx:436` limita a `source === 'document'`   | ✅     | `pages/TripOccurrenceDetail.page.tsx:437` (off by 1)                                                                                                                                     |
| `TripOccurrenceTable.component.tsx:207` idem                           | ✅     | `components/TripOccurrenceTable.component.tsx:207`                                                                                                                                       |
| `trip_occurrence_cases` em `trip.schema.ts:~3550`                      | ✅     | `src/database/trip.schema.ts:3551`                                                                                                                                                       |
| CHECK terminal (~:3720)                                                | ⚠️     | `:3721`. Atenção: o CHECK barra evento com `from_status` em `closed`, `returned_to_warehouse`, `cancelled`. `decided` **não** é terminal no CHECK                                        |
| `trip_stop_occurrences` (~:1625)                                       | ✅     | `:1626`                                                                                                                                                                                  |
| `occurrence-case.policy.ts:20`                                         | ✅     | `resolveOccurrenceCaseOpening` em `src/trips/domain/occurrence-case.policy.ts:20`                                                                                                        |
| `occurrence-case.use-case.ts:88`                                       | ✅     | `createOccurrenceCaseUseCase` em `src/trips/application/occurrence-case.use-case.ts:88`; o arquivo não importa nem chama notificação                                                     |
| `me-trip.routes.ts:346`                                                | ✅     | `src/trips/presentation/me-trip.routes.ts:346` (rota GET da viagem atual); `registeredOccurrences` é montado em `application/attach-driver-document-contractor-replies.service.ts:55-58` |
| Motorista só vê anexo via `GET /trip-occurrences/:id/attachments`      | ✅     | `trip.routes.ts:457` (`TRIP_OCCURRENCE_FEED_ATTACHMENTS_PATH`, `TRIP_READ_POLICY`, rota do escritório); nenhuma rota `/me/**` serve foto ou anexo de ocorrência                          |
| `signature_object_id` nunca lido                                       | ✅     | Só escrito (`trip.schema.ts:1662`, `:2452`; `register-driver-occurrence.use-case.ts:46,93`) e indexado; nenhuma leitura em rota ou serviço                                               |
| `driverTrip.types.ts:54` `DriverRegisteredOccurrence`                  | ✅     | `modules/driver-trip/shared/driverTrip.types.ts:54`                                                                                                                                      |
| `OPENABLE_SUBJECT_TYPES` (`driverConversation.constant.ts:20`)         | ✅     | `modules/conversation/shared/driverConversation.constant.ts:20` = `['document','trip']`                                                                                                  |
| `DriverShellHeader.component.tsx:40-78`                                | ✅     | fila (botão `upload`), `NotificationBell`, avatar, nessa ordem                                                                                                                           |
| `icon.tsx` sem `share`/`paperclip`/`arrow-left`                        | ✅     | `components/ui/icon.tsx`: zero ocorrências                                                                                                                                               |
| Sem `navigator.share`                                                  | ✅     | nenhuma ocorrência de `share`/`canShare` em `src/`                                                                                                                                       |
| `saveDriverFile` existe                                                | ✅     | `modules/driver-trip/shared/driverFileSave.service.ts:9`                                                                                                                                 |
| CSP `frame-src 'none'`                                                 | ✅     | `modules/shared/contentSecurityPolicy.service.ts:89`                                                                                                                                     |

### Fatos novos para as próximas tasks

- **Pasta de migrations da API:** `apps/api-transportada/drizzle/` (`drizzle.config.ts`: `out: './drizzle'`; sem subpasta `meta`).
  Última migration: `20261015120000_occurrence_type_default_icons`. A nova usa prefixo posterior, no formato
  `AAAAMMDDHHMMSS_nome` (ex.: `2026101512xxxx_trip_occurrence_resolution_events`) e deve ser reconferida contra
  `origin/staging` antes de gerar.
- **IndexedDB do app do motorista:** `DATABASE_VERSION = 4` em `modules/driver-trip/shared/indexedDbQueue.service.ts:43`
  (banco `transportada.driver-trip`). O plano pede v5 para o store `trip-occurrences`: confere.
- **FK de `companies`:** a tabela é `companies` (`src/database/identity.schema.ts:106`, `id uuid`). Outros schemas
  usam `.references(() => companies.id, ...)`; o `REFERENCES companies(id)` do plano está certo.

## T0.2 — Revisão de arquitetura

Veredito do `architect` (opus): **aprovado com mudanças**. Todas aplicadas na ADR-0105 (agora "aceita"), no `spec.md`, no
`plan.md` e no `tasks.md`. As decisões do dono acima entraram junto.

| #   | Mudança                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Identidade sem polimorfismo: `document_occurrence_id` e `stop_occurrence_id` com FK composta `ON DELETE CASCADE`, `CHECK (num_nonnulls(...) = 1)` e dois índices parciais. A API mantém `kind` + `id`.                    |
| 2   | Ator: `case_event_id` com FK e único parcial; `CHECK ((actor_kind='system') = (case_event_id IS NOT NULL))`; CHECK da nota do `resolved` interno; sai `client_message_id`; único `(company_id, conversation_message_id)`. |
| 3   | Lock: sai o `FOR UPDATE` no último evento. Resolver, reabrir e resolver automático travam a linha da ocorrência `FOR NO KEY UPDATE`; estado lido depois; ordem tratativa → ocorrência; T2.4 audita a 167.                 |
| 4   | Resolução automática em `applyTransition` (único escritor do status), em transição terminal (`decided` não é); não duplica; o insert do evento da tratativa devolve o id.                                                 |
| 5   | Reabrir sem rota nova: `reopen?: true` na resposta existente do motorista (dois use cases), dentro de `replayOrRun.run`; 409 `OCCURRENCE_CANCELLED` / `OCCURRENCE_NOT_RESOLVED`; emenda da 263 D4 reescrita.              |
| 6   | Prefixo `/me/trips/current/route-occurrences` (o roteador pega o primeiro match dinâmico); contrato de rotas na T2.5 contra colisão.                                                                                      |
| 7   | Estado do motorista: `cancelled_at` (só nota) → cancelada; sem evento → aberta; último `resolved` → resolvida; `reopened` → aberta com `reopenedAt`. `cancel` da tratativa não cancela a ocorrência.                      |
| 8   | `case.transition` fora da linha do tempo do motorista (ADR-0045 §6); `trip.occurrence-resolved` sem nota.                                                                                                                 |
| 9   | Destinatário de `trip.occurrence-reopened`: último `resolved` interno → seu ator; `system` → ator do evento da tratativa ligado; sem `occurrences.resolve` → ninguém, com log `info` sem texto.                           |
| 10  | `occurrences.resolve` já existe (`authorization.policy.ts:115`): reusa, sem seed.                                                                                                                                         |

## Tasks

_(cada task registra aqui comando, saída resumida e commit)_

### T2.1 — Tabela `trip_occurrence_resolution_events` (`f824d7bab`)

- Migration `apps/api-transportada/drizzle/20261015151849_trip_occurrence_resolution_events/` (aditiva, rollback manual
  que recusa rodar com evento gravado). `db:generate` de novo: `no_changes`. A tabela mora em
  `occurrence-conversation.schema.ts` (FK para a mensagem; o inverso criaria ciclo de import).
- Contratos da API: 11762 pass, 34 skip; a falha da lista de migrations esperadas foi corrigida (454 pass em
  `database-migration`, `migration-chain`, `trip-schema`).
- **Ambiente:** o WSL não tem `docker` (integração do Docker Desktop desligada) e o Bun local é 1.4.3 (o `Makefile` fixa
  1.3.14), então `make migration-test` não roda daqui. O `db:test` rodou direto contra o Postgres local: 185 pass e 4
  falhas, todas de **tempo** em testes antigos (fiscal, backfill de viagem, pre-deploy) que fixam o próprio timeout;
  disco `/mnt/c` lento.
- **Prova direta da migration** num banco descartável (`spec266_check`): cadeia inteira aplicada em 13 s; rollback ok
  (tabela e linha do journal removidas); reaplicada; seis inserções inválidas recusadas, cada uma pelo CHECK esperado:
  `owner_check` (duas identidades e nenhuma), `kind_check`, `internal_note_check` (nota em branco), `reopen_check`
  (reaberta sem mensagem), `system_case_event_check`. Banco descartado no fim.

### T2.2 — Política pura do andamento (`4e8b2f92c`)

- `resolveOccurrenceResolutionState` e `resolveSystemResolutionPhraseKey` (`case_closed`, `case_returned_to_warehouse`,
  `case_cancelled`). Teste vermelho antes (módulo ausente), verde depois. `tsc --noEmit` limpo.

### T4.1 — Ícones `share`, `paperclip`, `arrow-left` (`2361af55b`)

- Desenhados (o painel não tem os três). Teste de renderização vermelho antes, verde depois. `bun run typecheck` ok;
  `bun run test`: 1898 pass, 2 falhas de **tempo** em `test/shared.contract.test.ts` (varredura de arquivos lenta no
  WSL), que passa 85/85 sozinho com `--timeout 60000`.

### T4.8 (parte do pacote) — `renderComposerLock` no `conversations-ui`

- O pacote 0.10.0 só trava o composer por `closed`. Prop nova `renderComposerLock` (minor), testes primeiro (4 novos;
  1370 pass), build ok. PR https://github.com/Andersonfrfilho/adatechnology-packages/pull/141, CI verde, **merge
  autorizado pelo dono** ("pode fazer o merge") em `79af4c1`; a pipeline publica a 0.11.0. O lado do app (flag
  `reopen` no adaptador e na fila) fica na T4.8.

### T4.2 — Dados das ocorrências da rota com retrato offline (`77360376c`)

- Tipos, validação, cliente (`listRouteOccurrences`, `readRouteOccurrence`, `readRouteOccurrenceFileUrl`), queries e
  store `trip-occurrences` (IndexedDB v4 → v5, só cria o que falta). "Sair" limpa o store.
- `bun run typecheck` ok; `bun run test`: 1914 pass, 2 falhas de **tempo** conhecidas em `shared.contract.test.ts`.
- Sem `fake-indexeddb` no repositório: o retrato é testado com store em memória e o upgrade v5 por leitura do fonte
  (molde existente). Os smokes Playwright tocados não rodaram aqui.

### T4.3 — Visão que junta servidor e fila (`9e20580ff`)

- `routeOccurrenceView.service.ts`: alerta, grupos, filtros, por parada **e por nota** (N por nota, mesmo tipo
  repetido, "+N" acima de 4), irmãs (mesma nota primeiro). `test/driver-trip.contract.test.ts`: 1568 pass, 0 fail
  (35 da 266).
- Ambiguidades do contrato fechadas no `plan.md` (2026-10-15): `phraseKey` na resolução `system`; 404 com códigos
  distintos (viagem não ativa × ocorrência × objeto); `reportKey` para casar a fila sem heurística. **Ajuste pendente no
  app** (vai junto com a T4.6): ler `phraseKey` e distinguir os dois 404.

### T1.1 — Feed aceita estado de tratativa desconhecido (`a32481c8b`)

- Teste vermelho antes (export `TRIP_OCCURRENCE_UNKNOWN_CASE_STATUS` ausente), verde depois:
  `test/trip/occurrence-case-status-tolerance.contract.ts`, 4 pass. Estado futuro vira `unknown`, campo extra
  (`resolution`) não reprova o item, estado conhecido segue igual, status que não é texto continua reprovando.
- `bun run typecheck`: exit 0. `eslint` nos arquivos tocados: limpo. `bun run lint` da app: os 2 erros eram do teste
  novo e foram corrigidos; os 16 avisos restantes são de outros arquivos.
- `bun run test`: 8205 testes, 8169 pass, 34 fail. Todas as 34 são timeout de 5 s em varreduras de arquivo do WSL
  (contratos de design system). Mesma lista do script com `--timeout 60000`: **8203 pass, 0 fail**.

### T1.2 — Linha do tempo ignora evento desconhecido (`50e382656`)

- Teste vermelho antes (3 falhas: evento `resolution.*` derrubava a linha), verde depois:
  `test/trip/occurrence-timeline-unknown-kind.contract.ts`, 5 pass. `resolution.resolved` e `resolution.reopened`
  saem, a ordem dos conhecidos fica. Evento desconhecido malformado também sai. `events` que não é lista e evento
  conhecido malformado (`actor` fora dos quatro) continuam reprovando.
- `bun run typecheck`: exit 0. `eslint` nos arquivos tocados: limpo.
- `bun run test`: 8210 testes, 31 timeout de 5 s (mesma família do T1.1). Com `--timeout 60000`: **8208 pass, 0 fail**.
- `bun run test:hooks`: 1367 pass, 0 fail.

### T2.3 — O escritório resolve com observação (`109a0c2e5`)

- `POST /trip-occurrences/:kind/:id/resolution` (`occurrences.resolve`): lock da linha da ocorrência
  `FOR NO KEY UPDATE`, leitura do último evento em lote (`DISTINCT ON`, sem N+1). Log sem a nota. Limite de taxa
  60/300 s (escopo `trip-occurrence-resolution`), acrescentado pelo executor.
- Contrato da rota: 9 pass. Contrato completo da API: 11781 pass, 25 skip, 0 fail.
- `occurrence-resolution.integration.ts`: 10 pass, 0 skip (nota e parada, 409 duplo, corrida — um vence e o outro 409 —,
  cancelada 409, isolamento de empresa, leitura em lote).
- Teste novo de colisão de rotas (`occurrence-resolution-route-collision.contract.ts`): nenhuma colisão.

### T2.4 — A tratativa encerrada resolve o andamento (`726489713`) — **código feito, medição pendente**

- `applyTransition` devolve o id do evento da tratativa; transição terminal grava `resolved` `system` na mesma
  transação, sem duplicar quando já resolvida ou cancelada; `decided` não grava. Integração: 3 terminais, sem
  duplicata, `decided` sem evento; arquivos de tratativa existentes: 12 pass, 0 skip.
- **Auditoria de lock:** sem inversão. O cancelamento da 167 só trava a ocorrência e lê a tratativa sem lock; a
  reentrega só trava a tratativa; o único caminho com os dois locks é o novo, na ordem tratativa → ocorrência.
- **Backfill: não se aplica** (dono, 2026-10-15): "não temos tratativas antes, estamos validando ainda e ajustando o que
  é necessário em staging". Não há tratativa real encerrada antes do deploy; T2.4 fechada sem backfill.

### T1.3 — Painel tolerante em produção

- PR #247 (`promote/266-painel-tolerante`, só T1.1 + T1.2) → `staging` (`8e10047df`); deploy de staging
  `38773239220` verde (quality, integração API 1–8, smoke painel e apps; deploy API e painel).
- PR #248 `staging` → `main`, **autorizado pelo dono**, merge `0e7bae488`; deploy de produção `38776599914`.

### T4.2b / T4.4 — Contrato refinado, alerta e ícones por nota (`df4c6bdf9`, `fbc3c164a`)

- `phraseKey`, `reportKey` (casamento exato da fila), 404 `tripFinished` × `notFound`. Alerta no cabeçalho (zero não
  renderiza), ícones com selos agrupados por NF e grupo "Parada", "+N" acima de 4, barra em alerta. Ícone novo `send`.
- `bun run typecheck`, `bun run lint` ok; `bun run test` 1968 pass, 0 fail. Golden da parada atualizado de propósito.

### T4.7 / T4.5 / T4.6 — Compartilhar, lista e detalhe (`7b685aa4b`, `eab394a3f`, `5ae1ff9f0`)

- `shareDriverFiles` (`navigator.share` com arquivos; sem suporte, baixa; cancelar não é erro). Lista com grupos,
  filtros por ícone, filtro por nota/parada, linha → chat ou detalhe, compartilhar. Detalhe com resolução (nota ou frase
  fixa), recusa, documentos, andamento, irmãs (nota e parada), "Ver a nota na parada" (`#stop-<id>`).
- Gates: typecheck e lint ok; `bun run test` 2007 pass, 0 fail. Só markup estático em teste; **não aberto em navegador**
  (fica para a T5.1).
- Desvios da prévia: "Corrigir e reenviar" leva à parada (o app não tem tela de correção); fotos como documentos, sem
  miniatura; destino da linha é o endereço da parada; compartilhar dentro da mensagem do chat não entrou.
- Riscos: "Ver" abre aba depois de buscar a URL (o iOS pode bloquear o pop-up); compartilhar exige CORS de GET no bucket.

### T2.5 / T2.6 — O motorista lê as ocorrências e os documentos (`7a49d730e`, `52a60f5da`)

- `GET /me/trips/current/route-occurrences`, `.../:kind/:id` e `.../:kind/:id/attachments/:objectId/url` (`trip.read`,
  5 min, `inline`, URL nunca em log). Leituras em lote. Código novo `DRIVER_TRIP_NOT_ACTIVE` (404) — não existia.
- `reportKey` = `trip_field_reports.idempotency_key` do canal `driver_app` (casamento exato com a fila do app).
- Contrato da API: 11800 pass, 25 skip, 1 falha do muro de nome de tipo (CA03) que lia arquivos **não commitados** do
  app do motorista naquele momento; reconferir na T5.3. Integração `route-occurrence-driver.integration.ts`: 7 pass,
  0 skip (nota, parada, cancelada, resolvida interna e `phraseKey`, reaberta, ajudante, outro motorista, outra empresa,
  viagem finalizada, objeto de outra ocorrência, objeto expirado).
- Leituras: reaberta → `state: open`, `reopenedAt`, `resolution: null`. O ajudante vê as ocorrências da viagem, mas
  só os anexos da **própria** conversa (regra da 263).

## Liberação gradual dos tipos (dono, 2026-10-15)

- Pedido: "por enquanto em Q.A. e prod libere apenas a prorrogação de boletos". Aplicado com `active` (já existente).
- **Staging:** via `railway ssh --service api` (URL interna, nunca impressa), uma transação: 15 tipos desativados,
  "Prorrogação do boleto" ativo. Antes, todos os 16 ativos: Avaria no transporte, Cobrança inesperada, Destinatário
  ausente, Devolução parcial, Devolução total, Divergência de quantidade, Divergência de quantidade na chegada, Doca
  interditada, Espera longa, Exigiram agendamento, Item avariado, Item avariado na chegada, Item faltante, Item faltante
  na chegada, Outro, Prorrogação do boleto. Reverter = reativar.
- **Produção:** 15 tipos ativos e **nenhum "Prorrogação do boleto"**; aplicar deixaria zero tipos ativos. O dono
  decidiu **deixar produção como está**.
- Incidente: a CLI do Railway 5.68 escreve o JSON de `variables --json` na saída de erro, e a senha do Postgres de
  staging apareceu no terminal da sessão. O dono decidiu não rotacionar ("deixa isso para lá"). Lição: capturar
  `2>&1` numa variável e nunca imprimir; preferir `railway ssh` com a variável do próprio contêiner.

### T3.1 / T3.3 — Painel resolve e descreve os eventos (`1f42bfd41`, `6a7e9ba71`)

- `OccurrenceResolutionPanel` no detalhe e na linha expandida, para nota **e** parada (`occurrences.resolve`),
  observação obrigatória com "O motorista vai ler esta observação.", `maxLength` 2000. 409 já resolvida → aviso e
  atualização; 409 cancelada → aviso. Mutation invalida feed (cobre detalhe e linha do tempo) e conversas.
- Linha do tempo: `resolution.resolved` (operador com nota; sistema com frase) e `resolution.reopened` (motorista).
- `bun run typecheck` ok; `test/trip.contract.test.ts --timeout 60000`: 2989 pass, 0 fail; eslint nos arquivos ok.
  Suíte completa e lint da app ficam para a T5.3.
- Acerto de formato: o painel lê o envelope **existente** da linha do tempo (`occurredAt`, `actor.kind/name`); a T2.9
  da API foi orientada a emitir esse mesmo envelope (não o rascunho `at/actorKind` do plano).

### T4.8 / T4.9 / T4.10 — Reabrir pelo chat, aviso e textos (`7022b38`, `76fed72`, `fb230d8be`)

- `@adatechnology/conversations-ui` **0.11.0** (pin exato, como as outras apps). `renderComposerLock`: resolvida →
  aviso + "Reabrir"; cancelada → aviso sem botão. O sinal `reopen` fica preso à mensagem (`clientMessageId`), vai na
  fila offline e sai com a mesma `Idempotency-Key`; a fila é FIFO por assunto (teste). 409 `OCCURRENCE_NOT_RESOLVED` /
  `OCCURRENCE_CANCELLED` é permanente, com aviso na tela. Sem conversa: "Reabrir e responder".
- `trip.occurrence-resolved` abre `/ocorrencias/:kind/:id`. Plurais corrigidos ("1 ocorrências", "1 novas").
- Gates: typecheck, lint ok; `bun run test` 2033 pass, 0 fail. Smokes Playwright não rodaram (T5.1).
- `bun.lock`: regenerado com Bun 1.4.3 (o repositório fixa 1.3.14); entradas `lightningcss*` removidas por ele foram
  restauradas à mão; `bun install --frozen-lockfile` passa. **Reconferir com Bun 1.3.14 antes de publicar.**
- Pendência de polimento (T5): o campo pode travar de novo por um instante depois do envio que reabre, até a lista
  atualizar; manter destravado enquanto o envio está em curso.

### T2.7 / T2.8 / T2.9 — Reabrir, avisos, linha do tempo e feed (`d3e14c0e3`, `97727888d`, `68a0dc77a`)

- `reopen: true` no `replySchema` das duas rotas de resposta (ainda `.strict()`); só assunto `occurrence`
  (`REOPEN_NOT_SUPPORTED_FOR_SUBJECT` 400 nos outros). Lock + estado + evento `reopened` com a mensagem na mesma
  transação; `reopen` entra no fingerprint de idempotência. Emendas registradas na 183 D4 e na 263 D4.
  Decisão do executor: sem `reopen`, a resposta a uma ocorrência cancelada segue como antes (aceita).
- Avisos `trip.occurrence-resolved` (toda a equipe, só com viagem visível ao motorista, sem nota) e
  `trip.occurrence-reopened` (quem resolveu; sistema → ator do evento da tratativa; sem `occurrences.resolve` → não
  envia). Depois do commit, sem desfazer em falha; nunca no replay idempotente.
- Linha do tempo no envelope existente (`occurredAt`, `actor {kind,name}`, `note`, `phraseKey` / `messageId`), conferido
  contra o guarda do painel por teste espelho. Feed: `resolution {state, at, actorKind} | null` e
  `resolutionStateIn` em SQL (estados disjuntos; "em aberto" = `open,reopened`).
- Gates: `tsc --noEmit`, eslint ok. Contratos: 11809 pass, 25 skip, 1 falha do muro CA03 lendo arquivos não commitados
  do app (reconferir na T5.3). Integração: `occurrence-reopen` 5 pass, `occurrence-resolution` 14 pass, suítes de
  conversa/linha do tempo/feed/detalhe tocadas 28 pass; 0 skip.

### T2.10 — Documentação viva da API (`a07adce50`)

- `apps/api-transportada/CLAUDE.md` § "Andamento da ocorrência (ADR-0105)" e `docs/ai-context/api-transportada.md`
  § Spec 266. A API não tem OpenAPI ("Sem OpenAPI nesta API").

### T3.2 — Selo e filtro de andamento no painel (`80f858c05`)

- `resolution` lido de forma tolerante; selos "Resolvida" e "Reaberta pelo motorista"; estado passado ao
  `OccurrenceResolutionPanel`; filtro "Andamento" (`resolutionStateIn`, "Em aberto" = `open,reopened`).
- `bun run typecheck` ok; `test/trip.contract.test.ts --timeout 60000`: 3002 pass, 0 fail (20 novos); eslint ok.
