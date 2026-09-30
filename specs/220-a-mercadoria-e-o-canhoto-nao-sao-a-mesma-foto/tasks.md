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
- [ ] T6.6 Contrato: aprovação manual exige `trip.manage`, grava ator e instante, gera trilha; o
      resultado automático **nunca** sobrescreve decisão humana
- [ ] T6.7 Contrato: recusa exige motivo; texto livre com CPF, CNPJ, telefone, e-mail ou CEP é
      recusado (**reusar** a guarda da spec 162, não escrever outra).
      ⚠️ **A guarda não existe**: a spec 162 (`162-limpeza-do-armazenamento`) parou no portão de
      decisão da T0 e não foi implementada — de `src/storage/` só existem o gateway e o repositório,
      sem rota de expurgo e sem validação de motivo. Escrever a guarda aqui, em `src/shared/`, de
      forma que a 162 a reuse quando for implementada — não dentro do módulo de viagens
- [ ] T6.8 `PATCH .../proof/review` + caso de uso, com verificação por objeto (tenant) e trilha
- [ ] T6.9 Canhoto recusado vira pendência de recaptura para o motorista, com o motivo visível
- [ ] T6.10 Contrato: **nenhum veredito** impede confirmar entrega, despachar viagem, emitir CT-e
      ou faturar (CA13)
- [ ] T6.11 Revisão de design + **print ao usuário**
- [ ] T6.12 `make check` + commit

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
