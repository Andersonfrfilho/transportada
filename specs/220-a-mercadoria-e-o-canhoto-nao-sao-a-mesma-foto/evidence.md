# Evidência

Uma entrada por task, com o comando rodado e a saída relevante. Task sem entrada aqui não está
fechada.

## Levantamento anterior à spec

Três explorações escopadas por app, em 29/09/2026, sobre o worktree `comprovante-duas-fotos`. O que
elas mediram e que sustenta as decisões da spec:

- **Configuração** — as três tabelas (`company_delivery_proof_settings`,
  `delivery_proof_setting_overrides`, `delivery_proof_setting_contractor_overrides`) têm um único
  campo `photo`; nenhuma tem `cargo`. `proofFormPlan.service.ts:49` do app do motorista conhece só
  `fields.photo`.
- **Pontualidade** — `trip_delivery_proofs` grava `latitude`, `longitude`, `accuracy_meters` e
  `captured_at` por linha para **todo** `kind`, inclusive `cargo` (`trip.schema.ts:1607-1613`), mas
  `attach-delivery-proof.use-case.ts:323` devolve `not_required` para tudo que não é `photo`.
- **Exibição** — o comprovante já abre **por nota** (`TripStopList.component.tsx:769-802`);
  `receivedBy`/`receivedByDetail` chegam da API desde a spec 193 e **nenhum componente os
  renderiza**; `ProofImage` (`TripDeliveryProof.component.tsx:135-139`) é uma `<img>` sem clique.
- **Miniatura** — não existe para comprovante em lugar nenhum: nem coluna no banco, nem
  `thumbnailUrl` na resposta, nem campo no tipo do painel. A spec 213, apesar do nome, é inteira
  sobre `frontend-driver` e usa `blob:` local da fila offline.
- **Próximo/anterior** — não existe em nenhuma tela do produto.
- **Chave órfã** — `deliveryProof.open` = "Abrir em tamanho real" em `trip.locale.json:466`, sem
  nenhum consumidor.
- **Conferência do canhoto** — a leitura existe e funciona (`barcodeDecoder.service.ts` com zxing,
  `canhotoOcrEngine.service.ts` com tesseract, casamento em `canhotoIdentification.service.ts` e
  `canhotoOcr.service.ts`), mas **só no assistente de baixa em campo do escritório** e só como
  sugestão no instante da criação — nada é gravado. O app do motorista não tem leitura nenhuma
  (`nenhum ocr em apps/frontend-driver/src`, confirmado pela spec 212). **Não existe estado de
  aprovado/pendente/recusado** em nenhuma tabela do domínio.
- **Qualidade de imagem** — só tamanho de arquivo, formato e magic bytes. Nitidez, foco e
  iluminação não são medidos em lugar nenhum; os códigos `blurry`/`tooDark`/… da ADR-0078 estão
  como **proposta**, sem implementação.

## Fase 1

## Fase 2

## Fase 3

## Fase 4

## Fase 5

## Fase 6
