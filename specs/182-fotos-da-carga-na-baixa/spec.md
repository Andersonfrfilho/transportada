# Feature 182 — A baixa do escritório registra a carga, não só o canhoto

## Problema e resultado

Desde a spec 181 a entrega tem **um caminho só**: "Marcar entregue" saiu da linha da nota, e quem
dá baixa passa pelo assistente, que fotografa o canhoto. Foi a decisão certa — o atalho descartava
prova e era o botão de mais destaque —, mas deixou o assistente como único coletor de prova de
entrega, e ele guarda uma imagem só: o canhoto.

A avaria que o motorista contou na volta, o pallet rompido, a mercadoria deixada na portaria —
nada disso tem onde entrar. Quando o contratante cobra, a transportadora tem o papel assinado e
nenhuma imagem do que foi entregue.

Duas travas no código, conferidas:

1. **`kind` só conhece `photo` e `signature`** (`trip.schema.ts:1359`), e no canal `office` é
   sempre `photo` (`office-delivery-proof.service.ts:30`). Não há como dizer "esta imagem é da
   carga, não o canhoto".
2. **`unique(company, stop_event, kind)`** — "um comprovante de cada tipo por entrega: o segundo é
   correção, e correção substitui" (`trip.schema.ts:1482`). Certo para o canhoto; errado para a
   carga, em que a segunda foto **soma**.

Resultado: **o escritório anexa de zero a cinco fotos da carga a cada entrega**, separadas do
canhoto, e a tela de comprovante mostra as duas coisas em grupos distintos.

## A assinatura não entra — e por quê

O pedido original incluía assinatura opcional. **Ela não entra**, por decisão confirmada pelo
usuário em 2026-09-24, mantendo a ADR-0067 §5: o escritório dá baixa dias depois, com o maço de
canhotos na mesa, e **o recebedor não está lá**. Uma assinatura colhida no balcão seria o operador
assinando pelo cliente. No escritório, a assinatura é a **imagem do canhoto assinado**, mais o nome
de quem recebeu — exatamente o que o assistente já faz. A assinatura digital continua existindo
onde o recebedor está: no app do motorista.

## Fora do escopo

- **Assinatura no escritório** — ver a seção acima.
- **Foto de carga pelo app do motorista.** O banco passa a aceitar, mas a tela do motorista não
  muda nesta spec.
- **OCR ou leitura de qualquer natureza sobre a foto de carga.** É registro visual, não fonte de
  dado.
- **Exigir foto de carga por configuração da empresa.** Ela é opcional; tornar exigível é spec
  própria, no painel de comprovante.
- **Retenção e expurgo de imagem** — segue a política que o comprovante já tem.

## Requisitos funcionais

- **RF1** — `TRIP_DELIVERY_PROOF_KINDS` passa a `'photo' | 'signature' | 'cargo'`.
- **RF2** — A unicidade `(company, stop_event, kind)` deixa de valer para `cargo`: o canhoto e a
  assinatura continuam "o segundo substitui"; a foto de carga soma.
- **RF3** — A rota do escritório que anexa comprovante a uma entrega feita aceita `kind` opcional,
  `photo` (padrão, comportamento de hoje) ou `cargo`.
- **RF4** — Com `kind: cargo`: não substitui nada, não leva nome nem documento do recebedor, e
  recusa a sexta foto da mesma entrega com 422 `TRIP_DELIVERY_PROOF_CARGO_LIMIT`.
- **RF5** — A foto de carga tem o mesmo teto de bytes (960 KiB, `OFFICE_PROOF_MAX_BYTES`) e a mesma
  checagem de cabeçalho de imagem (JPEG, PNG ou WebP) que o canhoto do escritório — sem exceção.
- **RF6** — Idempotência por `attachmentKey`, como o canhoto: reenviar o mesmo arquivo da mesma
  entrega devolve o comprovante já gravado.
- **RF7** — O assistente de baixa oferece, no passo de revisão, "adicionar foto da carga" — câmera
  no celular, arquivo no computador —, até cinco por nota, com a mesma redução de imagem do canhoto.
- **RF8** — A tela de comprovante (`TripDeliveryProof`) mostra as fotos de carga em grupo próprio,
  separado do canhoto e da assinatura.

## Requisitos não funcionais

- **RNF1** — Nenhuma imagem sai do bucket privado; a entrega continua por URL assinada de vida curta.
- **RNF2** — Nome e documento do recebedor nunca vão para log — e a foto de carga nem os carrega.
- **RNF3** — O assistente continua operável em 375px, sem rolagem horizontal.

## Decisões

- **D1** — `cargo` é `kind` próprio, não `photo` com uma marca: o `check` e o índice falam de
  `kind`, e é por ele que a tela agrupa.
- **D2** — A unicidade vira **índice único parcial** `where kind <> 'cargo'`. Relaxa a regra sem
  apagar linha; o `rollback.sql` recria o índice total e **falha**, sem apagar nada, se já houver
  **qualquer** foto de carga — o `check` antigo recusaria a linha de qualquer jeito. Mesmo molde da
  emenda 1 da ADR-0067. ⚠️ Consequência operacional: depois da primeira foto de carga em produção, o
  rollback só roda com um passo manual antes (decidir o destino dessas fotos).
- **D3** — Limite de **cinco** fotos de carga por entrega, no caso de uso. Número de partida: cobre
  a avaria e o contexto sem transformar a baixa em álbum. Ajustável sem migration.
- **D4** — A foto de carga entra no **passo de revisão**, ao lado do nome de quem recebeu, e não no
  de captura nem num passo próprio. O passo de captura é o preview da câmera dedicado ao canhoto,
  com código de barras e OCR lendo o quadro — misturar a carga ali confundiria o que a leitura
  procura. A revisão já é onde o operador completa a entrega; um passo a mais por nota cansaria
  quem tem o maço inteiro. (Revisado na execução, depois de ler `FieldDeliveryCaptureStep`.)
- **D5** — O envio da foto de carga vai **depois** da baixa da nota e reusa a rota de anexar a
  entrega já feita. A baixa não fica refém de uma foto de carga que falhou no upload.

## Critérios de aceite

- **CA01** — Anexar duas fotos `cargo` à mesma entrega grava duas linhas, e o canhoto do mesmo
  evento continua intacto.
- **CA02** — Anexar um canhoto novo pelo escritório continua substituindo o anterior do escritório.
  Comportamento de hoje, sem regressão.
- **CA03** — A sexta foto de carga da mesma entrega recebe 422 `TRIP_DELIVERY_PROOF_CARGO_LIMIT`.
- **CA04** — Reenviar a mesma foto de carga com o mesmo `attachmentKey` não duplica a linha.
- **CA05** — Foto de carga acima de 960 KiB, ou com cabeçalho que não é imagem, é recusada como o
  canhoto seria.
- **CA06** — A tela de comprovante mostra o canhoto e as fotos de carga em grupos separados.
- **CA07** — O assistente, com canhoto e duas fotos de carga, é operável em 375px.
- **CA08** — `make migration-test` sobe e desce a migration; o rollback falha, sem apagar nada,
  quando existe qualquer foto de carga.

## Pendências

Nenhuma. A assinatura foi decidida (fica fora); o limite de cinco é decisão de partida registrada
em D3.
