# Feature 182 — A baixa do escritório coleta assinatura e a carga, não só o canhoto

## Problema e resultado

Desde a spec 181 a entrega tem **um caminho só**: "Marcar entregue" saiu da linha da nota, e quem
dá baixa passa pelo assistente, que fotografa o canhoto. Foi a decisão certa — o atalho descartava
prova e era o botão de mais destaque —, mas ela deixou o assistente como único coletor de prova de
entrega, e ele coleta menos do que o domínio já sabe guardar.

Três coisas, conferidas no código:

1. **A assinatura não é pedida, embora exista.** `trip_delivery_proofs.kind` é
   `'photo' | 'signature'` desde sempre (`trip.schema.ts:1359`), a rota multipart aceita o campo
   `kind` (`delivery-proof.schema.ts`), o app do motorista tem `SignaturePad` em canvas com queda
   para foto quando não há ponteiro (`driver-trip/components/SignaturePad.component.tsx`), e a tela
   de comprovante já separa `photos` de `signatures` para exibir (`deliveryProof.service.ts:59-60`).
   Só o assistente do escritório não oferece. O recebedor assina no aparelho do motorista e não
   assina na baixa feita no balcão — a mesma entrega sai com prova diferente conforme quem registra.

2. **Só cabe uma foto, e ela é o canhoto.** O assistente captura uma imagem por nota. A avaria que
   o motorista viu na descarga, o pallet rompido, a mercadoria deixada na portaria: nada disso tem
   onde entrar. Quando o contratante cobra, a transportadora tem o papel assinado e nenhuma imagem
   do que foi entregue.

3. **Foto de carga e canhoto seriam indistinguíveis.** Hoje `kind: 'photo'` é o canhoto por
   convenção, não por declaração. Somar fotos de mercadoria sob o mesmo `kind` faz a tela de
   comprovante misturar o documento fiscal com o registro visual da carga, e nenhuma consulta
   posterior consegue separá-los.

Resultado: **a baixa do escritório coleta o mesmo que a do motorista** — canhoto, assinatura
opcional e fotos da carga —, e o comprovante distingue o que é documento do que é registro da
mercadoria.

## Fora do escopo

- **O fluxo do motorista.** Ele já assina; esta spec não mexe no `driver-trip` além de extrair o
  `SignaturePad` para um lugar que as duas telas possam importar.
- **Tornar a assinatura obrigatória.** Ela é opcional por decisão do produto; o painel de
  comprovante já tem campos exigíveis por empresa e pode ganhar essa chave depois, em spec própria.
- **A recusa com foto**, resolvida pela spec 179 pelo caminho da ocorrência.
- **OCR ou leitura de qualquer natureza sobre a foto de carga.** Ela é registro visual, não fonte
  de dado.
- **Retenção e expurgo de imagem.** Segue a política que o comprovante já tem.

## Requisitos funcionais

- **RF1** — O assistente de baixa oferece, depois do canhoto e antes do envio, um passo de
  assinatura do recebedor, em canvas, com queda para foto quando o aparelho não tem ponteiro.
- **RF2** — A assinatura é **opcional**: pular não bloqueia o envio, e não gera linha em
  `trip_delivery_proofs`.
- **RF3** — O assistente aceita **de zero a N fotos de carga** por nota, além do canhoto, com o
  mesmo caminho de captura (câmera com queda para upload) que o canhoto já usa.
- **RF4** — Foto de carga é gravada com `kind` próprio, distinto de `photo` e de `signature`.
- **RF5** — A tela de comprovante (`TripDeliveryProof`) mostra as fotos de carga em grupo separado
  do canhoto e da assinatura, com rótulo próprio.
- **RF6** — Cada anexo mantém a idempotência que o canhoto já tem (`attachmentKey`): reenviar o
  mesmo arquivo da mesma nota não duplica linha.
- **RF7** — O nome de quem recebeu continua onde está, e segue exigível pela configuração da
  empresa. Esta spec não altera essa regra.

## Requisitos não funcionais

- **RNF1** — Nenhuma imagem trafega ou é guardada fora do bucket privado; a entrega ao cliente
  continua por URL assinada de vida curta.
- **RNF2** — O teto de tamanho e os tipos aceitos são os mesmos do canhoto — a rota não ganha
  exceção por ser foto de carga.
- **RNF3** — O assistente continua utilizável em 375px, que é a largura do aparelho no balcão.

## Decisões

- **D1** — `TRIP_DELIVERY_PROOF_KINDS` ganha `'cargo'`. É constante com `check` no banco, então o
  valor novo exige migration aditiva — sem `DROP`, sem reescrever linha existente.
- **D2** — O `SignaturePad` sai de `driver-trip` para um lugar compartilhado entre as duas telas.
  Cópia seria a segunda implementação da mesma assinatura, e elas divergiriam na primeira correção.
- **D3** — Um passo novo no assistente, não um campo espremido na revisão: assinar exige a tela
  inteira no celular, e o passo já é a unidade que o assistente usa.
- **D4** — A foto de carga entra no mesmo passo de captura do canhoto, como "adicionar mais", e não
  num passo próprio: são o mesmo gesto, e um passo a mais por foto cansaria quem tem cinco notas.

## Critérios de aceite

- **CA01** — Dar baixa numa nota, assinar e enviar grava duas linhas em `trip_delivery_proofs`:
  `photo` e `signature`, ambas com `stop_event_id` do mesmo evento.
- **CA02** — Dar baixa e **pular** a assinatura grava só a linha `photo`, e a nota fica entregue.
- **CA03** — Anexar duas fotos de carga grava duas linhas `cargo`, e a tela de comprovante as mostra
  em grupo separado do canhoto.
- **CA04** — Reenviar a mesma nota com o mesmo `attachmentKey` não duplica nenhuma das linhas.
- **CA05** — O assistente inteiro, com assinatura e duas fotos, é operável em 375px sem rolagem
  horizontal.
- **CA06** — A migration sobe e desce (`make migration-test`) sem perder linha existente.

## Pendências

Nenhuma. As três perguntas que existiam — se o banco aceitava assinatura, se a rota aceitava `kind`
e se havia componente de assinatura — foram respondidas lendo o código, e as três já estavam
resolvidas.
