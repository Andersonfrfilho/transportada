# Plano — Feature 182

## O que já existe, e por isso não entra no plano

| Peça                                                       | Onde                                                  | Situação                |
| ---------------------------------------------------------- | ----------------------------------------------------- | ----------------------- |
| `kind: 'photo' \| 'signature'`                             | `database/trip.schema.ts:1359`                        | pronta, com `check`     |
| Rota multipart com `kind`, `attachmentKey`, geolocalização | `trips/presentation/delivery-proof.schema.ts`         | pronta                  |
| Caso de uso de anexar comprovante                          | `trips/application/attach-delivery-proof.use-case.ts` | pronto                  |
| Assinatura em canvas com queda para foto                   | `driver-trip/components/SignaturePad.component.tsx`   | pronta, no lugar errado |
| Separação `photos` / `signatures` na exibição              | `trip/shared/deliveryProof.service.ts:59`             | pronta                  |
| Campos exigíveis por empresa                               | painel de comprovante, ADR-0057 §3                    | pronto                  |

O trabalho é **de tela e de um valor novo de enumeração**. Não há endpoint novo, nem tabela nova.

## Camadas tocadas

1. **Banco** — `TRIP_DELIVERY_PROOF_KINDS` ganha `'cargo'`; migration aditiva recriando o `check`,
   com `rollback.sql`. Nenhuma linha existente muda de valor.
2. **API** — o `kind` novo passa a ser aceito pela mesma rota. A validação é a constante; o caso de
   uso não distingue o valor, só o persiste. Contrato de resposta ganha `cargo` na lista de tipos.
3. **Frontend, compartilhado** — `SignaturePad` e `signatureCapture.service` saem de `driver-trip`
   para `src/components/ui/` (o pad é primitivo de entrada) e `src/modules/shared/`. O app do
   motorista passa a importar de lá; comportamento dele não muda.
4. **Frontend, assistente** — passo de assinatura (opcional, com "pular") e "adicionar foto da
   carga" no passo de captura. O envio monta uma chamada por anexo, com `attachmentKey` derivado
   como o canhoto já faz.
5. **Frontend, comprovante** — `TripDeliveryProof` ganha o grupo de fotos de carga, separado.

## Riscos

- **O `check` do banco é o ponto de falha.** Migration que recria constraint sem `IF EXISTS` quebra
  em ambiente que já rodou parte dela. O `make migration-test` é o gate, não a leitura.
- **Mover o `SignaturePad` mexe no app do motorista**, que é o caminho crítico da rua. A garantia é
  o contrato `test/driver-trip/signature.contract.ts`, que checa o arquivo por caminho — ele
  **quebra ao mover** e precisa ser atualizado junto, não depois.
- **Uma chamada por anexo multiplica requisição**: cinco notas com canhoto, assinatura e duas fotos
  são vinte envios. O envio já é sequencial por nota e já mostra progresso; manter assim, sem
  paralelizar, porque a rede do balcão é o gargalo e o retry por nota depende da ordem.

## Modelo por fase

| Fase                       | Modelo    | Por quê                                                                |
| -------------------------- | --------- | ---------------------------------------------------------------------- |
| 1 — banco e API            | `sonnet`  | migration aditiva e constante; critério verificável por teste          |
| 2 — mover o `SignaturePad` | 🧠 `opus` | mexe no caminho crítico do motorista; decisão de onde o primitivo mora |
| 3 — assistente             | `sonnet`  | passo novo com o molde dos passos que já existem                       |
| 4 — comprovante            | `haiku`   | grupo a mais numa tela que já agrupa                                   |
| 5 — revisão de design      | 🧠 `opus` | fecha com print em 375px e 1280, claro e escuro                        |
