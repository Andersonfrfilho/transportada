# Evidência — 183

## Ambiente

- Checkout: `origin/staging` (`9e51f3a9`) + os commits de documentação da spec.
- Bun `1.3.14` (o `package.json` exige esta versão; a sessão começou com a `1.3.11`).
- `make migration-test`: **110 pass, 0 fail** (8 arquivos, Postgres descartável), antes de qualquer
  mudança. Serve de linha de base.
- Contratos da API (`bun --env-file=../../.env.test test --timeout 120000`): **7206 pass, 23 skip, 9
  fail** em 183 arquivos, antes de qualquer mudança. As 9 falhas são todas de
  `toll booth catalog repository (spec 154, T201)` — preexistentes em staging e sem relação com a 183.

## T101 — Conferir o pacote — ⛔ parada: a versão publicada não tem tudo

Versões conferidas no npm em 2026-09-24: `@adatechnology/conversations-ui@0.3.1`,
`meta-whatsapp-provider@0.3.0`, `meta-whatsapp-module@0.4.1`, `meta-whatsapp-contracts@0.4.0`. A
conferência leu os `.d.ts` publicados (e o `src/` que o `conversations-ui` publica junto).

| Item da ADR-0072                                  | Situação        | Onde / por quê                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Abas por participante                             | ❌ ausente      | `ConversationPane` mostra uma conversa só; não há componente de abas. Dá para o produto montar as abas com dois `ConversationPane`.                                                                                                                                                                    |
| Selo de canal por mensagem                        | ❌ ausente      | `MessagePayload` não tem `channel`; o canal é da conversa, e `ConversationChannel` é união fechada `whatsapp \| messenger \| instagram \| webchat` — sem `email`, `app`, `portal`.                                                                                                                     |
| Seletor de canal com a janela de 24h              | ⚠️ parcial      | Não há seletor. Há `windowOf()` (fresh/warning/critical/expired), `isWindowBlocking` e `WindowExpiredNotice`.                                                                                                                                                                                          |
| Respostas rápidas por prop, tocar preenche        | ✅              | `MessageComposerProps.quickReplies`; o clique chama `setText`, não `onSend`.                                                                                                                                                                                                                           |
| Anexos (lista, remover, limite) e nas mensagens   | ⚠️ parcial      | Lista e remoção existem; o compositor **não** aplica limite de tamanho (o produto valida com `resolveMaxAttachmentSizeBytes`). `MediaRenderer` mostra imagem, vídeo, áudio e documento.                                                                                                                |
| Player e gravador de áudio                        | ⚠️ parcial      | `AudioPlayer` (tocar, posição) sem **velocidade**; `AudioRecorderButton` com revisão antes de enviar.                                                                                                                                                                                                  |
| Transcrição exibida                               | ✅              | `MessagePayload.transcription` + `AudioTranscription`.                                                                                                                                                                                                                                                 |
| Selo de status                                    | ⚠️ parcial      | `status: sent \| delivered \| read \| failed` + `StatusTicks`; o produto controla o que manda.                                                                                                                                                                                                         |
| Tema pela camada `.cv-*`, sem Tailwind (ADR-0051) | ❌ **conflito** | `styles.css` tem ~243 regras `.cv-*`, mas balões e compositor ainda usam utilitárias Tailwind e o pacote depende de `tailwind-merge`; o `theme` (`bubbleSent`…) existe só como tipo — nada o aplica, e o `ConversationsProvider` não o recebe. É exatamente o que a ADR-0051 recusou para este painel. |
| Textos por `labels`                               | ⚠️ quase        | `labels` por componente e `ConversationLocalesProvider`; os rótulos de `WINDOW_FILTERS` estão fixos em pt-BR.                                                                                                                                                                                          |
| Envio de mídia (documento, imagem, áudio)         | ✅              | `WhatsAppMessageProvider.sendMedia`; a conversão do áudio para ogg/opus só acontece se o construtor receber um transcodificador, e `createWhatsAppProvider` não aceita um.                                                                                                                             |
| Eventos de status ao produto                      | ⚠️ parcial      | `hooks.onStatusUpdate` existe, mas o módulo descarta o status de mensagem que não está na tabela dele — mensagem enviada fora do módulo nunca chega ao gancho.                                                                                                                                         |
| Política pura da janela no servidor               | ⚠️ parcial      | Só na UI (`windowOf`). No módulo a checagem é privada e depende do banco (`hoursSinceLastInbound`).                                                                                                                                                                                                    |
| Download da mídia recebida                        | ✅              | `fetchMediaAsBase64`; `onMediaReceived` + `ingestInboundMedia`.                                                                                                                                                                                                                                        |
| Transcrição no servidor                           | ✅ (porta)      | `AudioTranscriber` injetável, modo `auto`/`onDemand`, política por empresa; o motor vem de outro pacote (`audio-transcription-provider`).                                                                                                                                                              |

**Resultado:** a T101 **não fecha**. Pela regra do prompt de execução, a execução segue pelas Fases 2
e 3 (que não dependem do pacote) e para antes da Fase 4. O bloqueante é o conflito com a ADR-0051
(Tailwind); os ausentes (selo de canal por mensagem com canais do produto, seletor de canal,
velocidade do áudio, tema aplicado, status de mensagem enviada fora do módulo) precisam de versão
nova do pacote ou de decisão de montar no produto — decisão do dono do projeto.

**Decisão (2026-09-24, dono do projeto):** "o SDK é genérico; tudo que for de estilo customizável
nosso fica do nosso lado". Com isso a T101 fecha: o produto usa as peças que existem, compõe o que é
dele (abas, selo de canal por mensagem, seletor de canal) e aplica o estilo por `classNames` e CSS
sobre `.cv-*`, sem Tailwind. Registrado na ADR-0072 § "Revisão na aceitação". Velocidade do áudio
(ausente no `AudioPlayer`) fica como melhoria do pacote; a P9 aceita o player sem ela até lá.

## T001 — ADRs aceitas

ADR-0072 e ADR-0073 com `Status: aceito (2026-09-24)` e a seção "Revisão na aceitação". A única
`[NEEDS CLARIFICATION]` que resta na spec é o provedor de transcrição, e ela só bloqueia a T706.

## T003 — Anotação na 143

`specs/143-a-contratante-responde-por-e-mail/tasks.md`: notas em T014, T015, T016, T018, T024 e T025
(commit `6229baac`). Nada da 143 foi apagado.

## Divergências entre a spec e o código de staging — ⛔ parada antes da Fase 2

A spec foi escrita sobre o `main`, 371 commits atrás de `staging`. Auditoria de 2026-09-24 contra
`origin/staging` (`9e51f3a9`):

| #   | A spec supõe                                                          | Staging tem                                                                                                                                                                                                                     | Correção proposta                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A lista e o detalhe usam `trip.read`                                  | A listagem e os anexos usam `fleet.read` (`trip.routes.ts:334`); `trip.read` é do motorista e do agregado (`authorization.policy.ts:229,232`)                                                                                   | Detalhe e colunas com `fleet.read`; o RF3 ("sem `fleet.read` só nome e foto") sai, porque todo mundo que vê a lista já tem `fleet.read`.                                                                                                                 |
| 2   | Não existe tratativa da ocorrência                                    | A spec 164 de staging (31/31) criou a **tratativa** (`trip_occurrence_case_events`, rotas `/:id/case/*` e `/:id/case/settlement`), a decisão pelo portal com `occurrences.decide` e o acerto que gera `delivery_charges`        | A 183 **não cria caminho de decisão**: conversa só conversa. A decisão continua na tratativa da 164 (painel com `occurrences.resolve`, portal com `occurrences.decide`). Sai a D4 (botão do WhatsApp decide) e a decisão com `charges.decide` no portal. |
| 3   | O e-mail pode decidir (143 P2)                                        | A 164 fixou: fechada a 143, o e-mail só **anuncia** a decisão pendente no portal — nunca é um segundo caminho de decisão                                                                                                        | Seguir a 164: nem e-mail, nem WhatsApp, nem transcrição decidem. A 143 T019–T022 (decisão por e-mail) precisa ser revista à parte — fora da 183.                                                                                                         |
| 4   | O botão "Detalhar" só expande descrição e fotos                       | Ele também mostra o `OccurrenceCasePanel` (decisão, acerto, reentrega) para ocorrência de nota (`TripOccurrenceTable.component.tsx:116-122`)                                                                                    | O detalhe `/ocorrencias/:id` hospeda o painel da tratativa e o do acerto; a linha do tempo (RF19) lê `trip_occurrence_case_events`; o link da linha do tempo da viagem (spec 180 RF15) aponta para o detalhe.                                            |
| 5   | O portal ganha a tela "Ocorrências" e a rota `/client/me/occurrences` | Já existem: aba "Ocorrências" com `DecisionForm` (`frontend-client/src/main.tsx:34,97`) e `GET /client/me/occurrences` (`api.constant.ts:143`); o portal só mostra tratativas `awaiting_contractor`/`decided`/`closed` (164 D5) | A conversa entra **na tela que já existe**. Rotas novas do portal chaveadas pela `public_ref` da conversa (sem id interno). Visibilidade: ver pergunta ao dono.                                                                                          |
| 6   | Nenhuma rota do portal recebe id interno                              | `POST /client/me/occurrences/:id/decision` recebe o UUID interno da ocorrência (`contractor-occurrence.routes.ts:42,116`)                                                                                                       | Divergência da 164 com a regra do portal — **não** se corrige na 183; registrada para decisão à parte.                                                                                                                                                   |
| 7   | Toda ocorrência tem motorista                                         | O motorista é opcional na listagem (left join, `driverName ?? ''`), e a spec 156 trouxe autoria "em nome do motorista"                                                                                                          | A aba Motorista trata "sem motorista" (não aparece) e mostra quem registrou em nome dele.                                                                                                                                                                |
| 8   | RF4: `approved`/`rejected` vêm da taxa                                | A listagem já traz `case{status, decision, settlementTotal…}` (`trip-occurrence-feed.query.ts:180-217`)                                                                                                                         | RF4 lê a decisão da tratativa.                                                                                                                                                                                                                           |
| 9   | Mídia do WhatsApp é trabalho novo                                     | A spec 161 já baixa mídia da Meta (`fetchMediaAsBase64`, `register-operator-trip-flow-actions.ts:808`)                                                                                                                          | RF10/RF17 reaproveitam esse caminho.                                                                                                                                                                                                                     |
| 10  | 143 T014 aberta                                                       | `reply-token.policy.ts` já existe                                                                                                                                                                                               | T003/T403: a T014 da 143 está meio feita; só falta o teste.                                                                                                                                                                                              |

Nada disso foi implementado. **Todas as correções foram aplicadas à spec** (commit `26441ff7`) por
decisão do dono do projeto, e a visibilidade no portal segue a 164 D5.

## T201 — Contrato de `GET /trip-occurrences/:id` (vermelho)

- `test/trip-occurrence/detail.contract.ts` (caso de uso: escopo pela empresa do contexto; nulo vira
  404 `TRIP_OCCURRENCE_NOT_FOUND`) e `test/trip-http/occurrence-detail.contract.ts` (rota: `fleet.read`
  → 200 com `{ data }`; só `trip.read` → 403 sem tocar o caso de uso; 404 tipado; id que não é UUID
  recusado; `cache-control: no-store`, porque a resposta leva telefone e e-mail do motorista).
  Fixture: `test/fixtures/trip-occurrence-detail.fixture.ts`. Registrados nos entrypoints
  `trip-occurrence.contract.test.ts` e `trip-http.contract.test.ts` (já listados no `package.json`).
- Rodado: `bun --env-file=../../.env.test test ./test/trip-occurrence.contract.test.ts
./test/trip-http.contract.test.ts` → **0 pass, 2 fail**: `Cannot find module
.../read-trip-occurrence-detail.use-case.js` e `.../trip-occurrence-detail.routes.js`.
- Decisão registrada na execução: a foto do motorista sai pelo caminho **público** que já existe
  (`/public/company-users/:token/picture`, token já publicado no provedor de identidade); a rota
  autenticada da foto exige `users.manage`, que o operador não tem.

## T202 — Caso de uso, query e rota do detalhe (verde)

- `read-trip-occurrence-detail.use-case.ts`, `trip-occurrence-detail.routes.ts` (`fleet.read`,
  `no-store`), `trip-occurrence-detail.query.ts` e o filtro por id na consulta da listagem
  (`findTripOccurrenceFeedItem`: **a mesma** consulta da linha, presa a um id — detalhe e linha não
  divergem). Fiação em `src/main.ts`.
- Integração nova `test/integration/trip-occurrence-detail.integration.ts` (no `package.json`):
  ocorrência de nota igual à linha da listagem + motorista completo (foto pública, WhatsApp
  verificado); ocorrência de parada (outra fonte, sem tratativa); **outra empresa não acha nada**
  (nem de nota, nem de parada) e id inexistente é `null`; viagem sem motorista → `driver: null`;
  vínculo desativado e telefone não verificado não expõem foto nem WhatsApp.
- Rodado no estado da T202 (antes da T203): contratos `trip-occurrence` + `trip-http` + integrações
  `trip-occurrence-detail` e `trip-occurrence-feed-case` → **387 pass, 0 fail**. Lint dos arquivos
  tocados limpo; `bun run typecheck` limpo.
- Suítes inteiras (rodadas com a T202 e a T203 juntas, porque a T203 veio em seguida no mesmo
  checkout): contrato da API **7222 pass, 23 skip, 0 fail**; integração da API **566 pass, 7 skip, 9
  fail** — 8 são de armazenamento de objetos (`OBJECT_STORAGE_UNAVAILABLE`: o MinIO do compose vem de
  `quay.io`, que a rede desta sessão bloqueia) e 1 é `occurrence-case-closure` estourando os 5 s sob a
  carga da suíte inteira; rodada sozinha, **1 pass, 0 fail**. Nenhuma das 9 toca código da 183.
- Divergências achadas na execução e aplicadas:
  - **CNH fora do detalhe.** `test/trip/privacy.contract.ts` (spec 079 T015, ADR-0039) proíbe o
    módulo `trip` de ler `licenseExpiresAt`/`licenseNumber`: são dados que vão ser criptografados, e o
    que torna isso barato é não haver leitor. A P2 da spec pedia validade da CNH; saiu da API e da
    tela. Telefone e e-mail continuam, como já aparecem no detalhe da viagem.
  - **Telefone da ficha ≠ telefone do WhatsApp.** A ficha grava 10–11 dígitos
    (`fleet_drivers_phone_check`); o WhatsApp verificado grava com `55`. O detalhe devolve os dois
    separados (`phone`, `whatsappPhone`).
  - O `.env.test` aponta para o Postgres de E2E (porta 65432); aqui só ele sobe (sem MinIO/RabbitMQ).

## T203 — A nota na listagem (verde)

- Contrato escrito antes: `test/integration/trip-occurrence-feed-document.integration.ts` (no
  `package.json`) rodou **2 pass, 4 fail** antes da implementação (`document` ausente).
- Implementação: `toFeedItems` em `trip-occurrence-feed.query.ts` monta o bloco `document` da página
  inteira em **duas leituras fixas** — emitentes com o contratante casado por CNPJ **dentro da
  empresa** e `listStopAddresses` (destino físico, spec 073). Página sem nota não consulta nada.
- Provas contra Postgres: valor `'10000.0000'` (string decimal), contratante pelo emitente, destino
  `delivery` vencendo `recipient`; emitente sem cadastro → nome do emitente e `contractorId: null`;
  parada sem nota → `document: null`; contratante de **outra empresa** com o mesmo CNPJ não é casado;
  **mesmo número de consultas** para 1 e para 20 ocorrências.
- Rodado: contratos `trip-occurrence`, `trip-http`, `trip-schema` + integrações `feed-document`,
  `detail`, `feed-case` → **492 pass, 0 fail**. Typecheck e lint limpos.
- Correções da spec: RF2 lia "endereço do destinatário"; o código segue o destino físico, como o
  `CLAUDE.md` da API exige para quem decide **lugar**. O RF4 foi para a T404.
- O frontend não quebra com o campo novo: o guard da linha é tolerante a chave a mais (B5/B6).

## T204 — O detalhe da ocorrência no frontend (verde)

- Contrato escrito antes: `test/trip/occurrence-detail.contract.ts` (entra por `test/trip.contract.test.ts`)
  falhou na importação antes da implementação (`tripOccurrenceRoute.service` inexistente). Cobre: rota
  `/ocorrencias/:id` (build/parse, barra final, id codificado, caminho alheio → `null`), o shell
  (`main.tsx` resolve o detalhe para o item de menu Ocorrências e renderiza a página), o link da linha
  do tempo da viagem (180 RF15), o cliente `GET /trip-occurrences/:id` (autenticado, `no-store`, valor
  da nota **só** como string decimal, motorista fora do formato = resposta inválida) e o contato do
  motorista (`tel:`, `mailto:`, `wa.me` só com WhatsApp verificado, foto pela URL pública da API).
- Implementação: `TripOccurrenceDetail.page.tsx` (voltar, esqueleto na forma do conteúdo, cabeçalho
  com autoria e "em nome de", Resumo com fotos, Nota com contratante/valor/destino físico, Contato do
  motorista, Tratativa com `OccurrenceCasePanel` — que já traz o painel do acerto da 164 e as
  permissões de lá). Na tabela, o tipo virou link e a linha inteira abre o detalhe (clique em botão ou
  link da própria linha não conta). O evento de ocorrência da linha do tempo da viagem aponta para o
  detalhe.
- Rodado: `bun run --cwd apps/frontend-transportada test` → **5164 pass, 0 fail** (contratos) e
  **44 pass, 0 fail** (hooks); `bun run lint` e `bun run typecheck` na raiz limpos.
- Revisão de design (`web.md` §15), prints em `prints/`: `lista-desktop.png`,
  `detalhe-nota-desktop.png`, `detalhe-nota-celular.png` (390 px, sem rolagem horizontal — asserção no
  smoke), `detalhe-parada-desktop.png` (sem nota, sem motorista). Smoke
  `test/spec-183-prints.smoke.spec.ts`, fora da lista da CI como os prints da 159/164: **5 pass**.
  Achados corrigidos na própria task:
  - "Descrição" era `h3` ao lado de `dt` — virou fato largo do mesmo `dl`, em peso normal;
  - "Escrever e-mail" era `ghost` ao lado de dois `secondary` — mesma variante e com ícone; "Ligar"
    usava o ícone de enviar, trocado;
  - o `h1` global tem `max-width: 12ch` (título de vitrine) e quebrava o nome do tipo palavra a
    palavra ("DOCA / FECHADA") — `.occurrenceTitle` com 40ch só nesta página.
- Divergências achadas e aplicadas:
  - **CSP**: `https://wa.me` é navegação, não fetch — entrou em `NON_FETCH_ORIGIN`
    (`test/shared/content-security-policy.contract.ts` reprovava a origem nova).
  - **Item/quantidade/unidade** (166/172) não vêm na API do detalhe: saíram da T204 para a **T207**,
    em vez de crescer esta task com mudança de API.

## T205 — As colunas da nota na listagem (verde)

- Contratos escritos antes, ambos vermelhos antes da implementação:
  - `test/trip/occurrence-table.contract.ts`: ordem das chaves (as três depois de Nota, Aviso por
    último), preferência gravada **antes** das colunas novas (a chave continua `v1`: as novas entram
    visíveis no fim, sem perder a ordem nem o que a pessoa escondeu), e
    `describeOccurrenceDocumentCells` (com nota; sem nota; sem contratante e sem destino → célula
    vazia, nunca "null"). Falhou na importação.
  - `test/trip/occurrence-feed-tolerance.contract.ts`: o bloco `document` na linha do feed segue a
    regra B5/B6. **Ausente degrada para `null`** (bundle novo contra API anterior à 183); presente com
    valor `number` reprova a resposta. O detalhe segue estrito: nasceu com a 183.
- Implementação: `document` passou de `TripOccurrenceDetail` para `TripOccurrenceFeedItem`. A célula
  do contratante leva o CNPJ abaixo; o valor sai por `formatAmount`, em fonte de dado e alinhado à
  direita; nome e endereço quebram em até ~16rem.
- Rodado: `bun run --cwd apps/frontend-transportada test` → **5171 pass, 0 fail** e **44 pass, 0
  fail** (hooks); `bun run lint` e `bun run typecheck` na raiz limpos.
- Revisão de design, prints em `prints/`: `lista-desktop.png` (1440 px: a tabela ganha rolagem
  horizontal, como toda tabela da base, `min-content`) e `lista-colunas-da-nota.png` (rolada até o
  valor, com asserção `toBeInViewport`). Smoke com **6 pass**. Achados corrigidos na task:
  - nome e endereço empurravam o valor para fora: agora quebram em duas linhas;
  - o cabeçalho "Valor NF-e" herdava a fonte de dado da célula: ganhou classe própria, só com o
    alinhamento.
- Divergência aplicada: a coluna **Conversa** depende do RF4, que já tinha ido para a T404. Ela saiu
  da T205 e entrou na T404.

## T704 — As cores dos balões (verde, antecipada)

- **Por que antes da hora:** a T206 (linha do tempo, RF19) pinta cada ator "com as mesmas cores dos
  balões". Sem os tokens, a T206 teria de escrever cor literal (proibido: só tokens) ou misturar duas
  tasks num commit. A T704 é `[P]`, então foi antecipada inteira, em commit próprio. A parte "passados
  ao tema de cada aba" depende de a aba existir e foi para a T407, que cria a primeira.
- Contrato escrito antes: `test/design-system/bubble-tokens.contract.ts` (entra por
  `test/design-system.contract.test.ts`) deu **3 fail** antes dos tokens.
- Tokens em `src/styles/index.css`, no bloco escuro e nos dois blocos claros (o contrato de tema já
  exige os claros idênticos):

  | token                       | escuro    | claro     | texto (escuro / claro) |
  | --------------------------- | --------- | --------- | ---------------------- |
  | `--color-bubble-out`        | `#8c5527` | `#eec59c` | 5,41 / 9,06            |
  | `--color-bubble-contractor` | `#1d4468` | `#d6e7f8` | 8,97 / 11,51           |
  | `--color-bubble-driver`     | `#1d4d35` | `#d6f0e1` | 8,61 / 12,04           |

  O texto é o `--color-fog` de cada tema. A enviada fica a 1,59–1,66 (escuro) e 1,27–1,33 (claro) de
  razão de luminância das recebidas; o piso do contrato é 1,25.

- Rodado: `bun test test/design-system.contract.test.ts` → **393 pass, 0 fail**.

## T206 — A linha do tempo da ocorrência (verde)

- **API**, contratos escritos antes e vermelhos antes da implementação:
  - `test/trip-occurrence/timeline.contract.ts`: política pura `buildOccurrenceTimeline`. Ordem
    crescente, com desempate do mesmo instante (registro → fotos → tratativa → e-mails); intervalo
    desde o anterior; fotos do mesmo envio viram um evento com a contagem; eventos-chave (registro e
    decisão); ator entre os quatro; os três tempos. Falhou na importação.
  - `test/trip-http/occurrence-detail.contract.ts`: `GET /trip-occurrences/:id/timeline` com
    `fleet.read`, `trip.read` → 403 sem tocar o caso de uso, 404 de outra empresa, UUID inválido,
    `no-store`. **3 fail** sem a rota, verdes com ela.
- A query `trip-occurrence-timeline.query.ts` faz quatro leituras fixas, todas com `company_id`:
  - a linha do feed;
  - as fotos da tabela da 161, ou a coluna antiga;
  - `trip_occurrence_cases` → `trip_occurrence_case_events`, com o nome de quem agiu;
  - `contractor_mail_threads` → `contractor_mail_messages` da conversa desta ocorrência.

  Do e-mail só saem direção, hora, entrega e interpretação — **nunca** endereço, assunto ou corpo.
  Envio sem autor é o aviso automático (ator `system`); a resposta é da contratante, sem nome (o nome
  chega pela T406).

- **Na ordem, a query veio antes do teste dela:**
  `test/integration/trip-occurrence-timeline.integration.ts` (no `package.json`) foi escrito depois
  da query. Na primeira rodada reprovou por fixture (CHECKs de `trip_occurrence_cases` e de
  `contractor_mail_threads`, e o `now()` do registro depois dos horários fixos). Corrigida a fixture:
  **3 pass**. Cobre:
  - a história completa em ordem, com os três tempos;
  - o aviso como `system`, a decisão como `contractor` e evento-chave;
  - o JSON sem o domínio do e-mail e sem o texto do corpo e do assunto;
  - outra empresa → `null`;
  - a conversa **de outra empresa** apontando para o mesmo id não entra;
  - parada sem foto e sem tratativa → só o registro, com o motorista.
- **Tela**, contrato escrito antes: `test/trip/occurrence-timeline.contract.ts` (entra por
  `test/trip.contract.test.ts`), vermelho na importação. Cobre:
  - o cliente estrito (ator fora dos quatro reprova);
  - o filtro Tudo / Contratante (o que é dela e os e-mails) / Motorista;
  - ator → cor (`operation` → `out`, a do balão enviado, T704);
  - a frase por chave de locale, com o status da tratativa pela chave da listagem;
  - as durações (a aberta corre até agora; sem envio, sem tempo de resposta);
  - o formato compacto e o intervalo que some abaixo de um minuto.
- Componente `OccurrenceTimeline.component.tsx`:
  - três tempos no topo, contados por um relógio de minuto;
  - filtro sobre o `Tabs` do design system, com a contagem em cada aba;
  - cartão com a borda e o selo do nome no token do participante; sistema tracejado; marca "Marco"
    nos eventos-chave.

  Fica na mesma chave do feed, então agir na tratativa atualiza a linha do tempo junto.

- Rodado:
  - API, contrato: `bun --env-file=../../.env.test test --timeout 120000` → **7235 pass, 23 skip, 0
    fail**.
  - API, integração: `bun --env-file=../../.env.test run test:integration` → **576 pass, 7 skip, 8
    fail**. As 8 são de object storage: `cte-archive-gateway` e o pedágio 154 T301/T302, que precisam
    do MinIO, e o MinIO vem do `quay.io`, bloqueado nesta sessão. Nenhuma toca código da 183.
  - Frontend: `bun run --cwd apps/frontend-transportada test` → **5182 pass, 0 fail** + **44 pass**.
  - `bun run lint` e `bun run typecheck` na raiz limpos. Sem migration.
- Revisão de design, prints `linha-do-tempo-desktop.png` e `linha-do-tempo-celular.png` (390 px, sem
  rolagem horizontal). Smoke **8 pass**. Achados corrigidos na task:
  - no tema claro o token do balão é fundo pálido e a borda do cartão sumia: a borda mistura o token
    com `--color-fog`, que escurece no claro e clareia no escuro;
  - "+0 min desde o anterior" entre registro e fotos era ruído: o intervalo abaixo de um minuto some
    (`formatOccurrenceGap`).
- Divergência aplicada na spec: "quanto o motorista levou para ser liberado" não tinha definição, e
  nenhum dado grava liberação. Definido no RF19, igual à política: **liberado** é a tratativa sair do
  caminho dele (`decided` ou terminal). Os outros dois tempos também ficaram escritos. Se o dono do
  projeto quiser outra régua, ela muda num conjunto só (`RELEASING_STATUSES`).

## T207 — Item, quantidade e unidade no detalhe (verde)

- Contratos escritos antes:
  - `test/integration/trip-occurrence-detail.integration.ts` ganhou o caso dos itens e reprovou
    (**5 pass, 1 fail**, `items` ausente). Cobre: nota inteira → `[]`; item com quantidade
    `'3.500'` (string decimal) e unidade `CX`, com a descrição da própria nota; item fora do
    cadastro da nota → descrição `''`; parada → `[]`. Verde: **6 pass**.
  - No frontend, `test/trip/occurrence-detail.contract.ts` ganhou a quantidade como `number` →
    resposta inválida, e `formatOccurrenceItemQuantity`. Vermelho na importação.
- **Sem segunda cópia da regra.** O portal do contratante já montava esses itens (código legado
  `product_code` + tabela da 166 + descrição em `nfe_products`, em lote). A função saiu de
  `contractor-portal/infrastructure/contractor-occurrence.query.ts` para
  `trips/infrastructure/occurrence-items.support.ts` (`resolveOccurrenceItems`), e o portal e o
  detalhe chamam a mesma; `ContractorOccurrenceItem` virou alias de `OccurrenceItemView`.
  `contractor-portal.integration.ts` e `contractor-portal-end-to-end.integration.ts` seguem verdes.
- Tela: "Itens atingidos" no Resumo, com código, descrição e quantidade + unidade, só quando há
  item. A quantidade só é exibida, nunca entra em conta.
- Rodado:
  - Frontend: `bun run --cwd apps/frontend-transportada test` → **5185 pass, 0 fail** + **44 pass**.
  - API, contrato: **7235 pass, 0 fail**.
  - `bun run lint` e `bun run typecheck` limpos.
  - API, integração: **577 pass, 7 skip, 8 fail**. As 8 são as mesmas de object storage da T206
    (MinIO fora do alcance desta sessão).
- Revisão de design: `detalhe-nota-desktop.png` e `detalhe-nota-celular.png` refeitos, com asserção
  de "3,5 CX" visível no smoke (**8 pass**). A lista segue o rótulo pequeno dos fatos vizinhos.

## T301 — Contatos da contratante com tipos e canais: a migration (verde)

- Contrato escrito antes: `test/contractor-mail-schema/contact-channels.contract.ts` (entra por
  `test/contractor-mail-schema.contract.test.ts`) → **7 fail** antes do schema. Cobre:
  - as colunas novas;
  - quais nunca são nulas;
  - os conjuntos fechados de `types`, `occurrence_stages` e `preferred_channel`;
  - o telefone no formato do WhatsApp verificado;
  - o par do aceite, aceite só com telefone e WhatsApp preferido só com aceite (D6);
  - o índice `(company_id, phone)` para o webhook;
  - a pasta com `migration.sql`, `rollback.sql` e `snapshot.json`, o preenchimento pelos campos
    antigos, nenhum `DROP` na ida e todas as colunas novas no rollback (sem tocar `email`).
- Migration `drizzle/20260924163726_contractor_contact_channels`: gerada pelo `db:generate` (com
  snapshot), mais o `UPDATE` de preenchimento — `receives_occurrences` → `occurrences`, `can_decide`
  → `approves_charges`. `occurrence_stages` nasce com os três grupos, e `preferred_channel` com
  `email`. `rollback.sql` desfaz CHECKs, FK, índice, colunas e a linha do diário.
- Telefone: só dígitos com DDI, pelo mesmo `WHATSAPP_PHONE_PATTERN` de `user_whatsapp_phones`
  (`^55[1-9][0-9]{9,10}$`). É o formato que o webhook recebe da Meta, então casar por telefone não
  precisa de normalização. O RF5 dizia "E.164"; é E.164 sem o `+`, restrito ao Brasil como o canal.
- Integração nova `test/integration/contractor-contact-channels.integration.ts` (no `package.json`).
  O `migration-test` roda sobre banco vazio, então o `UPDATE` de preenchimento é **lido do próprio
  arquivo** e aplicado a quatro contatos (as quatro combinações dos campos antigos). Também prova os
  cinco CHECKs recusando e o contato completo aceito: **5 pass** com a suíte de contatos da 150/143.
- Achado no caminho: `.$type<X[]>()` depois de `.array()` tipa o **elemento** nesta versão do
  Drizzle (`X[][]`). Corrigido para `.$type<X>().array()`; o `db:generate` seguinte deu `no_changes`.
- Rodado:
  - `ENV_FILE=.env.test make migration-test` → **110 pass, 0 fail**. Na primeira rodada reprovou só
    porque `static-migration.contract.ts` lista as pastas por nome; a pasta nova entrou na lista.
  - `bun run db:check` → limpo.
  - API, contrato: **7242 pass, 0 fail**.
  - API, integração: **579 pass, 7 skip, 8 fail** — as mesmas 8 de object storage (MinIO).
  - `bun run lint` e `bun run typecheck` limpos.
- Revisão da migration (a task pedia `architect`; feita nesta sessão, sem subagente):
  - a coluna `NOT NULL` com padrão não reescreve a tabela (Postgres ≥ 11);
  - os CHECKs validam as linhas existentes na criação, e todas passam: telefone e aceite nulos, canal
    `email`;
  - a FK do autor do aceite é `restrict`, e usuário nesta base é desativado, não apagado;
  - o índice por telefone não é único de propósito: o mesmo número em dois contatos é caso da política
    de atribuição (T501);
  - **lacuna até a T302:** contato criado pela rota de hoje nasce com `types = '{}'`, porque derivar
    os tipos na escrita é a T302.

## T302 — A política dos tipos e as rotas de contato com o aceite (verde)

- Contratos escritos antes, todos vermelhos antes da implementação:
  - `test/contractor-mail/contact-policy.contract.ts` (entra por
    `test/contractor-mail.contract.test.ts`): a política pura `resolveContractorContactWrite`.
    Falhou na importação.
  - `test/contractor-mail/contractor-contacts.contract.ts` ganhou o caso de uso e as rotas da 183:
    **9 fail** antes da implementação.
  - No frontend, `test/delivery-clients/contractor-contacts-response.contract.ts`: **3 fail** com o
    guard antigo.
- **A política** (`contractor-mail/domain/contractor-contact.policy.ts`):
  - os tipos mandam, e `receives_occurrences`/`can_decide` saem deles em toda escrita (a 143 e a 150
    seguem lendo os dois);
  - o pedido antigo (só os dois campos, o formulário de hoje) mexe só nos dois tipos equivalentes e
    preserva os outros;
  - tipos e campo antigo no mesmo pedido é `422 CONTRACTOR_CONTACT_TYPES_CONFLICT`, nunca um
    vencendo calado;
  - contato novo sem nada cai nos padrões de antes da 183 (recebe ocorrência, não decide);
  - grupos vazios são recusados; tipos e grupos são deduplicados, em ordem canônica.
- **O aceite do WhatsApp (D6):**
  - o cliente manda `whatsappOptIn: boolean`, e o servidor carimba data (relógio do caso de uso) e
    autor (`userId` do contexto). `whatsappOptInAt` no corpo é **400**, pelo `.strict()`;
  - o aceite é do **número**: confirmar o mesmo número guarda o carimbo original; trocar ou tirar o
    telefone o derruba;
  - WhatsApp como canal preferido sem aceite é `422 CONTRACTOR_CONTACT_WHATSAPP_WITHOUT_OPT_IN`;
    aceite sem telefone é `422 CONTRACTOR_CONTACT_OPT_IN_WITHOUT_PHONE`.
- Telefone normalizado por `toWhatsAppPhone`, a mesma função do WhatsApp verificado; inválido é
  `422 CONTRACTOR_CONTACT_PHONE_INVALID`. O erro não ecoa telefone nem nome, e um contrato de rota
  confere que nenhum dos dois vai para log.
- O `PATCH` lê o contato atual (`findContractorContact`, filtrado por empresa e contratante) e decide
  a partir dele. Contato de fora é 404 antes da política.
- Repositório: grava e lê os campos novos. A escrita parcial da 150 (só `status`) segue válida, e o
  campo ausente fica com o padrão do banco ou o valor gravado.
- Integração `test/integration/contractor-contact-channels.integration.ts` ganhou o caso de uso
  sobre o repositório de verdade:
  - grava e relê tudo, com o aceite carimbado;
  - trocar o número derruba o aceite;
  - `findContractorContact` com outra empresa → `undefined`.

  Com as suítes de contatos (150) e de configuração: **13 pass**. Este caso foi escrito depois da
  implementação; os três contratos acima foram os vermelhos.

- **Achado fora da spec e corrigido na task:** o guard do painel de contatos do frontend
  (`contractorContactsResponse.validation.ts`) usa `hasExactKeys`. A resposta nova, com mais chaves,
  reprovaria a lista inteira e o painel da 150 quebraria no deploy. O guard segue estrito (a regra do
  `security.md` §3): a lista de chaves ganhou os campos novos, e cada um é conferido (conjuntos
  fechados, texto ou nulo). O painel continua mandando só os campos antigos, que é o caminho legado
  da política; a tela nova é a T303.
- Rodado:
  - API, contrato: **7267 pass, 0 fail**.
  - Frontend: **5187 pass, 0 fail** + **44 pass**.
  - `bun run lint` e `bun run typecheck` limpos.
  - API, integração: **580 pass, 7 skip, 8 fail** — as mesmas 8 de object storage (MinIO).

## T303 — O painel de contatos com tipos e canais (verde)

- Contrato escrito antes: `test/delivery-clients/contractor-contacts-validation.contract.ts`
  (reescrito) falhou na importação antes da implementação. Cobre:
  - o rascunho vazio (os padrões de antes da 183);
  - o telefone com a **mesma regra** do `toWhatsAppPhone` da API (10/11 dígitos ganham o 55; letra ou
    curto demais é inválido; vazio é `null`), cópia por valor com aviso no código;
  - a exibição sem o 55 e com a máscara da casa;
  - o rascunho a partir do contato gravado;
  - marcar e desmarcar na ordem canônica;
  - um erro por campo, repetindo a política da T302: e-mail, telefone, aceite sem telefone, WhatsApp
    sem aceite, "Ocorrências" sem grupo. Sem o tipo Ocorrências, os grupos não são cobrados;
  - o corpo com só os campos novos, normalizados; telefone apagado vai como `null`; rascunho com erro
    não vira corpo.
- Tela (`ContractorContactsPanel.component.tsx`, refeita):
  - cada contato é um cartão com nome (ou o e-mail, no contato anterior à 183), setor, e-mail,
    telefone com o selo "WhatsApp aceito em DD/MM/AAAA", canal preferido, os tipos e a linha
    "Ocorrências de: …";
  - "Editar" troca o cartão pelo formulário no mesmo lugar (`useRevealedPanel`, rola e foca);
  - o formulário é um só para criar e editar: nome, setor, e-mail, telefone, os cinco tipos, os três
    grupos (só com Ocorrências marcado), o aceite (desabilitado sem telefone) e o canal preferido
    (WhatsApp só aparece com aceite, e desmarcar o aceite volta o canal para e-mail);
  - o texto do aceite diz a verdade: contato com aceite e o mesmo número mostra "Aceite registrado em
    DD/MM/AAAA. Trocar o telefone desfaz o aceite."; número novo mostra que o registro será de agora.
- O painel antigo tinha `<button>` cru ao lado dos primitivos. Agora são `Button`, `Badge`,
  `Checkbox` e `Select` do design system, e os campos de texto usam os tokens `--field-*`, no molde de
  `company-settings`.
- Rodado: `bun run --cwd apps/frontend-transportada test` → **5194 pass, 0 fail** + **44 pass**;
  `bun run lint` e `bun run typecheck` limpos. A task não toca a API.
- Revisão de design, smoke `test/spec-183-contacts-prints.smoke.spec.ts` (fora da CI): **4 pass**.
  Prints em `prints/`: `contatos-desktop.png`, `contatos-editar.png`, `contatos-erros.png` e
  `contatos-celular.png` (390 px, sem rolagem horizontal). Achados corrigidos na task:
  - os campos de texto estavam baixos e sem os tokens `--field-*` (defeito que já existia no painel
    antigo), ao lado de um `Select` alto: agora têm a altura e o padding da casa;
  - os grupos de ocorrência em selo cobre cheio pareciam ação e disputavam com os tipos: viraram uma
    linha de texto subordinada;
  - a edição aparecia sem moldura no lugar do cartão: ganhou a borda do cartão, em cobre;
  - o texto do aceite dizia "com a data de agora" num contato já aceito, e a API guarda o carimbo
    original: o texto mostra a data gravada, e o smoke confere as duas frases.

## T401 — As tabelas da conversa da ocorrência (verde)

- Contrato escrito antes: `test/occurrence-conversation-schema/tables.contract.ts` (entrypoint
  `test/occurrence-conversation-schema.contract.test.ts`, no script `test` do `package.json`)
  falhou na importação antes do schema. Cobre:
  - as cinco tabelas ancoradas em `companies` com `restrict`;
  - uma conversa por (ocorrência, participante), `public_ref` único;
  - FK composta para `contractors`, `contractor_contacts`, `contractor_mail_messages`,
    `stored_objects` e entre as tabelas;
  - a forma de cada participante, canal, direção e autor, e o status por canal;
  - `sha256`, a leitura única por usuário e a idempotência pelo id do provedor;
  - a migration sem `DROP` e o rollback derrubando as filhas primeiro.
- Migration `drizzle/20260924190850_occurrence_conversations`, gerada pelo `db:generate`
  (snapshot):
  - `occurrence_conversations`, com `default_channel` e `window_expiry_notice_sent_for` do plano;
  - `occurrence_conversation_messages`, `occurrence_conversation_attachments`,
    `occurrence_conversation_reads` e `occurrence_conversation_unassigned`;
  - o `unique (company_id, id)` em `contractor_contacts`, que a FK composta exige e não existia.
- Decisões de modelo registradas:
  - **o autor da recebida é um só** (`num_nonnulls(author_user_id, driver_user_id, sender_address)
= 1`). A conta do portal só no canal `portal`; o endereço ou número como chegou (`sender_address`)
    só em e-mail e WhatsApp. É o RF16: o remetente fora dos contatos não tem `contractor_contact_id`,
    e o casamento com o cadastro é feito na leitura;
  - **status só na enviada** (`(direction = 'outbound') = (status is not null)`). O e-mail nunca fica
    `read` (D7), e o portal só vai de `delivered` a `read` (RF14). O resto da escada é da política
    (T402);
  - `occurrence_id` sem FK, como `trip_occurrence_cases`: a ocorrência vive em duas tabelas;
  - `public_ref` só na conversa com a contratante, com formato opaco (22–64 caracteres URL-safe);
  - o que é de outras tasks fica nas migrations delas: `from_display_name` (T406), respostas rápidas
    (T701), configuração da expiração (T605).
- Integração nova `test/integration/occurrence-conversation-schema.integration.ts` (no
  `package.json`), escrita depois do schema, prova contra Postgres:
  - FK composta recusando contratante de outra empresa;
  - forma do participante e conversa duplicada;
  - enviada sem operador, e-mail "lido", portal "na fila", enviada sem status, recebida com dois
    autores e conta interna fora do portal, todas recusadas;
  - as três formas válidas aceitas.

  **2 pass**.

- Rodado:
  - `ENV_FILE=.env.test make migration-test` → **110 pass, 0 fail** (a pasta nova entrou em
    `static-migration.contract.ts`);
  - `bun run db:check` limpo;
  - API, contrato: **7278 pass, 0 fail**;
  - `bun run lint` e `bun run typecheck` limpos;
  - API, integração: **582 pass, 7 skip, 8 fail** — as mesmas 8 de object storage (MinIO).

## T402 — A política de status da mensagem (verde)

- Contrato escrito antes: `test/occurrence-conversation/message-status-policy.contract.ts`
  (entrypoint `test/occurrence-conversation.contract.test.ts`, no script `test`) falhou na importação
  antes da política.
- Política pura `src/occurrence-conversation/domain/message-status.policy.ts`, dirigida por tabela,
  uma regra por canal (RF14):
  - status inicial: WhatsApp, e-mail e app nascem `queued`; portal nasce `delivered`;
  - escadas: WhatsApp `queued → sent → delivered → read`; e-mail `queued → sent → delivered`; app
    `queued → delivered → read`; portal `delivered → read`. Pular degrau vale (`queued → read`);
  - falhas: `failed` no WhatsApp, `bounced`/`failed` no e-mail, e só até `sent`. Depois de entregue,
    falha é `stale`, e nada sai de uma falha;
  - o que o canal não dá é `unsupported` e não muda nada: e-mail `read` (D7), app `sent`/`failed`,
    portal `queued`/`sent`/`failed`, WhatsApp `bounced`;
  - só avança: um `delivered` atrasado depois do `read` mantém `read`, mas grava o horário que
    faltava (o selo mostra os horários). O mesmo evento de novo é `duplicate` e nem o horário muda;
    nenhuma transição apaga horário anterior.
- Rodado: a suíte da política dá **27 pass**; API, contrato: **7305 pass, 0 fail**; `bun run lint` e
  `bun run typecheck` limpos. API, integração: **582 pass, 7 skip, 8 fail** — as mesmas 8 de object storage (MinIO).

## T403 — O e-mail da conversa sobre o trilho da 143 (verde)

- Contrato escrito antes: `test/occurrence-conversation/occurrence-mail.contract.ts` (entra por
  `test/occurrence-conversation.contract.test.ts`) falhou na importação antes dos casos de uso.
  Cobre, com transação falsa:
  - a montagem (texto com assinatura, HTML escapado e em parágrafos);
  - a primeira mensagem criando conversa (com `public_ref` opaco) e thread (com hash do token);
  - a segunda como resposta na mesma conversa e thread;
  - a chave repetida devolvendo a resposta gravada, e com outro pedido 409;
  - 404 de outra empresa e 422 sem contratante;
  - contato inválido ou com e-mail inseguro, configuração não pronta, assunto ou mensagem vazios;
  - a prévia pelo modelo do tipo, pelo texto do operador e em branco.
- **Decisão de desenho (sem mudança de produto):** o "modelo" do diálogo (P4) é o texto do **tipo da
  ocorrência** (`email_subject`/`email_body`, spec 079), que a 143 T015 já mandava reaproveitar —
  não um `contractor_mail_templates` da 150. Por isso o catálogo da 150 não ganhou tipo novo, e a
  prontidão confere só a configuração (chave aceita e remetente verificado), sem exigir modelo da 150.
- **Uma função monta o e-mail** (`buildOccurrenceMail`), usada pela prévia e pelo envio (RF7): texto
  do operador mais a assinatura (operador e transportadora); HTML escapado.
- `sendOccurrenceMail`, numa transação:
  1. a ocorrência na empresa, e a contratante pelo emitente (T203) — só ocorrência com nota (P4);
  2. idempotência com trava consultiva (`occurrence-conversation.mail.send`);
  3. prontidão;
  4. contatos **ativos** da contratante que recebem ocorrências, sem caractere que injete cabeçalho;
  5. conversa `contractor` criada ou reusada;
  6. thread da 143 (`document_occurrence`/`stop_occurrence`, `subject_id` = ocorrência) criada ou
     reusada, com o hash do token derivado;
  7. `contractor_mail_messages` `queued` + evento no outbox;
  8. `occurrence_conversation_messages` (`email`, `outbound`, `queued`, horário) apontando para a
     mensagem da 143.
- A resposta do operador cai na mesma conversa da caixa da contratante sem mudar o worker: ele já
  deriva o mesmo `Reply-To` da thread e manda `In-Reply-To`/`References` pela última recebida.
- 143 T014 (teste da política do token) já existia: `test/contractor-mail/reply-token-policy.contract.ts`.
- Integração nova `test/integration/occurrence-conversation-mail.integration.ts` (no
  `package.json`), escrita depois da implementação:
  - envio, resposta e repetição, contando linhas (1 conversa, 1 thread, 2 mensagens da 143 e 2 da
    conversa, e nada na repetição);
  - contato que não recebe ocorrências e outra empresa recusados, **sem nenhuma linha gravada**;
  - a prévia pelo modelo do tipo com os valores da nota.

  **3 pass**. Na primeira rodada ela pegou um erro do próprio teste: o modelo da 079 usa `{{…}}`, e
  não `{…}`.

- Sem rota nesta task (as rotas são a T404), então nenhum endpoint novo.
- Rodado: API, contrato: **7316 pass, 0 fail**; `bun run lint` e `bun run typecheck` limpos. API, integração: **585 pass, 7 skip, 8 fail** — as mesmas 8 de object storage (MinIO).

## T404 — As rotas da conversa e a coluna Conversa (verde)

- **Rotas** (`occurrence-conversation/presentation/occurrence-conversation.routes.ts`, todas
  `no-store`):
  - `GET /trip-occurrences/:id/conversations` (`fleet.read`): as conversas da ocorrência, com as
    mensagens em ordem, o autor de cada uma e as não lidas **de quem pede**;
  - `POST /trip-occurrences/:id/conversations/:participant/messages` (`occurrences.resolve`):
    - exige `Idempotency-Key` e corpo estrito;
    - hoje só a contratante por e-mail; outro canal ou participante é 422
      `OCCURRENCE_CONVERSATION_CHANNEL_UNAVAILABLE`, sem chegar ao caso de uso;
    - rate limit no Postgres (`occurrence-conversation`, 30/300 s), listado em
      `test/rate-limited-routes.contract.test.ts`;
    - responde 202;
  - `POST /trip-occurrences/:id/conversations/contractor/mail-preview` (`occurrences.resolve`);
  - `POST /occurrence-conversations/:id/read` (`fleet.read`): marca até a última mensagem, por
    usuário.
- **Correções ao plano** (técnicas, sem mudança de produto):
  1. O envio pede `occurrences.resolve`, e não `trip.manage`. O separador tem `trip.manage`, e a
     143 T016 manda que ele **não** alcance o envio; a permissão da tratativa cumpre as duas coisas.
     `test/separator-role.contract.test.ts` ganhou só as duas leituras.
  2. A prévia é `POST` sob `/trip-occurrences/:id/…`, e não sob a conversa: antes da primeira
     mensagem, a conversa ainda não existe.
- **Na listagem (RF4)**, cada item do feed e do detalhe ganha
  `conversation: { contractorState: 'none' | 'awaiting' | 'replied', driverUnreadCount }`:
  - lido em leituras fixas por página, sem N+1, em `occurrence-conversation-summary.query.ts`;
  - a query ficou separada para não criar ciclo de import com o feed;
  - `awaiting` quer dizer que a última mensagem é nossa; `replied`, que é da contratante;
  - as não lidas do motorista são de quem está vendo.
- **Frontend:**
  - o guard do feed é **tolerante**: `conversation` ausente (API anterior) ou malformado vira "sem
    conversa", sem reprovar o item;
  - a coluna Conversa entra antes de Aviso, no menu de colunas e na persistência
    (`docs/frontend/data-tables.md` § 6): preferência antiga a ganha visível no fim;
  - pelo RF4, com decisão da tratativa a célula mostra a **decisão** (de `case`), nunca o estado da
    conversa;
  - as não lidas do motorista vão abaixo, em texto ("2 mensagens do motorista"), e não só em número
    ou cor.
- **Testes e ordem honesta:**
  - Contratos do frontend (`test/trip/occurrence-table.contract.ts`, coluna e célula;
    `test/trip/occurrence-feed-tolerance.contract.ts`, guard) escritos **antes** e vistos falhando:
    a exportação não existia, e o item malformado não degradava. Depois, verdes.
  - Contrato das rotas (`test/occurrence-conversation/conversation-routes.contract.ts`) escrito
    junto com as rotas, sem rodada vermelha registrada. Cobre:
    - permissão, com o separador em 403 antes do caso de uso;
    - 404 de outra empresa;
    - chave, campo desconhecido e assunto ausente em 400;
    - canal indisponível em 422;
    - nenhum log com assunto ou corpo;
    - marcar como lida por usuário.
  - Integração nova `test/integration/occurrence-conversation-read.integration.ts` (no
    `package.json`), escrita depois da implementação. Contra Postgres, cobre:
    - o autor de cada mensagem;
    - `awaiting` virando `replied`;
    - a não lida do motorista zerando só para quem marcou;
    - outra empresa sem acesso: `null`, e marcar como lida dá `false`.

    **2 pass**. A fixture de banco da T403 foi extraída para
    `test/fixtures/occurrence-conversation-database.fixture.ts` e é compartilhada pelas duas.

- **Prints** (desktop e 390 px): `prints/lista-coluna-conversa.png` e
  `prints/lista-coluna-conversa-celular.png`. Revisão de design sem achado: o estado usa o mesmo selo
  da coluna Etapa, e no celular a tabela rola dentro do cartão, como as outras colunas.
- **Rodado:**
  - API, contrato: **7326 pass, 0 fail**;
  - frontend (`bun run test`): **5199 + 44 pass, 0 fail**;
  - `bun run lint` e `bun run typecheck` limpos na raiz.
  - API, integração completa: no momento do commit ainda rodava, só com as 8 falhas conhecidas de
    object storage (MinIO) até ali. O número final fica registrado na T405.

## T405 — A resposta por e-mail na conversa e o status do Resend (verde)

- **Resposta recebida:** o worker grava, na **mesma transação** da mensagem `inbound` da 143, a
  mensagem `inbound` da conversa (`email`, `sender_address`, `mail_message_id`).
  - A thread acha a conversa pelas mensagens enviadas que a T403 ligou a ela.
  - Thread da 143 sem conversa (correção de endereço, teste de configuração) segue como estava.
  - Só a mensagem que acabou de nascer entra, então a reentrega do Resend não duplica.
  - Corpo acima de 8000 caracteres (CHECK da conversa) entra cortado; o inteiro segue na 143 e no
    MIME.
- **Status:** a política da T402 foi copiada por valor para o worker, com contrato de paridade
  (`test/occurrence-conversation/message-status-parity.contract.ts`).
  - Envio aceito pelo Resend: `sent` e o `provider_message_id`, na transação do `markMessageSent`.
  - Falha permanente: `failed`.
  - O webhook assinado da 143 passou a aplicar `email.sent`, `email.delivered`, `email.bounced` e
    `email.failed` à mensagem da conversa, pelo id do provedor dentro da empresa do webhook, com a
    linha travada.
  - `email.opened`/`clicked` continuam ignorados (D7: e-mail não tem "lida"), assim como
    `delivery_delayed` e `complained`.
- **Mudança de comportamento da 143 (registrada):** o contrato da 143 usava `email.bounced` como
  exemplo de evento ignorado; agora o exemplo é `email.clicked`, porque a devolução passou a importar.
  Nada muda na spec 143.
- **Depende do usuário:** o webhook do Resend de cada instalação precisa assinar também
  `email.sent`, `email.delivered`, `email.bounced` e `email.failed`. Sem isso o selo para em
  "enviada", sem erro.
- **Testes e ordem:**
  - Worker: contrato de paridade e integração `test/integration/occurrence-conversation-mail.integration.ts`
    (no `package.json`) escritos **antes** e vistos falhando (módulos inexistentes). Depois, três
    rodadas vermelhas por erro do próprio seed: hash do token, `from_address` e valor de DKIM.
    **6 pass**, cobrindo:
    - resposta vira mensagem uma vez só;
    - corpo cortado;
    - thread sem conversa intocada;
    - `sent` com id e horário;
    - `failed` que nada desfaz;
    - outra empresa sem efeito.
  - API: contrato do webhook (`process-inbound-email-webhook-use-case.contract.ts`) escrito antes e
    visto falhando.
  - Integração `test/integration/occurrence-conversation-mail-status.integration.ts` (no
    `package.json`) escrita **depois** do adaptador. **1 pass**, cobrindo:
    - outra empresa sem efeito;
    - `delivered` avançando;
    - `bounced` depois da entrega não desfazendo;
    - id que não é de conversa sem efeito.
- **Rodado:**
  - worker, contrato: **1423 pass, 0 fail**;
  - worker, integração: as de e-mail (novas e as da 143), **11 pass**, contra banco próprio migrado
    pela API, como no `make worker-integration`. RabbitMQ e MinIO não estão de pé neste ambiente,
    então o resto da integração do worker não rodou;
  - API, contrato do e-mail: **213 pass, 0 fail**;
  - lint e typecheck limpos.
  - API, `bun run test` (lista do `package.json`): **7320 pass, 0 fail**;
  - API, integração completa, lançada durante a T404 e terminada aqui: **587 pass, 7 skip, 8 fail**.
    As 8 são as mesmas de object storage (MinIO: arquivo de CT-e e extrato/recarga de pedágio da
    154); nenhuma da 183. É o número final que a T404 deixou pendente.

## T406 — Quem respondeu, puxado do cadastro (verde)

- **Migration aditiva `20260924213126_contractor_mail_from_display_name`:**
  - `contractor_mail_messages.from_display_name` (opcional, CHECK ≤ 200), com `rollback.sql` que
    só derruba a coluna, o CHECK e a linha do journal, e com `snapshot.json`;
  - na lista de `static-migration.contract.ts`;
  - `make migration-test`: **110 pass** (o Docker caiu antes da primeira tentativa e foi religado);
    `db:check` limpo.
- **Worker:** `parseSenderMailbox` (`contractor-mail/domain/sender-mailbox.policy.ts`) separa o
  `From` em endereço e nome:
  - o endereço fica como chegou;
  - o nome perde controle de linha, colapsa espaços e cabe em 200;
  - nome igual ao endereço não é nome.

  O caso de uso grava `from_address` só com o endereço, antes a string crua do `From`. Nada lia esse
  campo da recebida, conferido por grep na API e no cron. Grava também `from_display_name`, e a
  mensagem da conversa (T405) leva o endereço limpo.

- **API:** `identifyContractorSender` (`occurrence-conversation/domain/contractor-sender.policy.ts`)
  casa o remetente **na leitura** com os contatos da contratante da conversa: e-mail sem diferença de
  caixa, WhatsApp pelos dígitos.
  - Contato ativo vence inativo do mesmo endereço; contato inativo casa e sai `inactive: true`.
  - Fora dos contatos, sai o nome do `From` e a sugestão de cadastro (e-mail minúsculo, ou telefone
    no WhatsApp).
  - No WhatsApp, o nome do perfil diferente do cadastrado sai em `profileName`.
  - `arrivedAs` guarda sempre o endereço como chegou.
- **Payload** de `GET /trip-occurrences/:id/conversations`: o autor `contractor` virou
  `{ identity, kind, userId }`. A identidade é `null` no portal, onde o autor é o usuário. Os
  contatos das contratantes saem numa leitura só por página, e o `from_display_name` sai por join
  pela empresa. Sem consumidor no frontend ainda (a aba é a T407), então a troca de forma não quebra
  nada.
- **Frontend:** `contractorContactDraftFromSenderSuggestion` preenche "Adicionar aos contatos" (nome,
  e-mail ou telefone), com o resto no padrão e o aceite do WhatsApp nunca marcado (D6).
  - **Correção ao plano:** o cartão do contato e o botão aparecem na aba Contratante, que é a T407;
    aqui fica a função pura com contrato, e a T407 os renderiza.
- **Testes, todos escritos antes e vistos falhando:**
  - schema e migration (`test/occurrence-conversation-schema/tables.contract.ts`), com uma rodada
    vermelha por erro do próprio teste (`Record` lido como `Map`);
  - política do `From` no worker (`test/contractor-mail/sender-mailbox-policy.contract.ts`);
  - `inbound-message.contract.ts`, com o `From` separado;
  - integração do worker, com `from_display_name` gravado;
  - política de identificação por tabela (`test/occurrence-conversation/contractor-sender-policy.contract.ts`),
    cobrindo:
    - caixa diferente casa;
    - outra contratante da mesma empresa não casa;
    - inativo casa como inativo;
    - fora dos contatos traz nome e sugestão;
    - WhatsApp pelos dígitos, com o nome do perfil;
  - integração da leitura com contato casado e remetente fora dos contatos;
  - contrato do preenchimento no frontend.
- **Rodado:**
  - API, contrato: **7331 pass, 0 fail**;
  - worker, contrato: **1432 pass**;
  - worker, integrações de e-mail contra banco novo migrado: **11 pass**;
  - frontend: **5201 + 44 pass**;
  - lint e typecheck limpos;
  - API, integração completa: **586 pass, 7 skip, 10 fail**.
    - 8 são as de MinIO de sempre.
    - As outras 2 (`occurrence-conversation-mail`, `occurrence-conversation-read`) deram
      `PostgresError: Failed to read data` no mesmo momento em que eu rodava outros arquivos de
      integração em paralelo contra o mesmo Postgres. Os dois processos criam e derrubam bancos
      descartáveis ao mesmo tempo.
    - Rodados de novo, sozinhos, os quatro arquivos de conversa deram **8 pass, 0 fail**.
    - Lição registrada: não rodar integração em paralelo com a suíte completa.

## T407 — A aba Contratante e o diálogo "Enviar à contratante" (verde)

- **Pacote:** `@adatechnology/conversations-ui@0.3.1` entrou no frontend. É o bump que a T101
  mandou fazer na primeira task que usasse o pacote. Pela decisão da T101, as peças vêm do pacote e
  a composição e o estilo são nossos:
  - `DateDivider` com `classNames`;
  - `MessageText` e `StatusTicks` dentro de um balão nosso, pintado pelos tokens da T704
    (`--color-bubble-out`, `-contractor`, `-driver`; texto `--color-fog`).
- **Divergências técnicas (aplicadas):**
  1. O `MessageBubble` do pacote não foi usado. Ele pinta tudo com utilitárias do Tailwind (cor,
     cantos, largura), e a classe interna não aceita `className`. Sem Tailwind no app, sairia sem
     forma. O balão é nosso, com as peças menores dentro.
  2. O `@adatechnology/conversations-ui/styles.css` **não** foi importado, ao contrário da
     ADR-0051 §1. Ele traz regras globais: `:where(*) { border-color: var(--cv-border-color) }` e
     `:root`, que trocariam a cor de borda do app inteiro. Nenhuma das peças usadas lê classe `.cv-*`.
  3. A prévia (`POST …/contractor/mail-preview`, `occurrences.resolve`) passou a devolver
     `contractorName` e `recipients`. São os contatos **ativos** da contratante que recebem
     ocorrências, com `preselected` para quem recebe o grupo desta ocorrência (RF5) e
     `approvesCharges`. Listar contatos pela rota da T302 exige `settings.manage`, que quem conduz a
     tratativa pode não ter. O envio continua conferindo os contatos de novo.
- **Tela (módulo novo `modules/occurrence-conversation/`, namespace `occurrenceConversation`):**
  - O detalhe `/ocorrencias/:id` ganhou o painel "Conversas", com abas por participante montadas do
    nosso lado (o pacote não tem abas). Hoje só "Contratante"; a do motorista é a T603.
  - A aba mostra a conversa por dia e o balão por tom.
  - O remetente vem do cadastro (T406): nome, setor, "Aprova cobranças", "Inativo". O toque abre o
    cartão (e-mail, telefone com a máscara da casa, canal preferido, aceite) com o endereço como
    chegou.
  - Remetente fora dos contatos sai com o nome do `From`, "Fora dos contatos" e "Adicionar aos
    contatos". Esse botão aparece só com `settings.manage` e abre o `ContactForm` da T303
    (exportado) já preenchido.
  - O selo do e-mail mostra o tique do pacote (enviado, entregue, falhou) e o rótulo sempre visível
    (na fila, enviado, entregue, falhou, devolvido); o horário fica no título. Nunca "lido" (D7).
  - Abrir a aba com mensagem nova marca como lida (RF15); a coluna Conversa da listagem volta a ser
    buscada.
  - "Enviar à contratante" (só com `occurrences.resolve`, só em ocorrência com nota e contratante)
    abre o diálogo:
    - o texto do tipo (079) e os destinatários do grupo vêm marcados;
    - "Ver prévia" mostra o e-mail com a assinatura;
    - há uma `Idempotency-Key` por abertura;
    - cada erro da API tem texto próprio.
- **Testes, todos escritos antes e vistos falhando:**
  - API: prévia com destinatários (`occurrence-mail.contract.ts`); na integração da T403, a prévia
    contra Postgres só com quem recebe ocorrências. Uma rodada vermelha mostrou ordem instável no
    empate de `created_at`, e o desempate passou a ser o e-mail.
  - Frontend: `test/occurrence-conversation/conversation-view.contract.ts` (lado, tom, autor do
    cadastro e de fora, selo, dias, rascunho e pedido, chave) e `conversation-client.contract.ts`
    (leitura tolerante, envio com a chave, prévia, lida, erro pelo código). O entrypoint
    `test/occurrence-conversation.contract.test.ts` entrou no `package.json`.
  - Smoke do envio `test/spec-183-conversation.smoke.spec.ts`, 5 testes: o diálogo abre preenchido,
    a prévia aparece, o corpo e a chave são conferidos, a mensagem entra "Na fila" e a falta de
    destinatário aparece. Duas rodadas vermelhas por erro do próprio teste (`getByText` sem caixa,
    `getByDisplayValue` inexistente).
  - Os contratos de design reprovaram o primeiro CSS: diálogo fora da lista de tela cheia, `padding`
    do overlay e altura de campo inventada. Foram corrigidos, e o par entrou em
    `modal-dialog-fullscreen.contract.ts`.
- **Revisão de design** (prints `conversa-contratante-{desktop,celular}.png`,
  `enviar-contratante-{desktop,celular}.png`, `adicionar-contato-desktop.png`). Corrigidos:
  - o risco sobre o rodapé do balão (o `footer` global vazava);
  - balões colados;
  - telefone cru no cartão;
  - "Texto sugerido" que ficava depois de o operador editar.

  Fica o título duplicado no "Adicionar aos contatos" ("Novo contato" do formulário da T303), menor.

- **Rodado:**
  - API, contrato: **7332 pass, 0 fail**;
  - frontend: **5217 + 44 pass, 0 fail**, e o build passou;
  - worker: **1432 pass**;
  - lint e typecheck limpos;
  - API, integração completa, rodada sozinha: **588 pass, 7 skip, 8 fail**. As 8 são as de MinIO de
    sempre.

## T501 — A política de atribuição do WhatsApp (verde)

- `resolveWhatsAppAttribution` (`occurrence-conversation/domain/whatsapp-attribution.policy.ts`),
  pura.
  - A resposta (`context.id`) a uma mensagem da conversa vai para ela, se quem responde é parte da
    conversa: o motorista dela, ou contato com aceite da contratante dela.
  - Motorista fora disso: fluxos de comando da spec 144, como hoje. Número de motorista que também é
    de contato fica no comando.
  - Contratante sem resposta: vai para a **única** conversa aberta das contratantes do contato; duas
    ou nenhuma vão para "não atribuída".
  - Sem aceite, ou número que não é de contato: recusado (D6).
- **Leitura do RF9 (registrada):** a spec diz "à conversa aberta mais recente daquele contato" e
  também "com mais de uma candidata aberta, vai para não atribuída… nunca por palpite". As duas só
  se conciliam com uma candidata: com uma, vai para ela; com mais de uma, o operador escolhe. Se a
  intenção era "a mais recente vence", é uma linha na política.
- Contrato por tabela `test/occurrence-conversation/whatsapp-attribution-policy.contract.ts`, 13
  ramos, escrito **antes** e visto falhando (módulo inexistente). Cobre, entre outros:
  - resposta da contratante;
  - uma conversa aberta, duas, nenhuma;
  - mesmo número em duas contratantes;
  - conversa de outra contratante;
  - resposta à conversa de outra contratante;
  - sem aceite e desconhecido;
  - motorista respondendo, sem resposta e respondendo à de outro motorista;
  - número de motorista e contato ao mesmo tempo.
- Rodado: a suíte `occurrence-conversation`, **70 pass**, com lint e typecheck limpos.

## T502 — O webhook do WhatsApp: a conversa, a fila e o status da Meta (verde, com a mídia na T702)

- **Hook de mensagem:** `createOccurrenceConversationWhatsAppHook`
  (`application/whatsapp-conversation-inbound.service.ts`) fica **na frente** do despachante de
  comandos da 144, montado por empresa no resolvedor do módulo (`main.ts`).
  - Teto por número num balde próprio, e só depois o banco. Lê quem é o número (contatos ativos pela
    chave do WhatsApp, com as duas grafias do nono dígito; motorista pelo WhatsApp verificado com
    vínculo ativo), a conversa da referência de resposta e as candidatas abertas.
  - Aplica a política da T501. Conversa ou "não atribuída": grava e para ali (idempotente pelo id da
    Meta, `onConflictDoNothing` no `unique` da T401).
  - Número sem aceite, desconhecido e o motorista fora de resposta seguem para o despachante, que
    continua recusando quem não é vinculado: **nada muda na 144**.
  - Falha não sobe para o webhook, e o log leva só `companyId` e o nome do erro.
- **Status da Meta:** o resolvedor ganhou `buildStatusHook` com a empresa do canal, porque o gancho
  de status pode chegar sem sessão.
  - `createOccurrenceConversationWhatsAppStatusHook` aplica `sent`, `delivered`, `read` e `failed`
    com o horário da Meta, pela política (RF14).
  - O escritor ficou um só para os canais (`applyProviderMessageStatus`), e o do e-mail (T405) passou
    a delegar a ele.
  - No `meta-whatsapp-module@0.1.0` da instalação, o gancho só dispara para mensagem que o módulo
    enviou. É o caso do envio da T503.
- **Correção ao plano (técnica):** a mídia recebida (baixar da Meta, bucket, `sha256`) fica com os
  anexos da **T702**. Aqui a conversa guarda a legenda, ou o título do botão ou da lista. O caminho
  de anexo (bucket, tipo pelo conteúdo, URL temporária) é um só para os três canais, e fazê-lo
  primeiro no WhatsApp duplicaria a T702.
- **Testes:**
  - `test/occurrence-conversation/whatsapp-inbound-hook.contract.ts`, **antes** e visto falhando,
    cobrindo:
    - conversa e para ali;
    - motorista respondendo;
    - não atribuída com o contato;
    - sem aceite, desconhecido e motorista fora de resposta seguem sem gravar;
    - texto de botão e legenda;
    - falha sem telefone nem corpo no log;
    - teto por número.
  - `whatsapp-status-hook.contract.ts`, **antes** e visto falhando: mapeamento, horário da Meta ou
    relógio, sem id nada, falha só pelo nome do erro.
  - Integração `test/integration/occurrence-conversation-whatsapp.integration.ts` (no
    `package.json`), escrita **depois** da implementação, **3 pass** na primeira rodada. Cobre:
    - a mensagem entra na conversa uma vez só, pelas duas grafias do número;
    - duas conversas abertas vão para a fila, com o contato;
    - sem aceite segue para o despachante sem gravar;
    - o status vai de `sent` a `read`, e `read` e `delivered` repetidos não mudam nada;
    - outra empresa não toca.
- **Rodado:**
  - API, contrato: **7357 pass, 0 fail**;
  - integrações do WhatsApp da 144 (comando, verificação, ações do motorista): **10 pass**, depois
    de mexer no resolvedor;
  - lint e typecheck limpos.

## T503 — ⏭️ pulada: faltam os modelos da Meta (T002)

O envio por WhatsApp fora da janela de 24h só sai por **modelo aprovado pela Meta**, e a T002 (o
usuário submete os modelos de abertura e de aviso) não foi feita. Pela regra da execução, a T503 fica
**aberta** e a execução segue. Tudo o que ela precisa do lado de dentro já existe:

- a conversa;
- o status da Meta pela política (T502, gancho do módulo, que dispara para mensagem enviada por ele);
- a atribuição da resposta pelo `context.id` (T501).

Volta quando os modelos estiverem aprovados e com o nome cadastrado.

## T504 — A conversa nunca decide (D4) (verde)

- Contrato `test/occurrence-conversation/conversation-never-decides.contract.ts`, no entrypoint.
  - **Por texto de fonte:** o código da conversa nas duas apps (`api/src/occurrence-conversation`,
    `worker/src/occurrence-conversation`, `worker/src/contractor-mail` e o caso de uso do webhook do
    Resend) não escreve nem importa as tabelas e os casos de uso da tratativa, da cobrança e do
    acerto da 164 (`trip_occurrence_cases`, eventos, `trip_occurrence_item_settlements`,
    `delivery_charges`, eventos, lotes, decidir, acertar, ressarcir, reentrega).
  - **Por comportamento:** um botão "Aprovado" e um texto "APROVADO" pelo WhatsApp só viram mensagem
    da conversa. A porta do hook só sabe gravar mensagem.
  - A resposta de e-mail com "APROVADO" é gravada com `interpretation` nula pelo worker (143), e a
    transcrição (T706) ainda não existe. Os dois entram na prova por texto de fonte assim que tiverem
    código.
- **Ordem honesta:** o contrato passou na primeira rodada, porque não havia nada a implementar; a
  garantia é de estrutura. Para provar que ele pega a violação, uma linha importando
  `decide-occurrence-case.use-case` foi posta de propósito na política de atribuição: o contrato
  reprovou com os dois ofensores, e a linha foi tirada.
- Rodado: a suíte `occurrence-conversation`, **84 pass**, com lint e typecheck limpos.

## T505 — A fila de mensagens sem conversa (verde)

- **Rotas** (`presentation/occurrence-conversation-unassigned.routes.ts`, `no-store`):
  - `GET /occurrence-conversations/unassigned` (`fleet.read`): as pendentes da empresa, as mais
    novas primeiro, até 100, cada uma com as **candidatas**;
  - `POST /occurrence-conversations/unassigned/:id/assign` (`occurrences.resolve`), corpo estrito
    `{ conversationId }`.
- **Correção ao plano (técnica):** o plano dava `trip.manage` às duas. O separador tem
  `trip.manage`, e escolher para qual conversa vai a mensagem da contratante é conduzir a tratativa
  (mesma correção da T404). Ler fica com `fleet.read`, como as conversas.
  `test/separator-role.contract.test.ts` ganhou a leitura e as rotas da fila.
- **Candidatas:** as conversas **abertas** com a contratante das contratantes do remetente. São do
  contato gravado na fila quando é um só; senão, de todo contato ativo com aquele número (chave do
  WhatsApp) ou e-mail. Calculadas pelo servidor, dentro da empresa, e conferidas de novo na
  atribuição, sob `FOR UPDATE` da linha da fila. Cada candidata leva a última mensagem da operação
  (horário e 140 caracteres), para escolher sem abrir.
- **Atribuir:**
  - grava a mensagem na conversa com o horário em que **chegou**, e marca quem e quando;
  - já atribuída: 409 `OCCURRENCE_CONVERSATION_ALREADY_ASSIGNED`;
  - conversa fora das candidatas: 422 `OCCURRENCE_CONVERSATION_ASSIGNMENT_INVALID`;
  - inexistente ou de outra empresa: 404.
- **Tela:** `UnassignedMessages` no topo de `/ocorrencias`, só quando há mensagem na fila. Mostra:
  - o remetente (contato ou telefone com a máscara da casa), o canal, a hora e o texto;
  - as candidatas por radio, na cor da casa (`accent-color`; o design system não tem radio), com a
    última mensagem nossa e o link para a ocorrência;
  - "Atribuir" só com `occurrences.resolve`, e cada erro com texto próprio.
- **Correção de infraestrutura de teste (commit próprio `539a9e84`):** as integrações da conversa
  davam `PostgresError: Failed to read data` de forma intermitente, inclusive rodando sozinhas.
  - Causa: o banco descartável usava `createDrizzleProvider` cru (instruções preparadas), e as
    leituras da conversa fazem consultas em paralelo. É a mesma causa da spec 137 e da 148 T7.
  - Produção já usa `createDatabaseProvider` (`prepare: false`). As integrações da conversa passaram
    a usar `withConversationDatabase` com ele: **3 rodadas seguidas, 30 pass**.
  - Isto corrige a leitura das falhas "por concorrência" registradas na T406: eram esta causa, que a
    concorrência só tornava mais frequente.
- **Testes:**
  - Escritos **antes** e vistos falhando (módulos inexistentes):
    - caso de uso (`unassigned-assignment.contract.ts`): atribui com o horário de chegada, marca,
      candidata inválida, já atribuída, inexistente, nada gravado nos erros;
    - rotas (`unassigned-routes.contract.ts`): leitura por `fleet.read`, atribuir por
      `occurrences.resolve`, o separador lê e não atribui, corpo estrito, erro pelo código;
    - cliente do frontend (`unassigned-client.contract.ts`): item e candidata malformados saem,
      atribuir manda só a conversa.
  - O contrato do separador reprovou duas vezes antes de passar: a rota fora da lista de fábricas, e
    depois a ordem da lista esperada.
  - Integração `test/integration/occurrence-conversation-unassigned.integration.ts` (no
    `package.json`), escrita depois do adaptador. Cobre:
    - a fila com as duas candidatas e a última mensagem nossa;
    - outra empresa sem fila e sem atribuição;
    - conversa inválida;
    - atribui uma vez, com o horário de chegada, e a fila fica vazia.
  - Smoke `test/spec-183-unassigned.smoke.spec.ts`, 3 pass: prints desktop e 390 px, e a escolha da
    segunda conversa, que tira a mensagem da fila.
- **Revisão de design:** corrigidos o print de celular cortado (tirado sem refazer o layout), o
  telefone cru e o radio azul do navegador.

- **Rodado:**
  - API, contrato: **7367 pass, 0 fail**;
  - frontend: **5219 + 44 pass, 0 fail**;
  - lint e typecheck limpos;
  - API, integração completa, sozinha: **592 pass, 7 skip, 8 fail**, só as 8 de MinIO, e nenhuma
    da conversa com o banco de produção.

## T506 — ⏭️ aberta: depende do envio por WhatsApp (T503, que depende da T002)

O seletor "E-mail / WhatsApp / Os dois" escolhe por onde a mensagem **sai**. Sem a T503 não há envio
por WhatsApp: a rota de envio responde 422 `OCCURRENCE_CONVERSATION_CHANNEL_UNAVAILABLE` para o
canal. Um seletor com uma opção que sempre falha é pior que não ter o seletor. Volta junto com a
T503.

## T601 — A conversa com o motorista pelo app (verde, com a foto na T702)

- **Operador → motorista:** a rota de envio da T404 passou a aceitar `participant = driver` com
  `channel = app` (corpo estrito `{ body, channel }`), pela mesma `occurrences.resolve`. O `parse`
  lê o canal primeiro e confere o corpo estrito do canal; qualquer outra combinação continua 422
  `OCCURRENCE_CONVERSATION_CHANNEL_UNAVAILABLE`. O caso de uso `createSendDriverAppMessageUseCase`:
  - o motorista é o **usuário** (vínculo ativo) do primeiro condutor da viagem; sem ele, 422
    `OCCURRENCE_CONVERSATION_DRIVER_UNKNOWN`;
  - idempotência com trava consultiva (`occurrence-conversation.app.send`), e a mesma chave com
    outro texto é 409;
  - a mensagem nasce `queued` (política da T402, canal `app`) na conversa do motorista;
  - depois da transação, e só na primeira vez, o aviso na caixa (`notification.v1`) com
    `dedupeKey` = id da mensagem. O template novo `trip.occurrence-conversation-message` é só
    caixa de entrada e **sem o corpo** (o texto fica na conversa). Aviso que falha é registrado
    pelo nome do erro e não desfaz a mensagem.
- **Motorista:** `GET` (`trip.read`) e `POST` (`trip.report`, com `Idempotency-Key`)
  `/me/trips/current/occurrences/:id/messages`.
  - O motorista é a ficha do vínculo do contexto; sem ficha, a mesma recusa 409
    `DRIVER_NOT_REGISTERED` das outras rotas `/me`.
  - Só a ocorrência de viagem com a ficha dele na tripulação é alcançada; a outra é 404.
  - Lê só a conversa **dele**: a da contratante nunca aparece.
- **Correção ao plano (técnica):** a resposta com **foto** entra com os anexos da **T702**, como a
  mídia do WhatsApp na T502. É um caminho de anexo só para os três canais: bucket privado, tipo
  conferido pelo conteúdo, URL temporária. Aqui a resposta é texto.
- **Leitura do caminho `/me/trips/current/...`:** vale a ocorrência de qualquer viagem em que a ficha
  está na tripulação, não só a "atual". A conversa sobrevive ao fim da viagem, e restringir à atual
  cortaria a resposta do motorista no fim do dia.
- **Testes, escritos antes e vistos falhando (módulos inexistentes):**
  - `driver-conversation.contract.ts`: fila e aviso, a chave repetida sem outra mensagem nem outro
    aviso, 409 com outro texto, sem motorista 422, outra empresa 404, texto vazio 422, aviso que
    falha, leitura com o nome, resposta idempotente, motorista de outra viagem 404;
  - `me-conversation-routes.contract.ts`: `trip.read`/`trip.report`, a chave e o corpo estrito,
    sem ficha 409, fora da tripulação 404;
  - `conversation-routes.contract.ts` ganhou o app ao motorista (202), o app à contratante (422) e
    campo a mais (400).
- **Integração** `test/integration/occurrence-conversation-driver.integration.ts` (no
  `package.json`), escrita **depois** do adaptador, **1 pass** na primeira rodada. Cobre:
  - sem vínculo, 422;
  - a mensagem `app`/`queued` na conversa do usuário do motorista, com o aviso e a mesma chave sem
    duplicar;
  - leitura e resposta do motorista;
  - ficha fora da tripulação e outra empresa, 404.
- **Rodado:**
  - API, contrato: **7380 pass, 0 fail** (inclui o catálogo de avisos, 16);
  - lint, formatação e typecheck limpos.
  - API, integração completa, sozinha: **593 pass, 7 skip, 8 fail**, só as 8 de MinIO.

- **Correção depois do commit (achada pelos portões da T603):** a chave do template era
  `trip.occurrence-conversation-message`, e o prefixo `trip.occurrence-` é a família dos avisos de
  **parada** que o PWA do motorista copia (`test/driver-trip/occurrence-preview.contract.ts`
  reprovou). A chave virou `trip.conversation-message` (`TRIP_CONVERSATION_MESSAGE`); nunca foi
  publicada. O preview de avisos ganhou o exemplo de `occurrenceLabel`
  (`test/notification/preview-payload.contract.ts` reprovou). Frontend: **5223 + 44 pass**.

## T602 — ⏭️ aberta: faltam os modelos da Meta (T002)

Mandar mensagem ao motorista pelo WhatsApp fora da janela de 24h exige modelo aprovado (T002).
Pela regra da execução, a T602 fica aberta. O **ramo de entrada** já existe desde a T502: a resposta
do motorista pelo WhatsApp só entra na conversa quando responde (`context.id`) a uma mensagem dela, e
o resto segue para os fluxos de comando da spec 144. É o contrato de "número sem `context.id` da
conversa continua chegando aos comandos" (`whatsapp-inbound-hook.contract.ts` e a tabela da T501).
Falta o envio.

## T603 — A aba Motorista no detalhe (verde, com as ações da foto na T702)

- **Tela:**
  - O painel "Conversas" ganhou a aba **Motorista**, só quando a viagem tem motorista (P7: sem
    motorista, a aba não aparece).
  - O fio é o mesmo da aba Contratante (extraído em `ConversationThread`): dia, balão no tom verde
    do motorista (T704), selo do app com "Lido", porque o app confirma a leitura (RF14).
  - O compositor ("Mensagem ao motorista" + "Enviar pelo app") aparece só com `occurrences.resolve`.
    Tem uma chave de idempotência por mensagem escrita, que se renova depois do envio; limpa o campo
    ao enviar e diz o que falta (em branco, acima de 8.000).
  - Abrir a aba com mensagem nova marca como lida (RF15), pelo mesmo gancho da aba Contratante.
- **Correção ao plano (registrada):** a P7 diz que "uma **foto** recebida pode ser anexada à
  ocorrência ou encaminhada à conversa da contratante". As duas ações são sobre a foto, e a foto
  chega com os anexos da **T702** (a resposta do motorista com foto também foi para lá, na T601).
  As duas ações entram na T702, quando houver o que anexar ou encaminhar.
- **Testes, escritos antes e vistos falhando (exportação inexistente):**
  - cliente: o envio ao motorista manda só `{ body, channel: 'app' }` com a chave;
  - serviço puro: o rascunho aparado ou o que falta, a mensagem do motorista do lado dele no tom
    dele, a chave no formato da API.
- **Smoke `test/spec-183-driver-conversation.smoke.spec.ts`, 4 pass:**
  - prints desktop e 390 px;
  - o envio em branco diz o que falta sem mandar;
  - o envio real entra "na fila", com corpo aparado, canal `app` e a chave;
  - a ocorrência de parada sem motorista não mostra a aba.
- **Revisão de design:** tons e selo conferidos nos dois tamanhos, sem rolagem horizontal. Nada a
  corrigir.
- **Rodado:**
  - frontend: **5223 + 44 pass**;
  - API, contrato da conversa e do catálogo: **121 pass**;
  - lint, formatação e typecheck limpos.

## T604 — A conversa no app do motorista, com entregue e lida gravados (verde)

- **API (rotas `/me`, `trip.read`, recortadas pelo motorista do contexto):**
  - `GET /me/trips/current/occurrence-conversations` lista as conversas do motorista (até 20, da
    mais recente), com o rótulo da ocorrência e as mensagens da operação ainda não lidas. Baixar a
    lista grava **`delivered`** nas mensagens do app que estavam `queued` (RF14, pela política da
    T402, que só avança).
  - `GET /me/trips/current/occurrences/:id/messages` também grava `delivered`, só daquela conversa.
  - `POST /me/trips/current/occurrences/:id/messages/read` grava **`read`** (204, `no-store`);
    ocorrência que não é do motorista responde 404, igual a inexistente.
  - A escrita trava as linhas (`for update of` a mensagem) e só grava as que a política mudou:
    repetir o `read` não muda `status_times`.
- **App (PWA):**
  - o workspace do motorista ganha o atalho "Mensagens da operação (N nova[s])" quando há conversa;
  - a lista mostra a ocorrência e as novas; abrir a conversa marca como lida;
  - a resposta usa a validação e a chave de idempotência da T601 e aparece no fio ao enviar.
- **Testes, escritos antes e vistos falhando (exportações inexistentes):**
  - caso de uso: a lista aplica `delivered` sem ocorrência e devolve o horário em ISO; o `read` de
    ocorrência alheia é 404 sem escrita;
  - rotas: permissão, recorte, 204 `no-store`;
  - cliente do app: caminhos, chave no cabeçalho e contagem de não lidas
    (`test/occurrence-conversation/driver-client.contract.ts`, no entrypoint).
- **Integração** `occurrence-conversation-driver.integration.ts` (Postgres): a mensagem da operação
  sai `queued` → a lista a leva a `delivered` e conta 1 nova → `read` uma vez → 0 novas, e o segundo
  `read` não muda nada.
- **Smoke `test/spec-183-driver-app.smoke.spec.ts`, 1 pass, prints 390 px:**
  - o atalho mostra a nova (`prints/motorista-app-atalho.png`);
  - abrir a conversa chama o `read`;
  - o envio em branco diz o que falta;
  - a resposta sai aparada, com a chave `driver-message:`, e entra no fio
    (`prints/motorista-app-conversa.png`).
- **Revisão de design:** o atalho usa a faixa de aviso do próprio workspace; o fio usa os balões e
  tons da aba Motorista (T603); o campo e o botão têm a mesma largura e o botão é o primário da tela;
  sem rolagem horizontal a 390 px. Nada a corrigir.
- **Rodado:**
  - frontend: **5226 + 44 pass**;
  - API: contrato da conversa **111 pass**; integração completa rodada sozinha: **593 pass, 7 skip,
    8 fail** — as 8 são as conhecidas do MinIO (arquivo de CT-e e extrato de pedágio da 154, bucket
    fora do ar), iguais à linha de base;
  - lint, formatação e typecheck limpos.

## T605 — ⏭️ aberta: a política está pronta; o job e o aviso esperam o envio por WhatsApp

**Por que fica aberta.** A T605 age sobre a conversa pelo WhatsApp, e nada dela sai para o mundo
hoje:

- o aviso automático é uma mensagem **enviada** pelo WhatsApp, e o envio é a T503 (aberta);
- o "aviso de troca para o app" do motorista é um dos modelos que a T002 manda submeter à Meta;
- o canal WhatsApp na caixa de envio, onde apareceriam "a janela fecha em N min", "Avisar agora" e
  "Mudar agora", é a T506 (aberta).

Sem envio, nenhuma conversa tem fala da operação pelo WhatsApp, então o aviso nunca seria devido. E
o canal padrão só escolhe entre canais que a tela ainda não oferece. Um job agendado e uma tabela de
configuração agora seriam código sem efeito, com uma rotina nova no catálogo das quatro apps e uma
migration de CHECK para rodar vazia. Ficam para quando a T503 e a T506 voltarem, junto com a
integração "o aviso sai uma vez com o job rodando duas vezes".

**Entregue agora — a política pura:** `domain/whatsapp-window-expiry.policy.ts`
(`decideWhatsAppWindowExpiry`), com a suíte por tabela
`test/occurrence-conversation/whatsapp-window-expiry-policy.contract.ts` no entrypoint. A suíte foi
escrita antes e vista falhando (módulo inexistente). Ela cobre os critérios de aceite do RF20:

- **estado:** sem recebida é `none`; depois `open`; a última hora é `closing`; no fim, `closed`;
- **aviso:** sai na antecedência da empresa e **uma vez por janela** (a chave é o início dela);
  - não sai antes da antecedência, com a janela fechada, sem fala da operação na janela, com o
    aviso já gravado para o mesmo início, ou desligado para aquele participante (motorista ligado
    por padrão, contratante desligado);
  - a resposta antes do aviso reabre a janela e leva o aviso para o fim da nova (é o "cancela");
- **fechou:** o canal passa para o app (motorista), o portal (contratante com acesso e ocorrência
  visível), o e-mail (com e-mail) ou o modelo (sem nenhum dos dois). Com a janela aberta, o canal
  não troca, mas a caixa de envio já sabe o próximo.

**Leitura registrada (comportamento — proposta de redação para o RF20):** "só se houve mensagem pelo
WhatsApp naquela janela" foi lido como "se a **operação** falou pelo WhatsApp depois da abertura".
A mensagem recebida que abre a janela sempre existe, então a leitura literal nunca bloquearia nada.
E a contratante que só recebeu e-mail nosso não precisa saber que um WhatsApp fecha. Proposta: trocar
a frase por "só se a operação mandou mensagem pelo WhatsApp naquela janela".

- **Rodado:** API, contrato da conversa **140 pass**.

## T650 — O `CLAUDE.md` do portal registra que a app cresceu (verde)

- `apps/frontend-client/CLAUDE.md` e a cópia de consulta `docs/ai-context/frontend-client.md`
  ganharam o parágrafo "A app cresceu uma vez, por escrito", depois de "Crescer a app é decidir
  isso de novo, por escrito". O diff é só de acréscimo (+24 em cada). Ele registra:
  - que a conversa fica ao lado do `DecisionForm` e nunca decide;
  - que `Permissions-Policy` e `connect-src` não mudam;
  - a `conversationRef` no lugar de id interno, e a dívida da rota de decisão da 164;
  - o serializador sem motorista nem funcionário;
  - o aviso por e-mail sem corpo;
  - que a app continua sem design system e sem Playwright.
- **Divergência técnica registrada:** a ADR-0073 §1 manda importar o `styles.css` do pacote. O
  `CLAUDE.md` do portal diz que ele **não** é importado, pelo mesmo achado da T407 (regra global
  `:where(*)`/`:root` e `MessageBubble` só com Tailwind). O balão é nosso, e os tokens de balão são
  cópia por valor dos do painel. Proposta de correção à ADR-0073 §1, igual à da ADR-0051 §1 na T407:
  "peças do pacote, sem o `styles.css`".
- **Rodado:** `frontend-client` **55 pass**; prettier limpo nos dois arquivos.

## T651 — A conversa da contratante pelo portal, pela referência opaca (verde)

- **Rotas novas** (`occurrence-conversation/presentation/client-occurrence-conversation.routes.ts`):
  - todas com `deliveries.track`, `cache-control: no-store`, `pathParameterFormat: 'opaque'` e teto
    no Postgres:
    - `GET /client/me/occurrence-conversations/:ref` — o fio e as não lidas da conta;
    - `POST …/:ref/messages` — `{ body }` estrito, `Idempotency-Key` obrigatória, 201;
    - `POST …/:ref/read` — 204;
  - baldes: ler e marcar como lida dividem `contractor-occurrence-conversation-read` (120/300 s);
    enviar tem `contractor-occurrence-conversation-send` (30/300 s). Ambos estão em
    `test/rate-limited-routes.contract.test.ts`.
- **`conversationRef` em `GET /client/me/occurrences`** (164): uma leitura de referências por
  página. Sai `null` quando a contratante do recorte não é a da conversa: o recebedor vê a
  ocorrência, mas não a conversa com o emitente (D1).
- **O recorte e a visibilidade:**
  - a conversa só é achada quando valem juntos:
    - a conversa é **com a contratante** (nunca a do motorista);
    - a contratante dela está em `scope.contractorIds`;
    - a ocorrência é de nota do recorte;
    - a tratativa está visível ao portal (164 D5);
  - referência de outra contratante, inexistente, de tratativa ainda interna, fora do formato ou
    com cara de UUID responde o **mesmo 404** da 164 (`OCCURRENCE_CASE_NOT_FOUND`). As duas
    últimas nem chegam ao banco;
  - conta sem vínculo recebe o 403 de sempre, antes de qualquer leitura.
- **A resposta** traz só `side` (`carrier` | `contractor`), `mine`, `channel`, `body` e
  `createdAt`. Não traz id de mensagem, autor da transportadora, endereço nem nada do motorista (a
  consulta só lê a conversa com a contratante).
- **O envio:**
  - grava mensagem **recebida** pelo canal `portal`, com `author_user_id` da conta do portal (o
    CHECK da T401 já previa);
  - o operador a lê na mesma conversa;
  - a mesma chave com o mesmo texto devolve o gravado; com outro texto é 409; em branco ou acima
    de 8.000 é 422.
- **A lida** é por conta do portal (`occurrence_conversation_reads`, a mesma função do operador).
  As não lidas do portal contam as mensagens **da transportadora** depois da última lida.
- **Decisão técnica registrada — a conversa nasce na listagem:** quando a ocorrência chega ao portal
  e a transportadora ainda não escreveu, a contratante precisa poder escrever primeiro. A listagem
  cria a conversa que falta (idempotente, `onConflictDoNothing` na chave única da T401), com a
  `public_ref` aleatória de sempre (`createPublicRef`), sem evento e sem auditoria.
- **Correção forçada pelo contrato da T504 (D4):** a primeira versão do repositório lia
  `trip_occurrence_cases` para saber a visibilidade, e o contrato "a conversa nunca decide" reprovou
  por texto de fonte. A fronteira da 164 virou
  `buildContractorVisibleOccurrenceCondition` no próprio `contractor-occurrence.query.ts` (dono da
  D5), com tabelas de apelido próprio. A conversa só a usa e continua sem conhecer a tratativa.
- **Anexo (fora desta task):** a rota de anexo do portal entra na **T702**, com os anexos. É a
  mesma decisão da T502/T601/T603 para foto e mídia.
- **Testes, escritos antes e vistos falhando** (módulo inexistente; a `conversationRef` ausente na
  listagem):
  - `test/occurrence-conversation/contractor-portal-conversation.contract.ts` (entrypoint da
    conversa):
    - caso de uso: serialização sem id nem autor; os três 404 iguais; formato e UUID sem tocar o
      banco; conta sem vínculo; envio, replay, 409 e 422; lida por conta; referências pelo recorte;
    - rotas: caminhos, política, formato opaco, `no-store`, chave obrigatória, corpo estrito (um
      `decision` no corpo é 400);
    - texto de fonte: sem `:id`, sem `parseUuidPathIdentifier`, sem `companyId`/ids no arquivo de
      rotas; nada de `taxId`, `driver`, `decide`/`decision`, `caseStatus`, `transition` ou log;
    - a listagem da 164 com `conversationRef` e `null`.
  - `test/contractor-portal-schema/tenant-safety.contract.ts` (novo, no entrypoint do schema do
    portal): toda junção leva `companyId`, na conversa e na fronteira da 164; todo `where` da
    conversa filtra pela empresa; achar e criar exigem `scope.contractorIds` e a fronteira.
  - `test/integration/occurrence-conversation-portal.integration.ts` (Postgres, **3 pass**,
    registrada no `package.json`):
    - tratativa interna não dá referência nem conversa;
    - visível, a referência é a da conversa que o e-mail criou;
    - leitura, envio idempotente, a mensagem na visão do operador como `portal`/recebida, lida
      zerando as não lidas;
    - a listagem cria a conversa uma vez só, e a contratante escreve primeiro;
    - outra contratante da mesma empresa e outra empresa com a referência na mão: 404, sem
      referência.
- **Rodado:**
  - API, contratos **7448 pass, 23 skip, 0 fail**;
  - integrações da 164 que leem a listagem (`trip-occurrence-case`, `occurrence-case-closure`,
    `contractor-portal*`) com a do portal: **15 pass**;
  - integração completa, rodada sozinha: **596 pass, 7 skip, 8 fail** (611 testes em 118 arquivos,
    a do portal entre eles). As 8 são as conhecidas do MinIO, iguais à linha de base. A entrada nova
    no `package.json` foi escrita sem o `./` das outras e corrigida para `./test/integration/…`, por
    consistência (a rodada mostra que o arquivo rodou);
  - lint e typecheck da raiz limpos.

## T652 — Pelo portal, a conversa também nunca decide (verde)

- `test/occurrence-conversation/conversation-never-decides.contract.ts` ganhou o bloco "pelo portal,
  a conversa também nunca decide". Ele complementa a prova por texto de fonte da T504, que já varre
  todo `src/occurrence-conversation` e agora pega as rotas e o caso de uso do portal.
  - **Comportamento:** "APROVADO" e "Aprovo a devolução, pode cobrar a taxa." enviados pelo portal,
    por uma conta que **tem** `occurrences.decide`, gravam só a mensagem e a chave de idempotência.
    A porta inteira da conversa do portal não tem operação que alcance tratativa, taxa ou acerto.
  - **Texto de fonte:** entre os arquivos de rota da API que servem `/client/`, só
    `contractor-portal/presentation/contractor-occurrence.routes.ts` (a decisão da 164, que o
    `DecisionForm` chama) pede `occurrences.decide`. As rotas da conversa pedem `deliveries.track`.
- **O contrato morde:** com a rota da conversa trocada para `occurrences.decide` (mutação temporária,
  desfeita), ele reprova, junto com dois contratos da T651. Contra a T651 como está, passa. O
  código que ele prova é o da T651: esta task é o contrato.
- **Tela:** o lado do portal (a conversa não importa nem monta a decisão) é contrato da T653, onde a
  tela nasce.
- **Rodado:**
  - API, contratos **7450 pass, 23 skip, 0 fail**;
  - a integração não muda nesta task (só um arquivo de contrato). A rodada completa da T651, sobre o
    mesmo código, vale para ela.

## T653 — A conversa na tela "Ocorrências" do portal (verde; anexo e áudio com a T702/T705)

- **Tela** (`apps/frontend-client/src/modules/occurrences/`):
  - `OccurrenceConversation.component.tsx` fica no cartão da ocorrência, **abaixo** do
    `DecisionForm` da 164, que continua sendo a decisão;
  - fechada por padrão, "Conversa com a transportadora (N nova[s])";
  - abrir lê o fio e marca como lida (RF15);
  - o fio é agrupado por dia com o `DateDivider` do pacote, e o texto sai pelo `MessageText` dentro
    de um balão nosso;
  - a transportadora fica à esquerda, em cobre, como empresa ("Transportadora"); a contratante à
    direita, em azul ("Você" ou "Sua equipe"), como pede a D9. Cada mensagem diz por onde chegou
    (e-mail, WhatsApp, portal);
  - o campo "Mensagem para a transportadora" diz o que falta sem ir à API e renova a chave de
    idempotência depois do envio.
- **As não lidas na listagem (acréscimo à API desta task):** sem elas, o botão só saberia das novas
  depois de aberto. `GET /client/me/occurrences` passou a trazer `conversationUnreadCount` ao lado
  da `conversationRef`:
  - são as mensagens da transportadora depois da última lida **desta conta**;
  - saem numa consulta agrupada por página;
  - a condição de "não lida" é uma função só (`unreadByUser`), a mesma da leitura do fio.
- **Pacote:** `@adatechnology/conversations-ui@0.3.1` entrou no portal, com a mesma versão fixada do
  painel. O lockfile mudou uma linha e nada foi baixado. O `styles.css` do pacote **não** é
  importado: a mesma regra global da T407, já registrada no `CLAUDE.md` do portal na T650.
- **Bundle (a ADR-0073 pede antes e depois):**

  |     | antes (sem a conversa)    | depois                     | diferença                      |
  | --- | ------------------------- | -------------------------- | ------------------------------ |
  | JS  | 283,00 kB (gzip 87,02 kB) | 356,24 kB (gzip 111,49 kB) | **+73,24 kB (gzip +24,47 kB)** |
  | CSS | 3,69 kB (gzip 1,24 kB)    | 4,76 kB (gzip 1,48 kB)     | +1,07 kB (gzip +0,24 kB)       |

  É muito para duas peças pequenas. O índice do pacote não declara `sideEffects: false`, e o
  `MessageText` puxa o `tailwind-merge`. **Proposta ao pacote** (não bloqueia):
  - declarar `sideEffects: false`;
  - exportar as peças de texto e data por um caminho próprio, para o portal (e o celular do
    cliente) pagar só pelo que usa.

- **Revisão de design:** prints numa bancada temporária, porque o portal não tem Playwright nem
  atalho de login, e um contrato proíbe esse atalho. A bancada monta o `OccurrenceListPage`
  verdadeiro com um cliente falso, foi servida pelo Vite e apagada depois. Os prints são de 1440 e
  390 px:
  - `prints/portal-conversa-fechada-{desktop,celular}.png` — o botão com "(1 nova)";
  - `prints/portal-conversa-{desktop,celular}.png` — o fio aberto: dia, lados, tons, canal, o envio
    em branco dizendo o que falta e o enviado no fio;
  - sem rolagem horizontal (`scrollWidth` 1440 e 390).

  Achados:
  1. **Corrigido nesta task:** o botão da conversa dizia "Enviar", ao lado de "Enviar decisão" no
     mesmo cartão. Justo a confusão que a D4 separa. Virou **"Enviar mensagem"**, com contrato.
  2. **Fora desta task (anterior à 183):** os três rádios do `DecisionForm` da 164 aparecem como
     círculos grandes. A regra global `input { width: 100%; min-height: var(--field-height) }` do
     portal pega o `type="radio"`. Registrado para uma task própria, porque a correção é no CSS
     global e no formulário da 164.

- **Anexo e áudio:** o anexo por arquivo entra com a **T702** e o player de áudio com a **T705**,
  quando existirem na API. A `Permissions-Policy` não muda (contrato abaixo).
- **Testes, escritos antes e vistos falhando** (módulo inexistente; depois, o campo de não lidas
  ausente). O arquivo é `test/occurrences/conversation.contract.ts`, no entrypoint:
  - resposta:
    - a `conversationRef` e as não lidas;
    - referência fora do formato vira `null`;
    - a conversa lida campo a campo: id, autor e nome de motorista não passam, e lado ou canal
      desconhecido fica de fora;
  - cliente: os três caminhos pela referência, o corpo `{ body }`, a chave no cabeçalho e o 204 sem
    corpo;
  - serviço: o rascunho, a chave no formato da API, o agrupamento por dia, o lado, o tom e o autor
    (D9), e o contador do botão;
  - texto de fonte:
    - as peças do pacote sem o `styles.css`;
    - nada de `getUserMedia`, `MediaRecorder` nem `capture=`, e a `Permissions-Policy` igual;
    - a conversa não chama nem monta a decisão;
    - "Enviar mensagem";
    - os tokens de balão iguais aos escuros do painel;
    - o contador vindo da listagem.
  - API: os contratos da T651 foram estendidos (as referências com `unreadCount`, o `userId` da
    conta, a listagem com `conversationUnreadCount`), e a integração do portal agora confere as
    não lidas na listagem (1, e 0 depois da lida).
- **Rodado:**
  - portal: **70 pass**, build, lint e typecheck;
  - API: contratos **7450 pass, 23 skip, 0 fail**; integração do portal **3 pass**; integração
    completa sozinha **596 pass, 7 skip, 8 fail** (as 8 do MinIO, iguais à linha de base);
  - lint e typecheck da raiz limpos.

## T654 — O canal Portal do lado do operador, com o aviso por e-mail sem o corpo (verde; sem o link)

- **Envio** (`POST /trip-occurrences/:id/conversations/contractor/messages`,
  `{ body, channel: 'portal' }` estrito, `occurrences.resolve`, `Idempotency-Key`, 202, no mesmo
  balde de teto da conversa):
  - só sai quando o portal mostra a ocorrência à contratante **e** alguém dela tem conta. Senão é
    409 `OCCURRENCE_CONVERSATION_PORTAL_UNAVAILABLE`, porque seria mensagem sem leitor. Ocorrência
    inexistente é 404;
  - a mensagem nasce `delivered` (a escada do canal portal é entregue → lida): gravada, já está
    no portal;
  - a mesma chave com o mesmo texto devolve o gravado sem gravar nem avisar de novo; com outro
    texto é 409.
- **Quem lê pelo portal** vem de `findContractorPortalAudience`, no `contractor-occurrence.query.ts`
  da 164 (dono da visibilidade, como na T651):
  - a contratante é o emitente da nota (T203);
  - a ocorrência tem de passar pela mesma `buildContractorVisibleOccurrenceCondition` da listagem;
  - as contas são as ligadas por `contractor_portal_bindings` com vínculo ativo.

  A conversa segue sem ler a tratativa: o contrato D4 da T504 passa.

- **Aviso** (`contractor-portal-notifier.gateway.ts`, trilho `notification.v1` como o do motorista
  na T601):
  - um aviso por conta do portal, com `dedupeKey` da mensagem e da conta;
  - modelo novo `trip.contractor-portal-message`, **só e-mail** (o portal não tem caixa de
    entrada), com a nota como único marcador e **sem o corpo**;
  - falha registrada só com `companyId` e o nome do erro, sem subir: a mensagem já está no portal;
  - o exemplo `occurrenceLabel` entrou também no `NOTIFICATION_TEMPLATE_PREVIEW_PAYLOAD` da API,
    para o envio de teste não sair com o marcador cru.
- **Lida no portal:** marcar como lida pela conta do portal leva as mensagens da transportadora
  **do canal portal** a `read`, pela política (T402), com o horário. E-mail e WhatsApp têm a lida
  deles (D7).
- **Leitura do operador:** `GET /trip-occurrences/:id/conversations` ganhou
  `contractorPortal: { available }`, e a aba Contratante mostra o campo "Mensagem pelo portal" só
  quando o canal está aberto. Sem ele, a tela segue igual à T407. O aviso "o portal ainda não
  mostra…" foi tirado de propósito: apareceria em toda ocorrência de instalação que não usa o
  portal, no caminho do e-mail, que é o principal.
- **⚠️ Divergência de produto (registrada, depende do usuário) — o link do aviso:** o RF21 pede
  "que há mensagem nova **e o link**". Nem a API nem o worker conhecem a URL do portal hoje (só o
  build dele, em `VITE_CLIENT_APP_URL`), e variável de ambiente nova é ponto de parar e perguntar.
  O aviso diz "Entre no portal de acompanhamento, em Ocorrências". **Proposta:** uma variável da
  API com a URL pública do portal (por exemplo, `CLIENT_PORTAL_URL`), passada como marcador
  `{{portalUrl}}` no modelo. Fica na lista de pendências do usuário.
- **Lacuna anterior registrada:** o comentário do `NOTIFICATION_TEMPLATE_PREVIEW_PAYLOAD` da API
  diz que um contrato "de cada lado" cobra os exemplos, mas só o do frontend existe. Na API faltam
  `documentLabel`, `occurrenceType` e `stopLabel` do modelo de e-mail da spec 079, desde antes da 183.
- **Revisão de design** (prints `prints/conversa-portal-{desktop,celular}.png`, painel):
  - o campo repete o molde da aba Motorista (rótulo, dica, botão primário à direita);
  - a mensagem entra "Entregue";
  - sem rolagem horizontal nos dois tamanhos.

  Achado corrigido: com dois canais, "Enviar à contratante" (o diálogo de e-mail) e "Enviar pelo
  portal" ficavam ambíguos. O botão do e-mail virou **"Enviar por e-mail"** (o título do diálogo
  segue "Enviar à contratante"), e os prints da T407 foram regenerados com o rótulo novo.

- **Rótulo da ocorrência:** o `describeOccurrence` do repositório do motorista virou
  `domain/occurrence-label.policy.ts` (`describeOccurrenceLabel`), usado pelos dois avisos.
- **Testes, escritos antes e vistos falhando** (módulos inexistentes; depois, a lida sem horário e o
  cliente sem a leitura inteira):
  - API `test/occurrence-conversation/contractor-portal-message.contract.ts` (no entrypoint):
    - caso de uso: grava entregue e avisa sem o corpo; 404 e os dois 409 sem gravar nem avisar;
      replay e 409; 422 antes de ler;
    - notificador: um por conta, e a falha não sobe;
    - catálogo: só e-mail, o marcador da nota, sem corpo, prefixo `trip.`;
    - rota: `{ body, channel }` estrito e 202;
  - API: o contrato da T651 cobra a lida com horário; `conversation-routes.contract.ts` ganhou
    `sendPortal` e o `contractorPortal` da leitura;
  - integração `occurrence-conversation-portal.integration.ts`, **+2 casos**:
    - tratativa interna: fechado e 409;
    - visível e com conta: aberto, envio idempotente, um aviso só, a linha `portal`/`outbound`/
      `delivered` com horário, o portal lê do lado da transportadora, e a lida leva a `read`
      mantendo o horário de entregue;
    - sem conta ligada: fechado;
  - painel `test/occurrence-conversation/conversation-client.contract.ts`: a leitura com
    `contractorPortal` (sem o campo, fechado), o envio `{ body, channel: 'portal' }` com a chave,
    e a chave com prefixo `portal-message:`;
  - smoke `test/spec-183-portal-channel.smoke.spec.ts` (**3 pass**, com os smokes das abas
    Contratante e Motorista: 12 pass):
    - sem portal, só o e-mail;
    - com portal, o envio em branco diz o que falta;
    - o envio real entra entregue, com corpo aparado, canal `portal` e a chave.
- **Rodado:**
  - API: contratos **7459 pass, 23 skip, 0 fail**; integrações do portal, da leitura e do motorista
    **8 pass**; integração completa sozinha **598 pass, 7 skip, 8 fail** (as 8 do MinIO, iguais à
    linha de base);
  - painel: **5229 + 44 pass**;
  - lint, typecheck e formatação da raiz limpos.

## T701 — Respostas rápidas por empresa e público (verde)

- **Migration aditiva** `20260925022221_company_quick_replies` (gerada por `db:generate`, com
  `snapshot.json` e `rollback.sql`):
  - a tabela `company_quick_replies` tem `audience` (`contractor` | `driver`), `body_text`,
    `position` e `active`;
  - FK para `companies` com restrict;
  - CHECKs: o público fechado, o texto aparado de 1 a 500 caracteres e a posição não negativa;
  - índice `(company_id, audience, position)`;
  - o rollback derruba a tabela e a linha do diário, conferindo que era uma só.
  - Rodado: `ENV_FILE=.env.test make migration-test` **110 pass** e `bun run db:check` limpo.
- **API** (`occurrence-conversation/…quick-replies…`):
  - o cadastro é `settings.manage`:
    - `GET /company-settings/quick-replies`;
    - `POST` (201, a nova entra no fim do público);
    - `PATCH /:id` (`text` e/ou `active`);
    - `PUT /order` (exige exatamente as respostas do público, uma vez cada; senão 422
      `QUICK_REPLY_ORDER_INVALID`, travando as linhas antes de conferir);
  - o compositor lê `GET /occurrence-quick-replies?audience=` com `occurrences.resolve`, só as
    ativas;
  - texto em branco ou acima de 500 é 422 `QUICK_REPLY_INVALID`; resposta de outra empresa é 404;
    tudo `no-store`;
  - desativar não apaga.
  - Sem auditoria, por escolha registrada: é texto de apoio que o operador ainda edita (D4), não
    configuração que muda comportamento.
- **Painel:**
  - aba **Respostas rápidas** em Configurações, registrada em `SETTINGS_PANEL_PLACEMENT`
    (cadastro da empresa, como o catálogo de tipos de ocorrência);
  - o painel `QuickRepliesSettingsPanel` é autocontido, do módulo dono (padrão
    `NfseEmissionAction`): uma lista por público, com adicionar, editar, ativar/desativar e
    subir/descer;
  - o `QuickReplyPicker` (select do design system) aparece nos três compositores (aba Motorista,
    campo do portal e diálogo de e-mail) só quando há resposta ativa daquele público. Escolher só
    **insere** o texto no rascunho, numa linha nova.
- **Testes, escritos antes e vistos falhando** (exportação e tabela inexistentes):
  - API:
    - schema e migration (`occurrence-conversation-schema/quick-replies.contract.ts`, com o
      tenant-safety por texto de fonte do repositório);
    - caso de uso e rotas (`occurrence-conversation/quick-replies.contract.ts`);
    - a lista exaustiva do separador ganhou as rotas e prova que ele não alcança nenhuma;
    - `static-migration.contract.ts` lista a migration;
  - integração `quick-replies.integration.ts` (**2 pass**, no `package.json`):
    - fim do público, ordem, ativas no compositor e a desativada que fica;
    - outra empresa com os ids na mão: 404, 422 e lista vazia;
    - o banco recusa texto acima de 500, em branco e público fora da lista;
  - painel `occurrence-conversation/quick-replies.contract.ts`:
    - o cliente pelos caminhos da API, descartando linha inválida;
    - o rascunho, subir e descer, a inserção e o filtro por público;
    - texto de fonte: a aba e os três compositores;
  - smoke `test/spec-183-quick-replies.smoke.spec.ts` (**3 pass**):
    - o cadastro adiciona no fim com o texto aparado, diz o que falta e reordena;
    - o compositor da aba Motorista insere a resposta depois do que já estava escrito.
- **Revisão de design** (`prints/respostas-rapidas-{desktop,celular,compositor}.png`):
  - o molde das outras abas de Configurações;
  - a desativada esmaecida, com o interruptor desmarcado;
  - setas das pontas desabilitadas;
  - sem rolagem horizontal.

  Nada a corrigir. O helper `company-settings-smoke.helper.ts` não é usado por nenhum smoke e tem
  o cadastro da empresa num formato antigo, que a validação de hoje recusa. O smoke desta task
  usa o fixture dos contratos (`COMPANY_SETTINGS_RESPONSE`).

- **Rodado:**
  - API: contratos **7476 pass, 23 skip, 0 fail**; integração completa sozinha **600 pass, 7 skip, 8 fail** (as 8 do MinIO,
    iguais à linha de base);
  - painel: **5236 + 44 pass**;
  - lint, typecheck e formatação da raiz limpos.
