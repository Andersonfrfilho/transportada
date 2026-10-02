# ADR-0089 — A foto do produto soma e se apaga; o canhoto é um só

- **Status:** proposta (2026-09-26). Passa a `aceita` na T2.7 da spec 224, depois de conferida contra o
  código.
- **Data:** 2026-09-26
- **Decisores:** o usuário, na conversa da spec 224. Ele pediu "até 5 fotos, contando uma do canhoto e
  outras dos produtos, opcionais", "toda foto precisa de abrir imagem e remover" e, depois da crítica,
  "a foto de produto removida é apagada de verdade".
- **Fecha:** a spec 224 (`specs/224-o-comprovante-junta-fotos-da-mercadoria/`)
- **Complementa:** ADR-0057 (comprovante configurável), ADR-0067 §5 (canal do escritório), ADR-0070
  (a foto obrigatória pesa na nota), a spec 184 (`kind = 'cargo'`) e a spec 212 (o canhoto cabe no
  teto)

## Contexto

O comprovante do motorista guarda uma foto por nota, e a segunda substitui a primeira. Quem quer
registrar a mercadoria entregue fotografa por cima do canhoto e perde a prova de entrega.

A spec 184 já criou `cargo` para a foto da mercadoria, mas deixou quatro lacunas:

- só o escritório pode gravar;
- o teto é contado sem trava;
- não há retenção;
- não há remoção.

A rota do motorista recusa `cargo` de propósito: sem teto no banco, um retry em laço gravaria sem
fim.

## Decisão

1. **O canhoto é um só.** `photo` e `signature` seguem "o segundo substitui", nos dois canais. Só a
   `photo` do motorista pesa na pontualidade e na nota (ADR-0070). O canhoto enviado tem "Substituir"
   e nunca é removido pelo servidor.
2. **A foto do produto é `cargo` e soma.** O motorista manda até 4 por nota, e o escritório, até 5.
   Uma entrega chega a no máximo 9, porque o teto é por canal e um autor não come a vaga do outro.
   - O teto mora no banco, num trigger. A trava consultiva, o curto-circuito pela chave e a contagem
     são comandos separados, sob `READ COMMITTED`.
   - Acima do teto, a API responde 422 `TRIP_DELIVERY_PROOF_CARGO_LIMIT`.
   - ⚠️ **Em conflito com a spec 220 RF08, publicada depois desta proposta** (2026-10-02): lá o
     teto "continua 5 por entrega" (spec 184 D3), somando os canais, e é contra ele que o
     `cargo_minimum_count` da 220 é validado. Esta ADR **não passa a `aceita`** antes de essa
     divergência ser decidida — está registrada na 224 (D3) e no `PERGUNTAS-ABERTAS.md` (34).
   - A chave (`attachment_key`) é obrigatória e única em `cargo`.
3. **A foto do produto não pesa e não carrega posição nem recebedor**, nem no servidor nem na fila do
   aparelho.
4. **O motorista apaga a própria foto de produto, e ela é apagada de verdade.**
   - Os bytes saem do bucket logo depois do commit, e o expurgo do worker serve de rede de segurança.
   - A linha fica como **lápide** (`removed_at`, `removed_by_user_id`), de mão única. Sem ela, um
     reenvio atrasado da fila recriaria a foto.
   - A auditoria registra quem removeu e quando. A imagem não é guardada.
5. **Retenção de 5 anos**, a mesma dos anexos de ocorrência (`OCCURRENCE_ATTACHMENT_RETENTION_YEARS`),
   com o purpose próprio `delivery_proof_cargo`. O canhoto continua sem prazo.
6. **O aparelho lê as imagens pela API, nunca do bucket.** Isso dispensa CORS de `GET` no bucket e
   cabe na CSP que já existe.
7. **No aparelho, o canhoto tem prioridade.**
   - A drenagem é feita em duas passagens: todos os canhotos e assinaturas, depois as fotos de
     produto.
   - A foto de produto é recusada na hora quando ocuparia a reserva da fila, e nada é despejado.
   - A redução usa a esteira da 212, com a régua da ocorrência: 512 KiB.

## Risco aceito

**Quem pode ser cobrado pela avaria consegue apagar a prova da avaria.** O motorista que fotografou a
caixa amassada pode removê-la antes de o escritório ver, e os bytes não voltam. A crítica (opus)
levantou o risco em 2026-09-26, e o usuário decidiu apagar de verdade, sabendo dele.

O que resta ao escritório:

- a trilha de auditoria (quem, quando e qual foto, sem a imagem);
- o canhoto, que não se remove;
- as fotos que o próprio escritório anexa (184), que o motorista não alcança.

Se o risco se materializar, a mudança é para frente: uma janela de retenção antes do expurgo, ou o
fim da remoção depois de a viagem fechar. As duas cabem sem desfazer a lápide.

## Alternativas descartadas

- **Um `kind` novo (`product`).** Duplicaria as regras que a 184 já deu a `cargo`.
- **O teto só no caso de uso.** Dois envios simultâneos passam os dois, e um CHECK não conta linhas.
- **Uma coluna `slot` (1 a 4) com índice único.** Exigiria alocar a vaga com retry e preencher as
  linhas antigas.
- **`DELETE` físico da linha.** Sem lápide, o reenvio recriaria a foto.
- **Só esconder a foto e guardar os bytes.** O usuário recusou, por LGPD e porque a foto errada tem
  de sumir de verdade.
- **URL assinada do bucket direto no aparelho.** Depende de um CORS de `GET` que nunca foi
  conferido, e falharia sem erro visível.
- **Despejar a foto de produto mais antiga para o canhoto caber.** Viola "nada perde foto".

## Consequências

- O motorista registra a mercadoria sem tocar no canhoto, e o escritório a vê no comprovante.
- O teto existe em dois lugares (constante TS e SQL), e um contrato confere os dois.
- O rollback só funciona antes do primeiro uso. Depois, toda correção é migration nova, para frente.
- O `DELETE` do motorista vai só com `Authorization`, porque o CORS não libera outro header em
  método sem corpo.
