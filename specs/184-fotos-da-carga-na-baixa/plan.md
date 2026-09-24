# Plano — Feature 184

## O que já existe

| Peça                                                                   | Onde                                                       | Uso nesta spec                         |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| Rota do escritório que anexa comprovante a entrega feita               | `trip-field-office-document.routes.ts`, `createProofRoute` | ganha `kind` opcional                  |
| Persistência do canhoto do escritório, com idempotência e substituição | `office-delivery-proof.service.ts`, `persistOfficeProof`   | ganha o ramo `cargo`, que soma         |
| Teto de 960 KiB e checagem de cabeçalho                                | `assertOfficeUploadAccepted`                               | vale igual para `cargo`                |
| Captura câmera → upload do canhoto                                     | `FieldDeliveryCaptureStep`                                 | reusada para "adicionar foto da carga" |
| Agrupamento `photos` / `signatures`                                    | `deliveryProof.service.ts:59`                              | ganha `cargo`                          |

Não há rota nova nem tabela nova. Há **uma migration**, que só relaxa regra.

## Camadas

1. **Banco** — `TRIP_DELIVERY_PROOF_KINDS` ganha `'cargo'`. Migration aditiva:
   - recria `trip_delivery_proofs_kind_check` com os três valores;
   - troca a constraint `trip_delivery_proofs_company_event_kind_unique` por índice único parcial
     `where kind <> 'cargo'` (o Drizzle expressa com `uniqueIndex(...).where(...)`);
   - `rollback.sql` recria o `check` e a unicidade total e **falha** se houver linha `cargo` ou
     duas fotos de carga no mesmo evento — nunca apaga dado.
2. **API** — `parseOfficeFieldProofRequest` aceita `kind` em `photo | cargo` (padrão `photo`; recusa
   `signature` no canal `office`, ADR-0067 §5). `persistOfficeProof` ganha o ramo `cargo`: sem
   `findProofForEvent`/substituição, sem nome e documento, com contagem de `cargo` do evento e 422
   `TRIP_DELIVERY_PROOF_CARGO_LIMIT` a partir da sexta. Erro de domínio novo em `*.error.ts`, código
   em `shared/errors/codes.ts`.
3. **Frontend, assistente** — "adicionar foto da carga" no passo de captura, até cinco, com
   miniatura e remover. O envio de cada foto vai depois da baixa da nota, uma chamada por foto,
   sequencial, com `attachmentKey` derivado como o do canhoto.
4. **Frontend, comprovante** — `deliveryProof.service` separa `cargo`; `TripDeliveryProof` mostra o
   grupo com rótulo próprio.

## Riscos

- **Trocar a constraint única é o ponto delicado.** O `ON CONFLICT` que hoje substitui o canhoto do
  escritório pode depender do nome da constraint. Conferir cada `onConflict` sobre
  `trip_delivery_proofs` antes de trocar — com índice parcial, o `ON CONFLICT` precisa repetir o
  predicado (`where kind <> 'cargo'`), ou o Postgres não acha o árbitro e a substituição quebra em
  produção. **É o teste do CA02 que pega isso.**
- **Postgres da CI ≠ Postgres local**: a mensagem e o SQLSTATE de violação podem variar de versão;
  teste que olha código de erro aceita os dois.
- **Cinco uploads por nota multiplicam requisição.** Envio sequencial, como a baixa já faz, porque
  a rede do balcão é o gargalo e o reenvio depende da ordem.

## Modelo por fase

| Fase                  | Modelo    | Por quê                                                                                       |
| --------------------- | --------- | --------------------------------------------------------------------------------------------- |
| 1 — banco             | 🧠 `opus` | troca de constraint única com `ON CONFLICT` dependente — erro aqui quebra a baixa em produção |
| 2 — API               | `sonnet`  | ramo novo num serviço com molde claro                                                         |
| 3 — assistente        | `sonnet`  | reuso do passo de captura                                                                     |
| 4 — comprovante       | `haiku`   | um grupo a mais numa tela que já agrupa                                                       |
| 5 — revisão de design | 🧠 `opus` | print em 375px e 1280, claro e escuro                                                         |
