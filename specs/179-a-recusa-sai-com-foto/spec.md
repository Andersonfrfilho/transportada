# Feature 179 — A recusa sai da rua com foto e motivo

## Problema e resultado

Recusa de entrega é a ocorrência que mais gera discussão depois: o contratante cobra a mercadoria,
a transportadora afirma que o cliente recusou, e o que existe no sistema é uma linha de texto que
alguém digitou na rua. Sem imagem, a palavra do motorista é a única prova — e ela não se sustenta
num contraditório.

Hoje o motorista registra ocorrência por `POST /me/current-trip/documents/:documentId/occurrences`,
que é **JSON puro**: não há como anexar nada. O anexo existe só no caminho do escritório
(`trip-field-office-occurrence.routes.ts`, multipart), preenchido por quem não estava lá.

Pior: **"recusa" não existe no código**. `recusa_total` e `recusa_parcial` vivem numa constante de
semente (`trip-occurrence.constant.ts`) usada apenas pela tela de avisos; o catálogo vivo é
`company_occurrence_types`, onde recusa é só um nome que a empresa digitou. Uma regra escrita como
"se o tipo se chamar recusa" falha na primeira transportadora que cadastrar "Cliente recusou".

Resultado: **o tipo de ocorrência declara se exige comprovante**. O tipo que exige não é registrado
sem foto e sem motivo escrito. A empresa marca suas recusas; o código não adivinha nome.

## Fora do escopo

- O comprovante de entrega (canhoto), que já tem seus próprios modos e painel.
- Política de reentrega — quando e como a nota sai de novo — que não existe e não nasce aqui.
- **Devolução da nota ao barracão e o motivo dela.** Já resolvido pela spec 164:
  `company_occurrence_types.redelivery_policy` decide se o tipo abre tratativa, e
  `trip_occurrence_cases` chega ao estado terminal `returned_to_warehouse` com nota obrigatória
  (`occurrence-case-state.policy.ts`). Esta spec não reabre essa decisão.
- **Miniatura da foto.** Já entregue pela spec 161: gerada no cliente, gravada como objeto próprio
  (`purpose: 'trip_occurrence_thumbnail'`) com FK composta em
  `trip_document_occurrence_attachments.thumbnail_object_id`, devolvida como `thumbnailUrl`. Esta
  spec reaproveita esse caminho — não inventa um segundo.
- Ocorrência de parada (`trip_stop_occurrences`), que é outro eixo — esta spec é a ocorrência de
  nota, que é onde a recusa acontece.
- Revisão do escritório sobre a ocorrência, que segue como está.

## Histórias priorizadas

### P1 — A empresa diz o que exige comprovante

**Given** o catálogo de tipos de ocorrência da empresa
**When** o operador edita um tipo
**Then** ele marca se aquele tipo exige foto — e marca "recusa total" e "recusa parcial".

### P2 — A recusa não sai sem prova

**Given** um tipo que exige comprovante
**When** o motorista registra a ocorrência
**Then** a tela não deixa enviar sem uma foto anexada e sem o motivo escrito, e diz qual dos dois
falta.

### P3 — Sem sinal continua funcionando

**Given** o motorista sem sinal
**When** ele tira a foto e confirma a recusa
**Then** a ocorrência e a imagem entram na mesma fila da confirmação, e a tela diz que está na fila
— exigir prova não pode virar bloqueio de quem está na rua.

### P4 — A prova chega a quem decide

**Given** uma recusa registrada com foto
**When** o operador abre a ocorrência no escritório
**Then** ele vê a imagem junto do motivo, pelo caminho de anexos que já existe.

### P5 — Quem não exige não muda

**Given** um tipo sem a marca
**When** o motorista registra
**Then** nada muda: a foto segue opcional, e nenhum registro antigo vira inválido.

## Requisitos funcionais

- **RF1** `company_occurrence_types` ganha a exigência de comprovante, no vocabulário que o produto
  já usa para isto (`off` / `optional` / `required` de `DELIVERY_PROOF_FIELD_MODES`) — não se
  inventa um segundo vocabulário para a mesma ideia.
- **RF2** O arquivo **não passa pela API**: o app o envia direto ao storage por URL assinada de vida
  curta, e a rota da ocorrência — que **continua JSON** — referencia o objeto já enviado. Carregar
  bytes de celular em rede ruim através da API é custo que não precisa existir, e é o que "sem
  sobrecarregar a API" quer dizer. Efeito colateral bem-vindo: nenhum cliente antigo quebra.
- **RF2a** O comprovante aceita **imagem e documento** (PDF) — o motorista às vezes fotografa, às
  vezes recebe um papel digitalizado.
  ⚠️ **O `Content-Type` não é amarrável na assinatura.** O `@aws-sdk/s3-request-presigner` marca
  `content-type` como cabeçalho não-assinável (`unsignableHeaders.add('content-type')`, verificado em
  3.1091.0): duas URLs com tipos diferentes e mesmo tamanho saem com assinatura idêntica. Só o
  `Content-Length` entra na assinatura.
  Consequência: **a conferência do servidor depois do upload deixa de ser cautela e vira a única
  garantia de tipo**. Quem emite a URL valida a forma; quem aceita a ocorrência confere o objeto de
  verdade (`head()` — tipo, tamanho e sha256) antes de gravar. Sem essa etapa, uma URL para "foto"
  aceita qualquer arquivo.
- **RF2b** A ocorrência só é aceita se o objeto referenciado **existir, pertencer à empresa do
  contexto autenticado e ter sido enviado por esta viagem**. Sem isso, o cliente escolhe qual objeto
  anexar, o que é pior do que não ter anexo.
- **RF3** `register-driver-occurrence.use-case.ts` recusa o registro de tipo `required` sem anexo ou
  sem `note`, com erro de domínio próprio e código estável.
- **RF4** A validação é do servidor; a tela apenas antecipa. Bloqueio só no frontend não é regra.
- **RF5** A fila offline carrega a imagem junto do corpo, e a tela distingue "na fila" de "enviado"
  — o app já faz essa distinção para a confirmação e ela não pode regredir aqui.
- **RF6** O escritório continua podendo anexar depois, pelo caminho dele; a exigência é sobre o
  registro do motorista.
- **RF7** Tipo marcado como `required` **não invalida ocorrência já gravada**: a regra vale do
  registro novo em diante.
- **RF8** A imagem entra em `stored_objects` com o `companyId` do contexto autenticado, nunca do
  payload, e a chave do objeto não carrega dado pessoal.
- **RF9** A ocorrência do motorista ganha **chave de idempotência**, que hoje ela não tem (ao
  contrário de `/deliver` e `/return`, que já leem a chave). Sem ela o reenvio da fila offline
  duplica a ocorrência e o objeto no bucket — e é justamente a fila que esta spec torna obrigatória.
- **RF10** Textos em pt-BR e en.

## Requisitos não funcionais

- Limite de tamanho e tipos aceitos iguais aos do comprovante de entrega — duas regras diferentes
  para a mesma câmera seria defeito.
- A foto não trafega em log nem aparece em mensagem de erro.
- A tela do motorista funciona em 375px, com área de toque de 44px.

## Casos extremos e falhas

- **Câmera negada pelo sistema**: a tela explica que a permissão é necessária para este tipo e
  oferece escolher da galeria; não cai num estado mudo.
- **Upload falha com a ocorrência já aceita**: não pode existir recusa `required` sem imagem no
  servidor — ou a escrita é uma só, ou a ocorrência fica pendente de envio e a tela diz isso.
- **Fila offline com imagem grande**: a fila tem teto; ao estourar, a tela diz o que houve em vez
  de descartar em silêncio.
- **Empresa marca `required` num tipo de separação**: a exigência vale onde o anexo faz sentido; o
  painel não oferece o que a tela não cumpre.
- **Reenvio da fila**: a chave de idempotência **precisa ser criada** (RF9) — esta rota não tem.
  Com ela, o reenvio devolve o mesmo registro e nada reexecuta; sem ela, duplica ocorrência e objeto.

## Critérios de aceite

- **CA01** O painel de tipos de ocorrência permite marcar a exigência de comprovante.
- **CA02** Tipo `required` sem foto é recusado pelo servidor, com código estável.
- **CA03** Tipo `required` sem motivo escrito é recusado pelo servidor.
- **CA04** A tela do motorista diz qual dos dois falta, antes de tentar enviar.
- **CA05** Sem sinal, a recusa com foto entra na fila e a tela não afirma que foi enviada.
- **CA06** A imagem aparece para o escritório pelo caminho de anexos existente.
- **CA07** Tipo sem a marca continua aceitando ocorrência sem foto.
- **CA08** Ocorrência gravada antes da marca continua válida.
- **CA09** Revisão de design com print, em 375px e no desktop (web.md §15).

## Dúvidas

Nenhuma — decisão do usuário em 23/09: exigir **na hora do registro**, com **uma foto mais o motivo
escrito**.
