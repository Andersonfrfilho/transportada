# Feature 321 — Canhoto retido pelo cliente

## Problema e resultado

Em 10/11/2026 o Anderson pediu uma ocorrência para o caso em que **o cliente segura o canhoto** na hora da entrega
(vai assinar depois, o responsável não está, quer conferir a nota) e **outro motorista pode buscar esse canhoto
mais tarde**. Hoje o motorista só tem duas saídas ruins: entregar sem canhoto (cai em "canhoto pendente" da 223, que
não diz _por quê_) ou não dar baixa.

Medido no código de `origin/staging`:

1. **A pendência de canhoto existe, mas é muda.** `trip_delivery_proofs.canhoto_review` e o `proofPending` (spec 223) dizem
   "falta o canhoto", não "o cliente ficou com ele". O escritório não distingue canhoto esquecido de canhoto retido, e
   não tem a quem cobrar.
2. **O tipo de ocorrência já sabe não avisar a contratante.** `company_occurrence_types.notifies` e `emails_contractor`
   (padrão `false`) decidem o aviso; um tipo novo com os dois desligados não sai para a SPANI. Falta **garantir** isso por
   contrato, para que ninguém ligue sem querer (e para que o canal de grupo da spec 318 respeite o mesmo desligado).
3. **A foto do canhoto já dá a baixa por quem a enviar.** Spec 294 (RF23): o worker lê o canhoto (OCR) e casa o número
   com as notas abertas de quem mandou. Isso serve a "outro motorista pegou o canhoto": basta ele fotografar.

Resultado: um tipo de ocorrência de nota, **"Canhoto retido pelo cliente"**, que (a) não gera aviso à contratante em
nenhum canal, (b) mantém a entrega concluída e (c) deixa a nota com o canhoto **pendente de coleta**, visível numa lista
do escritório, até alguém trazer o canhoto. Quando a foto chega por qualquer motorista (ou pelo escritório), a ocorrência
**resolve sozinha** (andamento da 266, `system`).

## Fora do escopo

- **Enviar a ocorrência à SPANI** ou a qualquer contratante, por e-mail ou grupo de WhatsApp (é o contrário do pedido).
- **Criar parada de coleta na viagem de outro motorista.** Depende da spec 297 (viagem com coletas, ainda rascunho no
  PR #540). Esta spec entrega a pendência e a lista; o encaixe em viagem é a fase 2 (ver Dúvidas).
- Mudar a regra do canhoto obrigatório (218/223) ou a conferência (220/222).
- Cobrança financeira por canhoto não devolvido.

## Decisões (recomendação — o Anderson confirma em Dúvidas)

- **D1 — É um tipo de ocorrência, não um estado novo da nota.** Reusa `company_occurrence_types` (cadastro, aba Tipos),
  o registro por nota do motorista/escritório e o andamento da 266 (`resolved`/`reopened`). Nenhuma tabela de status
  paralela. Ocorrência **aberta** deste tipo sobre a nota = canhoto retido; **resolvida** = canhoto recuperado.
- **D2 — Nome e etapa.** "Canhoto retido pelo cliente", etapa `delivery`, `flow: document`, momentos `document` e `office`.
  Entra no catálogo de bootstrap (`OCCURRENCE_TYPE_CATALOG`, entrada literal como a 208/241, sem migration) e no script de
  configuração de staging.
- **D3 — Nunca vai à contratante, por contrato.** Tipo nasce com `notifies = false`, `emails_contractor = false`, sem
  modelo de e-mail. Um **teste de contrato** falha se a entrada do catálogo trouxer qualquer um ligado, e a cobrança
  automática da 143/269/271 e o canal de grupo da 318 recebem a mesma guarda (o tipo é lido por nome estável no catálogo
  `CANHOTO_RETAINED_OCCURRENCE_TYPE_NAME`; renomeado no painel, a guarda continua pelo id gravado — ver T2).
- **D4 — A retenção libera a nota para outra viagem (regra do Anderson, 10/11/2026).** Registrar o tipo **solta a nota da
  viagem de origem** e a deixa disponível para entrar em outra viagem, como a nota devolvida/reentrega (164 §4: a nota não é
  presa). A viagem de origem fecha normalmente; a entrega ao cliente vale como feita, o que falta é o canhoto. O tipo **não**
  usa `leaves_document_behind` (que é de separação, 185); a liberação é um efeito próprio do tipo, coluna
  `releases_document_for_pickup` (padrão `false`, nenhum tipo existente muda), desenhada em T0/T2.
- **D4b — Quem finaliza é o motorista da outra viagem (regra do Anderson).** A nota entra na nova viagem como **item de
  coleta de canhoto** no endereço do cliente; o motorista dessa viagem a **finaliza coletando o canhoto** (foto do canhoto,
  pelo caminho da 294/222). Só então a ocorrência resolve (D6). Sem encaixe em viagem de coleta (297 ainda é rascunho),
  T0 mede o menor caminho: nota entregue/solta aceita como parada da viagem seguinte com o rótulo "coletar canhoto".
- **D4c — A viagem nova não leva o peso nem a dimensão da nota (regra do Anderson, 10/11/2026).** É **configuração do tipo**, não
  regra fixa: coluna `counts_cargo_on_pickup_trip` (booleana, padrão `true` = comportamento de hoje; o tipo "Canhoto retido"
  é cadastrado com `false`). Com `false`, a nota que entra na outra viagem por causa da retenção **não soma** peso, volume,
  dimensões nem ocupação/planta da viagem nova (a mercadoria já foi entregue; só o papel volta). Vale para a ocupação da viagem,
  a conta de capacidade e o aviso de excesso de peso, e a nota continua visível na lista como "coletar canhoto". A config
  aparece na aba Tipos só para tipos que liberam a nota (D4), com o seletor padrão do painel.
- **D5 — Exigências do registro.** Foto opcional (mostra o cliente/recibo, se houver), observação **obrigatória** (quem
  ficou com o canhoto e o combinado), sem itens, sem valor, sem localização obrigatória. Todos via modos da 246, sem
  campo novo.
- **D6 — Resolve ao chegar o canhoto.** Quando o comprovante de canhoto da nota passa a existir (foto casada pelo worker
  294/222, subida pelo escritório ou baixa com canhoto), o servidor grava o evento `resolved` do tipo `system` com frase
  fixa ("Canhoto recebido"). Canhoto recusado na conferência (`rejected`) **reabre**.
- **D7 — Lista do escritório.** Filtro "canhoto retido" na lista de ocorrências (a 277 já tem busca) e selo na nota no
  detalhe da viagem, ao lado do "canhoto pendente" da 223 com texto distinto.
- **D8 — Quem recolhe é o motorista da viagem que levou a nota (D4b).** O casamento da 294 usa "notas abertas de quem mandou":
  a nota, ao entrar na nova viagem, é aberta para esse motorista, então casa sem ajuste no worker. T0 confere; se a nota entregue
  não casa, o ajuste é incluir as notas com retenção aberta no conjunto de casamento.

## Requisitos funcionais

- **RF1** — O catálogo traz o tipo (D2) e o cadastro o aceita como qualquer outro; a aba Tipos o mostra com os modos de D5.
- **RF2** — Registrar o tipo na nota (motorista, escritório, WhatsApp) cria a ocorrência **sem** disparar aviso à
  contratante em nenhum canal e sem criar mensagem ao cliente.
- **RF3** — A nota com ocorrência aberta do tipo aparece como "canhoto retido" na viagem e na lista (D7).
- **RF4** — Chegada do canhoto resolve; reprovação reabre (D6).
- **RF5** — Registrar o tipo solta a nota da viagem de origem e a deixa elegível para outra viagem (D4); a viagem de origem fecha sem ela pendente.
- **RF5c** — Com `counts_cargo_on_pickup_trip = false`, a nota de coleta não entra no peso, volume, dimensão nem ocupação da viagem nova, e não dispara trava de capacidade (D4c).
- **RF5b** — A nota na nova viagem aparece como "coletar canhoto" e o motorista a finaliza com a foto do canhoto (D4b, D8).
- **RF6** — Ocorrência do tipo não conta como "problema na entrega" para o painel de pendências de entrega (a mercadoria
  foi entregue); T0 confere como a 275 agrupa o aviso ao painel.

## Requisitos não funcionais

- Aditiva: sem migration destrutiva; sem tipo existente alterado. Publicação em etapas (ADR-0081 §9): painel → API → app.
- Nenhum CNPJ/nome de contratante no código (SPANI é a contratante do Anderson, não vira constante).

## Casos extremos e falhas

- Dois registros do tipo na mesma nota: o segundo é recusado como duplicado enquanto o primeiro estiver aberto.
- Canhoto chega **antes** do registro: registro vira desnecessário; o servidor recusa com mensagem clara.
- Cliente devolve o canhoto ao próprio motorista na mesma viagem: resolve pela mesma foto.
- Nota devolvida/recusada depois: a ocorrência encerra com a tratativa (166/164 mandam; o tipo não abre tratativa).

## Critérios de aceite

- **CA01** Contrato: o tipo do catálogo tem `notifies = false`, `emails_contractor = false`, sem modelo; teste falha se mudar.
- **CA02** Registrar o tipo numa nota de contratante com envio automático ligado **não** gera e-mail nem mensagem de grupo.
- **CA03** Registrar o tipo solta a nota; a viagem de origem fecha e a nota pode ser acrescentada a outra viagem, onde aparece como "coletar canhoto".
- **CA03b** A viagem nova com a nota de coleta mantém peso, volume e ocupação iguais aos de antes de acrescentá-la; com a config `true`, soma como nota comum.
- **CA04** O motorista da nova viagem fotografa o canhoto, a nota se finaliza e a ocorrência resolve; `rejected` reabre.
- **CA05** Em staging, prints claro/escuro, desktop/celular da aba Tipos e da lista, comparados com outra tela do painel.

## Dúvidas

Respondidas pelo Anderson em 10/11/2026: a entrega vale como feita; a retenção **libera a nota** para outra viagem; o motorista
dessa viagem a finaliza coletando o canhoto (D4, D4b).

- [NEEDS CLARIFICATION: **Aviso à contratante na retenção e na coleta.** Pelo pedido, nenhum dos dois vai à SPANI. Confirma que
  a **coleta do canhoto** (nota finalizada na outra viagem) também não gera aviso, ou só a retenção?] — recomendo nenhum dos dois.
- [NEEDS CLARIFICATION: **SPANI exige o canhoto para pagar?** Se sim, enquanto retido a nota deve ficar fora do envio/faturamento
  que o exige — hoje isso não é tratado (223 já deixa passar sem canhoto).]
- [NEEDS CLARIFICATION: O motorista pode registrar sozinho no app e no WhatsApp, ou só o escritório?] — recomendo os dois.
- [NEEDS CLARIFICATION: Quem escolhe a viagem? O escritório acrescenta a nota à viagem de outro motorista (recomendo), ou o
  motorista "pega" a nota?]
- [NEEDS CLARIFICATION: Prazo para cobrar o canhoto retido (alerta ao escritório após N dias)?] — recomendo fase 2.
