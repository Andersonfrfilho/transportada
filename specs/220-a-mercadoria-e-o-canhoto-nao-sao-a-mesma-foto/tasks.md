# Tasks

Uma task por vez, na ordem. Teste de aceite/contrato **antes** da implementação. Task só fecha com
evidência em `evidence.md` e commit isolado.

⚠️ Arquivo de teste novo entra na **lista explícita** do `package.json` da app — senão não roda.
⚠️ Na API são **dois comandos** e nenhum cobre o outro:
`bun --env-file=../../.env.test test --timeout 120000` (contrato) e
`bun --env-file=../../.env.test run test:integration` (integração).

---

## Fase 1 — A configuração separa as duas fotos

> 🤖 Modelo: `sonnet`

- [x] T1.1 Contrato: `deliveryProofSettingsSchema` aceita `cargo` nos três modos, ausente preserva o
      gravado, inválido é 400 — `apps/api-transportada/test/delivery-proof-settings/*.contract.ts`
- [x] T1.2 Migration aditiva: coluna `cargo` (padrão `off`, CHECK) nas três tabelas —
      `apps/api-transportada/src/database/company-delivery-proof-settings.schema.ts` + migration —
      `make migration-test`
- [x] T1.3 Schema Zod e caso de uso de leitura/escrita passam a carregar `cargo` —
      `src/trips/presentation/delivery-proof-settings.schema.ts` — contrato da T1.1 verde
- [x] T1.4 [P] Contrato da cascata com `cargo` (geral → contratante → destinatário, por inteiro) —
      `apps/frontend-transportada/test/trip/delivery-proof-settings.contract.ts`
- [x] T1.5 Cascata do painel resolve `cargo` — `src/modules/trip/shared/deliveryProofSettings.service.ts`
- [x] T1.6 Tela de configuração com dois campos de foto, rótulos e texto de apoio;
      `canhotoOcrEnabled` amarrado ao do canhoto — componente + `trip.locale.json` (pt-BR **acentuado**)
- [x] T1.7 [P] Contrato: `proofFormPlan` com `cargo` (`rendersCargo`, faltantes) —
      `apps/frontend-driver/test/...`
- [x] T1.8 `proofFormPlan.service.ts` e o campo da foto da mercadoria no `DriverStopCard`
- [x] T1.9 Revisão de design (`web.md` §15): configuração comparada com os painéis vizinhos,
      contraste nos dois estados, **print ao usuário**
- [x] T1.10 `make check` + commit

## Fase 2 — O veredito alcança a foto da mercadoria

> 🤖 Modelo: `sonnet`

- [x] T2.1 Contrato: `cargo` a 800 m e 2 h atrasado → `late_and_away`; canal `office` →
      `not_required`; `cargo: 'off'` → `not_required` —
      `test/trip-delivery-proof/punctuality.contract.ts` (o caminho antigo não existia)
- [x] T2.2 Contrato: duas fotos de `cargo` guardam vereditos independentes; a segunda não altera a
      primeira (`mergeProofPunctuality` continua só para o que substitui)
- [x] T2.3 Abre o portão em `attach-delivery-proof.use-case.ts`, guiado por `settings.cargo` — e mais
      três que vieram soldadas: `cargo` sai da fusão do veredito; o segundo portão
      (`delivery-proof.schema.ts`) para de recusar `cargo` com 400; o teto de cinco passa a valer
      também para o motorista (RF08 é "por entrega", não por canal)
- [x] T2.4 `make check` + commit (mais `test:integration` da API, que o `bun test` não enxerga)

## Fase 3 — Miniatura dos três tipos

> 🤖 Modelo: `sonnet` (T3.2 é 🧠 — validar o purpose e a retenção com `opus` antes)

- [x] T3.1 Contrato: miniatura gerada no cliente sai ≤ 128 KiB, lado maior 320 px; falha na geração
      ainda produz o comprovante
- [x] T3.2 🧠 Migration **puramente aditiva**: `thumbnail_object_id` nullable em
      `trip_delivery_proofs` + FK composta `RESTRICT`/`CASCADE` + índice parcial, e o purpose
      `trip_delivery_proof_thumbnail` ampliando o CHECK de `stored_objects` — `make migration-test`.
      A miniatura nasce com `retention_until` **nulo**, igual ao original: decidido com o usuário em
      30/09/2026 (opção **a**). Não existe lote de expurgo de `delivery_proof` — pôr o purpose novo
      na lista da 161 faria aquela rotina tratar a miniatura como órfã e apagá-la deixando o
      original. A dívida fica registrada em `docs/SECURITY.md`, não fechada aqui
- [x] T3.3 Geração da miniatura no app do motorista antes de enfileirar: a porta de entrada é
      `proofPhotoReduction.service.ts` (`buildProofPhotoWithThumbnail`, encoder injetado), que reusa o
      canvas de `occurrencePhotoImage.service.ts` (`encodeImageToJpeg`); campo `thumbnail`
      **opcional** no form
- [x] T3.4 Geração no assistente de baixa em campo do escritório e na assinatura
- [x] T3.5 [P] Contrato: `readDeliveryProofs` devolve `thumbnailUrl` quando há e omite quando não
      há; o cursor de listagem **não** gera URL assinada
- [x] T3.6 `read-delivery-proof.use-case.ts` monta a URL assinada no mesmo lote (RNF01)
- [x] T3.7 `ProofImage` passa a usar a miniatura, com queda para o original quando ausente
- [x] T3.8 Contrato de integração da URL assinada — `test/integration/*.integration.ts` +
      **`test:integration`**
- [x] T3.9 `make check` + commit

## Fase 4 — O painel mostra o que colheu

> 🤖 Modelo: `sonnet`

⚠️ **A fase estava mal medida.** Ela foi escrita como se fosse só de tela, e não é: `captured_at`,
`latitude`, `longitude` e `punctuality` existem em `trip_delivery_proofs` desde a spec 159/ADR-0070,
mas `read-delivery-proof.use-case.ts` **não publica nenhuma delas** — a `DeliveryProofView` só carrega
`createdAt`, `downloadUrl`, `kind`, `lateRegistration`, `receiverDocument`, `receiverName`,
`receivedBy`, `receivedByDetail` e `thumbnailUrl`. Sem a fatia de API abaixo, as T4.2 e T4.3 não têm
o que renderizar. O `plan.md` já previa isso na §Segurança ("a distância é calculada no servidor"),
só não virou task. As T4.3a–T4.3c são a correção, abertas em 30/09/2026.

- [x] T4.1 Contrato: renderiza "quem recebeu" com o rótulo pt-BR do enumerado; comprovante antigo
      com `null` renderiza sem a linha e sem quebrar
- [x] T4.2 Contrato: hora da captura e distância legível; sem posição diz "sem localização";
      nenhuma coordenada em texto nem em URL
- [x] T4.3 Contrato: selos de pontualidade e de registro tardio por imagem
- [x] T4.3a Contrato de API: `GET .../proof` publica `capturedAt`, `punctuality` e `distanceMeters`;
      comprovante sem posição omite a distância; **nenhuma latitude/longitude no corpo** (a coordenada
      não sai do servidor — só o número derivado)
- [x] T4.3b API: `DeliveryProofRecord`, `DeliveryProofView` e `delivery-proof-read.support.ts`
      passam a carregar os três. Distância pela haversine já existente
      (`src/addresses/domain/coordinate-distance.ts`) contra a posição do **evento de entrega**
      (`trip_stop_events.latitude/longitude`), não contra o pino geocodificado da parada — é a
      referência que `classifyProofPunctuality` usa (`deliveryEventPosition`, emenda 2026-09-25 da
      ADR-0070 §4: "a foto prova o lugar da entrega registrada"). Qualquer outra referência faria o
      número na tela discordar do veredito já gravado. As duas posições já estão na mesma query —
      `listDeliveryProofs` já faz `innerJoin` em `trip_stop_events`, nenhuma junção nova
- [x] T4.3c Painel **aceita** as chaves novas antes da API servi-las
      (`DELIVERY_PROOF_OPTIONAL_KEYS`, `DeliveryProof`, `tripResponse.validation.ts`) — a lista é
      fechada e descarta o item em silêncio, defeito que a T3.7 já pegou uma vez
- [x] T4.4 `TripDeliveryProof.component.tsx` — as três leituras acima, no detalhe **e** na expansão
      por nota (que já existe). As leituras saíram para `ProofReadings.component.tsx`: o componente
      hospedeiro já tinha 251 linhas antes da spec, acima do teto de 200
- [x] T4.5 Rótulos em `trip.locale.json`, acentuados
- [x] T4.6 Revisão de design + **print ao usuário** — dois defeitos corrigidos (variante única para os
      três selos, selos colados na mesma linha) e um terceiro que saiu para commit próprio: o selo
      semântico reprovava o contraste AA no tema claro (`3a6e036e7`), defeito de design system que já
      valia para outras cinco telas.
- [x] T4.7 `make check` + commit — `EXIT=0`, 16838 passando, 0 falhando

## Fase 5 — O visualizador com próximo e anterior

> 🤖 Modelo: `sonnet`

- [x] T5.1 Contrato: ordem da galeria (canhoto → mercadoria → assinatura, na ordem da tela); uma
      imagem só não oferece os botões; as pontas param — a decisão vive em função pura
      (`deliveryProofGallery.service.ts`) porque o teste desta app não tem DOM
- [x] T5.2 `ProofGalleryDialog` — molde do `ProofImageLightbox` do app do motorista (foco preso,
      Esc, `popstate` do Android) sobre `useModalDialog` do painel, com anterior/próxima — um defeito
      corrigido na revisão: o `alt` genérico perdia a distinção canhoto ≠ mercadoria e voltou a sair
      por tipo
- [x] T5.3 Miniatura clicável; a tela cheia usa o **original**, nunca a miniatura ampliada — um
      defeito corrigido na revisão: a task nascera com um `type` cuja única razão de existir era
      escapar do contrato que proíbe guardar a URL assinada em estado
- [x] T5.4 `deliveryProof.open` (`trip.locale.json:475`) ganha consumidor — é o `aria-label` do botão
      da miniatura, então a chave ficou, não saiu
- [x] T5.5 Teste montado em `test/trip-hooks/*.contract.ts` + `bun run test:hooks` — onze testes com o
      `TripDeliveryProof` real montado: foco preso, Esc, `popstate` e a distinção dos três `alt`
      deixam de ser promessa do código e viram prova. ⚠️ Os hooks deste arquivo vivem **dentro** do
      `describe`: o `afterEach` global de `field-delivery-focus.contract.ts` limpa o `document.body`
      de todo teste do processo, e o portal morre com `removeChild` se a limpeza vier antes
- [x] T5.8 Marcador de carregamento na miniatura e na galeria, reusando `Skeleton`/`SkeletonGroup`
      do design system. Sete contratos em `test/trip-hooks/proof-image-skeleton.contract.ts`, escritos
      antes da implementação. O marcador sai quando a imagem **resolve** — carregando ou falhando —,
      porque marcador que gira para sempre mente mais do que o buraco branco que veio substituir;
      comprovante sem fonte não ganha marcador, e a galeria guarda o **id** resolvido para o aviso
      voltar ao trocar de comprovante. Na mesma task, `TripDeliveryProof.component.tsx` voltou para
      baixo do teto de 200 linhas com a extração do `ProofImage` para arquivo próprio
- [x] T5.6 Revisão de design em 375 px, 768 px e 1280 px (fullscreen em mobile) + **print**.
      ⚠️ Parcial, com os limites escritos no `evidence.md`: as três larguras reais não foram medidas
      (a janela não redimensiona neste ambiente), a imagem do comprovante devolve 503 pelo MinIO
      local e o print saiu em branco. O que a página **confirmou**: a distinção canhoto/mercadoria na
      árvore de acessibilidade e os três marcadores aparecendo e saindo, um por comprovante
- [x] T5.7 `make check` + commit. O portão reprovou na primeira passada por `format:check` sobre o
      próprio `evidence.md` — o `check` da app é eslint, e só o `format:check` da raiz pega isso.
      Verde na segunda: `EXIT=0`, sem nenhuma marca de erro no log

## Fase 6 — O canhoto ganha veredito

> 🤖 Modelo: `opus` (estado de domínio novo; T6.2 e T6.3 são o núcleo)

- [x] T6.1 🧠 Contar os canhotos existentes em produção e **decidir com o usuário**: todos viram
      `pending` ou só a partir de uma data de corte — registrar a contagem em `evidence.md`.
      Contagem de produção achada na `evidence.md` da spec 162 (21/09): **zero** objetos de
      `delivery_proof` em produção — o conjunto a preencher é vazio. **Decisão: nenhum retroativo**
      — e isso derruba a segunda metade da RF24, sem mudar linha nenhuma
- [x] T6.2 🧠 Contrato de integração: canhoto recapturado **zera** a conferência no `ON CONFLICT`
      (não herda "recusado") — `test/integration/` + **`test:integration`**.
      ⚠️ A condição que o plano pedia (mesmo `attachmentKey` preserva) é **código morto**: os dois
      canais devolvem o id gravado antes do INSERT, então toda escrita que alcança o `ON CONFLICT`
      é captura nova. O zeramento é incondicional, de uma fonte só (`canhoto-review.policy.ts`)
- [x] T6.3 🧠 Migration: estado de conferência + ator, instante, motivo, nota, número lido e origem
      da leitura — `make migration-test`.
      ⚠️ **Executada antes da T6.2, de propósito**: o Postgres da integração é construído a partir
      das migrations, não do schema TS, então sem esta a T6.2 falharia por coluna inexistente —
      fixture faltando, não comportamento faltando
- [x] T6.4 Contrato: `matched` por código de barras → `approved`; OCR com número certo →
      `pending` com sugestão; ilegível → `pending`; prazo estourado → `pending`.
      Três casos a mais do que o enunciado pedia, todos alcançáveis: nota casada **sem número
      impresso** não aprova (o banco recusaria origem sem número), `otherSelected` e
      `onTripNotSelected` ficam pendentes **com** a leitura, e as CHECK do banco viram asserção
      sobre todos os vereditos possíveis
- [x] T6.5 `canhotoReview.service.ts` no painel — orquestra os serviços existentes (zxing →
      tesseract sob `canhotoOcrEnabled`), fora do caminho de render, prazo de 20 s.
      Fechada junto com a T6.4: um commit com o vermelho registrado na `evidence.md`, porque árvore
      vermelha commitada quebra o portão de todo mundo
- [x] T6.6 Contrato: aprovação manual exige `trip.manage`, grava ator e instante, gera trilha; o
      resultado automático **nunca** sobrescreve decisão humana
- [x] T6.7 Contrato: recusa exige motivo; texto livre com CPF, CNPJ, telefone, e-mail ou CEP é
      recusado (**reusar** a guarda da spec 162, não escrever outra).
      ⚠️ **A guarda não existe**: a spec 162 (`162-limpeza-do-armazenamento`) parou no portão de
      decisão da T0 e não foi implementada — de `src/storage/` só existem o gateway e o repositório,
      sem rota de expurgo e sem validação de motivo. Escrever a guarda aqui, em `src/shared/`, de
      forma que a 162 a reuse quando for implementada — não dentro do módulo de viagens
- [x] T6.8 `PATCH .../proof/review` + caso de uso, com verificação por objeto (tenant) e trilha
      Fechada junto com a T6.6 e a T6.7, num commit só: contrato antes da implementação em todas as
      três, e árvore comitada vermelha quebraria o portão de quem vem depois
- [x] T6.9 Canhoto recusado vira pendência de recaptura para o motorista, com o motivo visível
      A pendência do motorista é `pendingProofs` de `GET /me/current-trip`, não `GET /pending-items`
      (fila do escritório). A regra saiu para `canhoto-recapture.policy.ts` — o ponto de uso é um
      `flatMap` sobre sete junções, e caso de borda provado ali custa um Postgres por caso. O painel
      não recebeu: o `driver-trip` dele é o caminho de transição da ADR-0075, já atrás desde a 193
- [x] T6.10 Contrato: **nenhum veredito** impede confirmar entrega, despachar viagem, emitir CT-e
      ou faturar (CA13)
- [x] T6.11 Revisão de design + **print ao usuário**
      A Fase 6 mexeu em uma tela só: "Fotos pendentes" do app do motorista (o painel só ganhou
      serviço, sem UI). Print por `test/spec-220-prints.smoke.spec.ts`, fora da CI. Um tema só, e
      medido: a app fixa `color-scheme: dark` e não tem `prefers-color-scheme` — os seis PNGs da
      primeira versão saíram em três pares de MD5 idêntico. Contraste do aviso medido na tela
      (composição do `color-mix` sobre o cartão): 14,18:1, e o portão morde (limiar em 20 reprova)
- [x] T6.12 `make check` + commit
      `MAKE_CHECK_EXIT=0`, dez suítes com `0 fail`. ⚠️ A notificação de saída do harness mente com
      `make check` em segundo plano: o `echo` final do subshell é que responde 0 — o veredito está
      na linha `MAKE_CHECK_EXIT=` do log, e a primeira execução tinha reprovado em `format:check`

## Fase 7 — A conferência aparece no item da nota

> 🤖 Modelo: `sonnet` (T7.1 e T7.2 são 🧠 — o contrato da leitura automática é invariante de
> segurança, desenhado com `architect` em `opus` antes de virar task)

⚠️ **A fase não é só de tela — de novo.** A Fase 6 grava o veredito e não o publica: a
`DeliveryProofView` de `read-delivery-proof.use-case.ts:61-84` não carrega nenhum campo de
conferência, e `CanhotoReviewView` (`canhoto-review.port.ts:31-40`) só existe como resposta do
`PATCH`. Sem as T7.3–T7.5 o veredito some no F5. É a mesma má medida da Fase 4 (T4.3a–T4.3c) e a
correção tem a mesma forma: contrato de API, API, painel aceitando as chaves.

⚠️ **E a leitura automática não tem porta.** `REVIEW_BODY_SCHEMA` (`canhoto-review.routes.ts:28-39`)
exclui `action: 'automatic'` de propósito, mas RF25 põe a leitura no navegador — o navegador é o
único chamador possível. `resolveAutomaticCanhotoReview` (`canhoto-review-decision.policy.ts:169`)
é código morto hoje. As T7.1 e T7.2 abrem a porta sem entregar RF26 ao cliente.

- [x] T7.1 🧠 Contrato: a rota aceita `action: 'automatic'` e o **cliente não manda o veredito**.
      O corpo carrega só o que foi lido (`readSource`, `readNumber`, `readSeries`,
      `readDocumentId`); `review` no corpo é 400. O servidor deriva: `approved` só com
      `readSource === 'barcode'`, `readDocumentId` igual ao documento da rota e `readNumber` igual
      ao `nfe_number` daquela nota — todo o resto é `pending`. RF26 vira invariante do servidor,
      que é o que o comentário de `canhoto-review.routes.ts:24-27` queria e não tinha como ter,
      porque a leitura roda no navegador — `apps/api-transportada/test/canhoto-review/*.contract.ts`
- [x] T7.2 🧠 `REVIEW_BODY_SCHEMA` e `canhoto-review-decision.policy.ts` implementam a T7.1.
      `assertReadingIsConsistent` (`:148-158`) ganha a conferência que lhe falta: o número lido
      contra o número da nota. A trilha continua **só** para a decisão humana
      (`review-canhoto-proof.use-case.ts:74`) — leitura de máquina não é ação sensível
- [x] T7.3 Contrato de API: `GET .../proof` publica `canhotoReview`, `canhotoReviewOrigin`,
      `canhotoReadSource`, `canhotoReadNumber`, `canhotoReadSeries`, `canhotoReviewReason`,
      `canhotoReviewNote`, `canhotoReviewAt` e o **nome** de quem conferiu. ⚠️ Nunca o
      `canhotoReviewByUserId` cru nem o `canhotoReadDocumentId` sem necessidade de tela.
      Comprovante antigo e `not_applicable` omitem o que não têm
- [x] T7.4 API: `DeliveryProofRecord` e `DeliveryProofView` (`read-delivery-proof.use-case.ts:16-84`)
      passam a carregar os campos da T7.3. A junção do nome de quem conferiu entra na query que
      `listDeliveryProofs` já faz, sem consulta nova — o mesmo cuidado da T4.3b
- [x] T7.5 Painel **aceita** as chaves novas antes de a API servi-las:
      `DELIVERY_PROOF_OPTIONAL_KEYS` e o guarda de `tripResponse.validation.ts:1221`, mais o tipo
      `DeliveryProof` de `deliveryProof.service.ts:24`. A lista é fechada e descarta em silêncio —
      defeito que a T3.7 pegou uma vez e a T4.3c teve de corrigir depois
- [x] T7.6 Contrato **puro**: `canhotoReviewPresentation.service.ts` mapeia veredito → tela.
      `not_applicable` não mostra nada (é o estado da assinatura, da foto da mercadoria e de todo
      comprovante anterior à spec — selo ali seria ruído na maioria da tela); `approved` por código
      de barras diz "conferido automaticamente"; `approved` por pessoa diz quem e quando; `pending`
      com `canhotoReadSource === 'ocr'` mostra o número lido e o selo **Experimental**, igual a
      `fieldDeliveryReview.service.ts:50-57`; `pending` com `barcode` mostra o número e a nota que
      ele aponta; `pending` sem leitura é "aguardando conferência"; `rejected` mostra o motivo e, só
      com `other`, a nota. Função pura porque o teste desta app não tem DOM por padrão — mesma razão
      da T5.1 — `test/trip/canhoto-review-presentation.contract.ts`
- [x] T7.7 Contrato **puro**: `canhotoReviewNote.validation.ts` espelha a guarda do servidor
      (`shared/personal-data.policy.ts:33-39`), **inclusive os dez dígitos crus** (`:38`), mais os limites
      de 20 e 500. ⚠️ É cópia, e cópia diverge: não existe `packages/` neste repo (CLAUDE.md) e a
      regra mora na API. O teste carrega os mesmos casos do contrato do servidor, para a divergência
      reprovar um teste em vez de reprovar um usuário
- [ ] T7.8 `ProofReview.component.tsx`, chamado por `ProofImage.component.tsx:80` logo depois de
      `ProofReadings`. Selo por veredito com `Badge` do design system. ⚠️ Conferir o contraste AA no
      tema claro antes de escolher a variante — a T4.6 achou o selo semântico reprovando, e o
      conserto (`3a6e036e7`) valia para outras cinco telas
- [ ] T7.9 Aprovar e recusar. Os botões só aparecem com `trip.manage`, por
      `workspace.controller.canManageTrips` (`useTripWorkspace.hook.ts:237,251`) descido como prop —
      o mesmo caminho de `TripDetail.component.tsx:387,1370,1421`. Nunca reler `permissions` no
      componente. `canhotoReviewProof` novo em `tripClient.service.ts`, no molde de
      `readDeliveryProofs` (`:1159`)
- [ ] T7.10 `CanhotoRejectDialog.component.tsx` — molde de `TripReturnReasonDialog.component.tsx`
      (`useModalDialog` + `createPortal` + `Select` sobre lista fechada + o `useEffect` de `:47-49`
      que zera a cada abertura). O texto livre aparece **só** com `outro`, com contador de 20 a 500 e
      o aviso de dado pessoal **antes do envio** (T7.7): quinhentos caracteres digitados não voltam
      ao dono com um 400 na cara. A tela **também** traduz o 400 do servidor
      (`CANHOTO_REVIEW_NOTE_PERSONAL_DATA`, `CANHOTO_REVIEW_NOTE_LENGTH`,
      `CANHOTO_REVIEW_NOTE_REQUIRED`) — a guarda do servidor é a autoridade e a do cliente vai
      envelhecer. ⚠️ **A T7.7 não tem o `REQUIRED`**: `validateCanhotoReviewNote('')` devolve
      `tooShort`, porque o servidor também mede tamanho antes de exigir presença. Campo vazio
      dizendo "mínimo de 20 caracteres" está correto e é pior de ler que "obrigatório" — se o
      diálogo quiser a segunda mensagem, ela nasce aqui, não na validação
- [ ] T7.11 O que a tela faz com 200 e com 409. `unchanged`
      (`canhoto-review-decision.policy.ts:128`) volta 200 com a mesma view: é o clique duplo e a
      repetição, aceita em silêncio, só escreve no cache. `CANHOTO_REVIEW_ALREADY_RESOLVED` volta
      409: a tela **não insiste e não sobrescreve** — diz que outra pessoa já conferiu e refaz
      `deliveryProofsQuery`, para o operador ver o veredito que venceu. O caminho de volta de um
      veredito errado é a recaptura, por decisão da Fase 6 (`:111`)
- [ ] T7.12 Contrato DOM: `TripDeliveryProof` montado — selo por veredito nos quatro estados, botões
      ausentes sem `trip.manage`, o diálogo de recusa (foco preso, Esc, campo livre só com `outro`),
      409 virando aviso mais refetch — `test/trip-hooks/canhoto-review-panel.contract.ts` +
      `bun run test:hooks`. ⚠️ Os hooks deste arquivo vivem **dentro** do `describe`: o `afterEach`
      global de `field-delivery-focus.contract.ts` limpa o `document.body` de todo teste do processo
      (T5.5)
- [ ] T7.13 Contrato DOM: `useCanhotoReview.hook.ts` — dispara **uma vez** por comprovante, não
      redispara em re-render, não redispara em comprovante que já tem leitura
      (`canhotoReadSource !== null`), espera a chave de acesso, e respeita os 20 s com relógio falso
      — `test/trip-hooks/canhoto-review-trigger.contract.ts`
- [ ] T7.14 `useCanhotoReview.hook.ts` montado em `TripDeliveryProofLoader`
      (`TripDetail.component.tsx:1402`). Dispara **sozinho ao abrir o item**, não por botão: RF30 diz
      que isto é conferência e não portão, e um botão a transformaria em trabalho; e "o comprovante
      aparece primeiro, o veredito chega depois" (RNF02) descreve algo que chega, não algo que se
      pede. Só para `kind === 'photo'`, só com `canhotoReview === 'pending'` e
      `canhotoReadSource === null`. **Não relê a cada abertura**: os bytes são imutáveis (recaptura
      cria linha nova e zera a conferência — T6.2), os motores são os mesmos, e o `pending` que já
      carrega leitura é exatamente o estado que diz "a máquina tentou, agora é com gente"; reler
      ainda apagaria a sugestão que o operador está olhando. ⚠️ `useEffect` é o certo **aqui**, e a
      razão é a regra, não a exceção: a leitura é sincronização com sistema externo — busca na rede
      ao bucket, decodificação zxing, WebWorker do tesseract, temporizador de 20 s e um PATCH. Não é
      transformação de dado.
      ⚠️ **`CanhotoReviewOutcome` ainda carrega `review`** (`canhotoReview.service.ts:34,74,87`), e
      depois da T7.2 a rota é `.strict()`: mandar `review` no corpo do `automatic` é **400**, não
      campo ignorado. O `review` do cliente deixa de ir para a rede — ou vira estado só de sessão
      (a frase "não foi possível conferir automaticamente" da T7.16), ou sai do tipo. Quem esquecer
      isso vê 100% das leituras automáticas falharem com 400, e o sintoma é "tudo pendente" —
      indistinguível do bug que a Fase 7 veio consertar
- [ ] T7.15 A imagem para a leitura: `fetch(downloadUrl)` → `blob` → `createImageBitmap` → canvas →
      `getImageData`, no molde de `fieldDeliveryCapture.service.ts:56-74`. ⚠️ **Nunca** reusar o
      `<img>` de `ProofImage.component.tsx:49-56`: ele não tem `crossOrigin`, e o canvas que o
      desenhar fica contaminado — `getImageData` lança `SecurityError`, o `catch` genérico de
      `decodeBarcodeFrame` (`barcodeDecoder.service.ts:27-33`) engole a exceção, e isso vira
      "ilegível" silencioso em 100% dos canhotos. ⚠️ **Nunca** a miniatura: 320 px / 128 KiB (RNF04)
      não sustentam um Code-128 de 44 posições; é a mesma decisão que RF22 já tomou para a tela
      cheia. O `connect-src` já carrega a origem do bucket
      (`contentSecurityPolicy.service.ts:113-124`, spec 183 T702b) — **medir** que o bucket responde
      CORS no GET e registrar em `evidence.md`
- [ ] T7.16 O prazo de 20 s cobre **tudo**. Hoje `CANHOTO_REVIEW_TIMEOUT_MS`
      (`canhotoReview.service.ts:28`) só envolve a perna do OCR (`:140`) e não conta a busca da
      imagem nem a decodificação; e `canhotoOcrEngine` ainda tem os seus próprios 15 s
      (`CANHOTO_OCR_TIMEOUT_MS`, `:53`). RNF02 diz "prazo **total** de 20 s". Estourou: fica
      `pending` e a tela diz "não foi possível conferir automaticamente". ⚠️ Essa frase é **de
      sessão**, não persistida: o banco não distingue "estourou" de "nunca leu" (os dois são
      `canhotoReadSource === null`), e inventar um quinto valor contradiria a lista fechada de quatro
      da RF24. Depois do F5 a tela volta a dizer "aguardando conferência". Perda consciente, escrita
      em `evidence.md`
- [ ] T7.17 A chave de acesso antes da leitura. `reviewCanhoto` casa pela chave inteira, e
      `GET /trips/:id` não a traz: ela vem de `useFieldDeliveryDocumentsQuery`
      (`useFieldDeliveryDocuments.query.ts`), hoje `enabled` só com o assistente do escritório aberto
      (`TripDetail.component.tsx:1162-1177`). O hook **espera** essa consulta antes de ler, ou a
      perna do código de barras degrada para número/série e `matched` nunca acontece — que é a única
      porta de aprovação automática da RF26. A montagem do `CanhotoReviewTripDocument` reusa o `map`
      de `:1162-1177`, não escreve outro
- [ ] T7.18 Rótulos em `trip.locale.json` **e** `trip.en.locale.json`, acentuados no pt-BR, e a
      correção do que a revisão achou: `deliveryProof.imageLoading` existe no pt-BR
      (`trip.locale.json:471`) e **falta** no inglês (entre `galleryPrevious:364` e
      `lateRegistration:365`). ⚠️ Nada nos textos pode sugerir que o veredito trava entrega, viagem,
      CT-e ou fatura (RF30): "aguardando conferência", nunca "bloqueado"; "recusado", nunca "entrega
      inválida"
- [ ] T7.19 Revisão de design (`web.md` §15) em 375 px, 768 px e 1280 px, com **print ao usuário**.
      ⚠️ A T5.6 registrou dois limites deste ambiente: a janela não redimensiona e o MinIO local
      devolve 503 na imagem do comprovante. Se reaparecerem, registrar como a T5.6 registrou, em vez
      de marcar verde
- [ ] T7.20 `make check` + commit. Na API os **dois** comandos, porque a T7.4 toca a leitura:
      `bun --env-file=../../.env.test test --timeout 120000` e
      `bun --env-file=../../.env.test run test:integration`. ⚠️ O veredito do `make check` em segundo
      plano está na linha `MAKE_CHECK_EXIT=`, não na notificação do harness (T6.12)

**O que sobe, e só isto (RNF03):** `action: 'automatic'`, `readSource`, `readNumber`, `readSeries`,
`readDocumentId`. Nunca: a imagem, o blob, o `ImageData`, o vetor `luminance`, as palavras/grade/
confiança do tesseract, as caixas do OCR, e **nem o texto cru do código de barras** — a chave de
acesso de 44 posições é dado fiscal, não tem coluna, e não pode viajar de carona. Sob a T7.1,
`review` também não sobe.

---

## Prompt de execução

```text
/oh-my-claudecode:autopilot Trabalhe no worktree
/Users/anderson.filho/Documents/personal/transportada-wt/comprovante-duas-fotos (branch
work/comprovante-duas-fotos) — a spec não existe no checkout principal. Execute a spec
specs/220-a-mercadoria-e-o-canhoto-nao-sao-a-mesma-foto/ (leia spec.md, plan.md e tasks.md antes
de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fases 1, 2, 3, 4 e 5 → executor model=sonnet · Fase 6 → opus ·
T3.2, T6.1, T6.2 e T6.3 🧠 → validar com architect em opus antes de implementar ·
revisão final → code-reviewer model=opus.
Teste de contrato ANTES da implementação em toda task. Cada task fecha com typecheck + testes +
commit isolado, evidência em evidence.md. Na API rode os DOIS comandos quando a task tocar
test/integration/**: `bun --env-file=../../.env.test test --timeout 120000` e
`bun --env-file=../../.env.test run test:integration`. Arquivo de teste novo entra na lista
explícita do package.json da app. Fase que toca banco fecha com `make migration-test`.
Toda fase que toca a tela fecha com revisão de design e print ao usuário (web.md §15).
Pare e pergunte antes de: deploy, migration destrutiva, a decisão de preenchimento retroativo da
T6.1, qualquer [NEEDS CLARIFICATION].
```
