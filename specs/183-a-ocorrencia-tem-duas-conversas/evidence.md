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
