# T15 — frontend (revisão do escritório da baixa)

Escopo: `apps/frontend-transportada/**` apenas. A API foi corrigida em paralelo pelo agente
`t15-api` no mesmo worktree (`t15-api-evidence.md`); este arquivo cobre só a metade do frontend.

## Commits (ordem cronológica, todos em `work/spec-156`)

1. `766d47f4` — A3: `tesseract.js` 7 desliga `blocks` por padrão; corrigido
   (`recognize(image, {}, { blocks: true })`) com prova de **motor real** via Playwright/Chromium
   (`scripts/canhoto-ocr-engine.probe.ts`, `bun run scripts/canhoto-ocr-engine.probe.ts`). Também:
   rótulo do número exige `N` maiúsculo (a preposição "no" não aciona mais o casamento), considera
   todas as ocorrências do rótulo no texto, termina o worker em qualquer falha (não só sucesso), e
   a identificação por chave aceita CNPJ alfanumérico do emitente (NT 2024.002/IN RFB 2229/2024)
   ignorando notas liberadas na contagem de ambiguidade.
2. `c056c1b4` — A4a/A4b/A4c/A4d/M13g: `AbortController` cancela o lote ao fechar o assistente
   durante o envio (resposta atrasada não ressuscita status); `resolveFieldDeliveryDeliveredAtIso`
   blinda o passo de conferência contra `new Date('').toISOString()`; a captura do canhoto desenha
   a fonte **uma única vez** (identificação, JPEG e OCR derivam do mesmo canvas, nunca de instantes
   diferentes do `<video>`); baixa/ocorrência em massa enviam só as notas com a capacidade
   (`selectFieldActionableDocumentIds`), avisando quantas ficaram de fora, e ids desconhecidos são
   ignorados (não recusam o lote inteiro).
3. `80a5d527` — M7: foto do canhoto cai de qualidade em degraus (0.85→0.5) até caber em ~900 KB
   (antes, qualidade fixa); foto da ocorrência de campo ganhou a mesma redução (antes ia crua, sem
   teto nem remoção de EXIF).
4. `453b8548` — M13a/M13b/M13h: só falha transitória (rede/5xx/429) oferece "tentar de novo" — o
   status HTTP passa a viajar com o erro (`readTripRequestErrorStatus`); "Pular" depois de "Voltar"
   para uma nota já confirmada descarta o rascunho antigo; fechar o diálogo de ocorrência em massa
   renova a `Idempotency-Key` do lote.
5. `db3fbe68` — Baixos/M13f: máscara de CPF/CNPJ no campo "Documento do recebedor"; tipo de retorno
   explícito em `useFieldDeliverySettingsQuery`; Enter no passo de captura respeita o foco num botão
   (`shouldTriggerCaptureShortcut`) — antes disputava com o clique nativo de "Pular".
6. `4722b50a` — M13c: sem a chave de acesso carregada (`field-delivery-documents` pendente/erro), o
   casamento por número/série cai no manual em vez de arriscar `matched`; chave inteira continua
   decidindo sozinha em qualquer caso.
7. `5471cfa5` — M13d: teto de 15s na leitura do canhoto (`raceAgainstTimeout`) — worker preso não
   trava mais "Capturar"/"Pular" para sempre.
8. `3e10c891` — M13e: falha de captura (canvas indisponível, encode, arquivo ilegível) vira aviso na
   tela em vez de rejeição não tratada.
9. `0eb8eb6d` — Design: "nota(s)"/"document(s)" convertidos para plural real do i18next (`_other`)
   nas telas de ações em massa da viagem.
10. `a5ed4a3f` — Design: borda cobre do painel de ações de campo alinhada ao cinza do painel que o
    envolve; textarea "Observação" ganhou os tokens de campo (saía com fundo default do navegador);
    contraste do texto de autoria na linha do tempo igualado ao mesmo texto em `TripOccurrences`.
11. `f7300976` — Pós-correção da API: locale (pt/en) + classificação terminal vs reenviável para os
    códigos novos (`ARRIVED_AT_*`, `RETURNED_AT_*`, `TRIP_DELIVERY_PROOF_RECEIVER_NAME_REQUIRED`,
    `TRIP_DELIVERY_PROOF_ALREADY_CAPTURED`, `TRIP_STATUS_WRITE_CONFLICT` — reenviável mesmo sendo
    409, único código que muda a decisão por status —, `TRIP_DELIVERY_PROOF_TOO_LARGE`,
    `TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE`); `POST .../arrive` aceita `arrivedAt` opcional —
    `TripArrivalDialog` novo ("Chegou em", padrão agora, mesma janela de "Entregue em").

## O que ficou de fora (registrado, não pendência escondida)

- **M12 (extrair o bloco de baixa/ocorrência de `TripDetail.component.tsx` para
  componente/hook próprio)**: não feito. `TripDetail.component.tsx` continua com ~1020 linhas. A
  extração é real (estado de `fieldOccurrenceDocumentIds`/`fieldDeliveryDocumentIds`, as duas
  queries de T14, `useFieldDelivery`, e os dois componentes `FieldOccurrenceDialog`/
  `FieldDeliveryWizard` formam um bloco coeso), mas o tempo desta sessão não deu para fazer com a
  segurança que o resto da task teve (sem app rodando, a única rede de proteção real é a suíte —
  e um refactor deste tamanho num componente sem suíte de render própria pede revisão visual, que
  não foi possível aqui). Fica para a T16.
- **Revisão de design (web.md §15) sem print contra a aplicação real**: Docker (Postgres, Keycloak,
  RabbitMQ, MinIO) indisponível nesta sessão — mesma limitação que a T14 registrou. As três
  correções de CSS (borda, textarea, contraste) foram conferidas lendo os tokens e comparando com o
  primitivo irmão (`.panel`, `.hint`) linha a linha, não com um print. Pendência explícita para a
  T16, que já cobre a tela inteira com Docker disponível.
- **Algoritmo de dígito verificador para CNPJ alfanumérico** (`canhotoIdentification.service.ts`):
  implementado por leitura do NT 2024.002 (ASCII do caractere menos o de `'0'`), sem uma chave real
  de nota fiscal com CNPJ alfanumérico para conferir contra. Baixo risco — é o mesmo `charValue` que
  já existia, sem mudança de lógica — mas vale checagem cruzada com o `fiscal-provider` quando o
  primeiro CNPJ alfanumérico de verdade passar por um canhoto.
- **Teste de render para `FieldDeliveryCaptureStep`/`FieldOccurrenceDialog`**: não existe suíte de
  DOM para componentes de `trip` fora de hooks (`test/trip-hooks/*`, que não renderiza árvore
  completa) — o catch de M13e e o `shouldTriggerCaptureShortcut` de M13f foram verificados por
  leitura de código + (o segundo) um teste unitário isolado com `document.createElement`, não por
  render do componente inteiro.
- **`batchReturnPartialFailure`** (`"{{failed}} de {{total}} nota(s) não foram devolvidas"`) não
  entrou na conversão de plural do achado de design — a concordância depende de dois números
  (`failed`/`total`) e do verbo, não só de `count`; corrigir bem pede tocar o call site
  (`TripDetail.component.tsx`), não só o locale. Registrado, não corrigido.

## Gates (2026-09-18, ao fim da T15 frontend)

| Gate                       | Comando                                            | Resultado                                                                       |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| typecheck                  | `bunx tsc --noEmit` (`apps/frontend-transportada`) | exit 0                                                                          |
| lint                       | `bun run lint` (`apps/frontend-transportada`)      | exit 0, `eslint .` sem achados                                                  |
| testes                     | `bun run test` (`apps/frontend-transportada`)      | `4649 pass, 0 fail` (suíte principal) + `25 pass, 0 fail` (`test:hooks`)        |
| build                      | `bun run build` (`apps/frontend-transportada`)     | exit 0, PWA gerado (136 entradas de precache)                                   |
| sonda do motor real de OCR | `bun run scripts/canhoto-ocr-engine.probe.ts`      | `PROBE_OK` — motor real leu palavras não vazias e extraiu `000123456`/série `1` |

Smoke Playwright (`bun run smoke`) **não rodou nesta sessão** — precisa da API e do frontend de pé
(`webServer` do `playwright.config.ts`), e o Docker (Postgres/Keycloak/RabbitMQ/MinIO) estava
indisponível, mesma limitação que a T14 e a T13 já registraram (memória do projeto:
"Banco de teste local quebrado").

## Arquivos tocados (frontend, novos e existentes)

Novos: `scripts/canhoto-ocr-engine.probe.ts`, `src/modules/trip/components/TripArrivalDialog.component.tsx`,
`src/modules/trip/shared/tripArrivalValidation.service.ts`, `test/trip/canhoto-ocr-engine.contract.ts`,
`test/trip/trip-arrival-validation.contract.ts`, `test/trip-hooks/field-delivery-capture-shortcut.contract.ts`.

Tocados: `src/modules/trip/shared/{canhotoOcr,canhotoOcrEngine,canhotoIdentification,
fieldDeliveryCapture,fieldDeliveryImage,fieldDeliveryValidation,fieldDeliverySend,fieldDeliveryWizard,
tripFieldActions,tripClient,trip.constant,trip.types}.service.ts`,
`src/modules/trip/hooks/{useFieldDelivery,useTripWorkspace}.hook.ts`,
`src/modules/trip/queries/useFieldDeliverySettings.query.ts`,
`src/modules/trip/components/{FieldDeliveryReviewStep,FieldDeliveryCaptureStep,FieldDeliverySendStep,
FieldDeliveryWizard,TripDetail,TripStateActions,TripFieldActions}.component.tsx`,
`src/modules/trip/locales/{trip,trip.en}.locale.json`,
`src/modules/trip/styles/{trip,tripTimeline}.module.css`, testes correspondentes em `test/trip/*` e
`test/trip-hooks/*` (ver commits acima para a lista exata por grupo).
