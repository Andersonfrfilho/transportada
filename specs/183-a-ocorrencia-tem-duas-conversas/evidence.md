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
