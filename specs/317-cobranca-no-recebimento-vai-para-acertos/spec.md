# Feature 317 — A cobrança no recebimento vai para os acertos

## Problema e resultado

Hoje o tipo de parada "Cobrança inesperada" (`stopKind = unexpected_charge`) é só um aviso: o motorista
tira **uma** foto sem rótulo, o servidor avisa por notificação interna quem despachou a viagem e, quando
há nota (o app do motorista manda `documentId: null`, então quase nunca há), cria uma sugestão `other` em
`delivery_charges` com valor `0`. O valor pago pelo motorista não é gravado, a placa e o comprovante
se misturam em uma foto só, e o escritório não vê nada disso na tela de acertos.

O negócio confirmou (Anderson, 10/11/2026) o desenho abaixo. Resultado:

1. O tipo passa a se chamar **Cobrança no recebimento** (o motorista pagou, ou foi cobrado, ao
   receber a carga no destino).
2. Ela **não vai direto para a contratante** (Spani incluída): nem e-mail, nem portal, nem bot. Nada
   sai para fora da transportada por causa dela.
3. Ela **cria uma linha em Ressarcimentos** (`/ressarcimentos`, a tela de cobranças extras/acertos),
   já com viagem, ocorrência, nota e cliente, o valor, e as duas fotos.
4. Ela **marca o cliente como "possível cobrança na entrega"**, para o escritório decidir sobre
   uma regra recorrente (`delivery_client_charge_rules`).
5. O motorista tira **duas fotos distintas, ambas obrigatórias**: a **placa de cobrança** e o
   **comprovante de pagamento**. Cada foto tem rótulo próprio.

## Fora do escopo

- Localização e chegada obrigatórias na ocorrência: é a spec 315, já em staging (esta spec só herda o que ela fez).
- Espera longa, Endereço incorreto e o chat do vendedor: outras threads/specs. Só a regra "esse tipo
  não vai direto à contratante" é comum, e aqui vale apenas para a cobrança no recebimento.
- Gerar o lote/fatura ao contratante a partir da linha: continua o fluxo de Ressarcimentos já existente
  (spec 164), sem mudança.
- Executar o PIX ao motorista pelo sistema: o PIX é **coletado e mostrado**
  e o comprovante, se o atendente enviar, chega ao motorista (E11, E13); quem faz a transferência é o atendente fora do
  sistema. A página de acertos cobra apenas a contratante (E12).
- Reconhecer o valor por OCR do comprovante.
- Tipos de **nota** (galpão/rua): continuam com a foto sem rótulo da 161/246.

## Decisões já tomadas (negócio)

- D1. "Nenhum desses vai direto para a Spani": o e-mail/portal à contratante fica **desligado** neste tipo
  e a política é travada por contrato de teste. A notificação **interna** a quem despachou a viagem
  (spec 082) fica, porque é equipe nossa.
- D2. Destino é a página de Ressarcimentos já existente, não uma tela nova.
- D3. A linha carrega viagem, ocorrência, nota, cliente, e as fotos/comprovante.
- D4. O cliente é marcado como possível cobrança na entrega.

## Decisões desta spec (revisáveis, mudam o desenho se o Anderson discordar)

- E1. **Rótulo por foto vem de "vagas de foto" do tipo** (nova tabela filha
  `company_occurrence_type_photo_slots`: `slot_key`, `label`, `required`, `position`), não de campo
  livre do motorista. Para esse tipo: `charge_sign` ("Foto da placa de cobrança") e `payment_receipt`
  ("Foto do comprovante de pagamento"), ambas `required`. O editor de tipos (aba Tipos de `/ocorrencias`)
  não edita vagas nesta spec; elas nascem pela migration e só este tipo as usa. O mecanismo é genérico,
  para outros tipos usarem depois.
- E2. As fotos moram em `trip_stop_occurrence_photos` (`stop_occurrence_id`, `slot_key`, `object_id`,
  `position`), uma linha por vaga. `trip_stop_occurrences.attachment_object_id` continua sendo
  preenchido com a foto da placa (compatibilidade com o que já lê esse campo).
- E3. **Valor pago** vira coluna `declared_amount numeric(14,4)` em `trip_stop_occurrences`, obrigatória
  para este tipo (usa o mesmo resolvedor da 247: `declared_amount_mode = required`, `0` é valor e não
  vazio; `bigint`/string, nunca float; valor **nunca** vem do payload de preço de item).
- E4. **Uma linha por nota ou uma linha para várias notas** (decisão do Anderson, 10/11, refinada). O
  motorista escolhe o modo no formulário, no mesmo espírito da tela de cobranças que já permite
  cobrança por nota ou para todas:
  - **por nota** (`one_per_document`): marca as notas e informa o valor de **cada uma**; nasce uma
    linha por nota, cada uma com o valor dela;
  - **agrupada** (`grouped`): marca uma ou mais notas e informa **um valor só**; nasce uma linha, ligada
    às notas pela tabela `delivery_charge_documents`.

  Parada com uma só nota assume essa nota sem perguntar. O servidor confere que as notas pertencem à
  parada e à viagem (`companyId` do contexto, nunca do payload). `declared_amount` da ocorrência é o
  total (soma das linhas), calculado no servidor.

- E5. A linha nasce em `delivery_charges` com `charge_type = 'receiving_charge'` (novo valor do enum),
  `origin = 'occurrence'`, `status = 'recorded'` (já é gente conferindo, como o ADR-0048 §5 aplicado na
  164), `trip_id`, `trip_document_id` (a nota da linha por nota; nulo na linha agrupada,
  com `grouped_documents = true` e as notas em `delivery_charge_documents`), `delivery_client_id`, `contractor_id` resolvidos da nota,
  `amount` = valor pago, e uma nova coluna `stop_occurrence_id` (FK para `trip_stop_occurrences`); cliente e contratante vêm da parada.
  `occurrence_id` segue sendo só de `trip_document_occurrences`. O comprovante principal também é
  gravado em `proof_object_id` (hoje sem escritor).
- E6. **Idempotência**: índice único parcial em (`stop_occurrence_id`, `trip_document_id`) para linhas
  por nota, e em `stop_occurrence_id` para a linha agrupada (`trip_document_id` nulo); reenviar o
  registro (a fila offline repete) não duplica linha, vínculo de nota nem foto.
- E7. **Marca do cliente**: `delivery_clients` ganha `receiving_charge_flagged_at timestamptz` e
  `receiving_charge_source_stop_occurrence_id`. Marca na criação da linha (primeira vez grava;
  repetida só atualiza a data). O escritório limpa na ficha do cliente (`delivery.manage`).
  O selo "Possível cobrança na entrega" aparece sempre **para o escritório** (ficha e lista do cliente,
  com link para a ocorrência). **Para o motorista é configurável** (decisão do Anderson, 10/11): coluna
  `show_client_charge_seal_to_driver boolean` (padrão `true`) no tipo, editada na aba Tipos de
  `/ocorrencias`; ligada, o cartão da parada daquele cliente mostra um aviso somente leitura lido do
  servidor. Só o escritório limpa. Não cria regra recorrente sozinha.
- E8. Sem parada com nota resolvível (parada sem nota, nota inexistente) o registro **é recusado** `422`
  `STOP_OCCURRENCE_DOCUMENT_REQUIRED` neste tipo: sem nota não há cliente nem contratante, e a linha nunca nasce sem eles.
  (A ocorrência de parada sem nota dos outros tipos não muda.)
- E9. O tipo é renomeado para "Cobrança no recebimento" só onde o nome ainda é o padrão semeado
  ("Cobrança inesperada"); nome editado pela transportada não é tocado. `stopKind` fica
  `unexpected_charge` (histórico, chave da notificação `trip.occurrence-unexpected-charge`).
- E10. A sugestão automática de 0 do `onDelivered` (spec 060 D4c) **deixa de ser chamada** para este
  tipo, porque a linha `recorded` com valor real a substitui.
- E11. **Quem pagou e o PIX** (decisão do Anderson, 10/11): o formulário pergunta "Quem pagou?"
  (`paid_by`: `driver` | `company`). Se foi o motorista, pede o **PIX do motorista** (chave e tipo),
  pré-preenchido do cadastro quando houver, e grava em `trip_stop_occurrences.driver_pix_key` /
  `driver_pix_key_type`. O PIX aparece ao escritório na linha de Ressarcimentos, só para quem tem
  `trip.financials`, e nunca vai em e-mail, log ou resposta ao app de outro motorista.
- E12. **Só a contratante é cobrada na página existente** (decisão do Anderson, 10/11): a linha
  `receiving_charge` entra no mesmo fluxo de lote/cobrança da 164. O motorista **não** é cobrado nem
  ressarcido por esta página.
- E13. **O atendente conclui a ocorrência e, se quiser, envia o comprovante do PIX ao motorista**
  (decisão do Anderson, 10/11). Concluir **não é bloqueado**: marcar como concluída (spec 266,
  `occurrences.resolve`) funciona com ou sem comprovante. Quando `paid_by = driver`, a tela de concluir
  mostra o valor e o PIX do motorista e oferece o campo **opcional** "Comprovante do PIX": se anexado,
  é guardado em `trip_stop_occurrences.driver_payout_receipt_object_id` (com `driver_payout_sent_at` e
  `driver_payout_sent_by_user_id`) e **enviado ao motorista** no chat da ocorrência (a conversa da 183
  que o motorista já lê pela 266), com o aviso de sempre. O sistema não executa o PIX.

## Histórias priorizadas

### P1 — O motorista registra a cobrança com as duas fotos

**Given** uma parada com uma nota e o tipo "Cobrança no recebimento" ativo
**When** o motorista abre a ocorrência
**Then** o formulário pede o valor pago, a foto da placa de cobrança e a foto do comprovante de
pagamento, cada uma com seu rótulo, e só deixa enviar com as duas e o valor.

**Given** uma parada com duas ou mais notas
**When** o motorista registra a cobrança
**Then** o formulário oferece **uma linha por nota** (valor de cada uma) ou **uma linha para várias
notas** (um valor só), e Ressarcimentos recebe as linhas conforme a escolha.

### P1 — O escritório vê a cobrança em Ressarcimentos

**Given** a cobrança registrada
**When** o escritório abre `/ressarcimentos`
**Then** vê a linha com viagem, parada, nota, cliente, valor e as duas fotos (placa e comprovante)
com rótulo, e a ocorrência abre a partir dela.

### P1 — Nada sai para a contratante

**Given** a cobrança registrada
**When** o registro termina
**Then** não há e-mail, aviso de portal nem mensagem de bot para a contratante, e a linha só aparece
no lote ao contratante quando o escritório a incluir (fluxo da 164).

### P1 — Quem pagou e o PIX

**Given** o motorista pagou a cobrança
**When** registra a ocorrência
**Then** o formulário pede a chave PIX dele (pré-preenchida se cadastrada), e o escritório vê o PIX
na linha de Ressarcimentos; se a empresa pagou, o PIX não é pedido.

### P1 — O atendente conclui e pode enviar o comprovante do PIX

**Given** uma cobrança paga pelo motorista
**When** o atendente vai resolver a ocorrência
**Then** a tela mostra o valor e o PIX do motorista, deixa concluir a qualquer momento e oferece anexar
o comprovante do PIX (opcional), que chega ao motorista no chat da ocorrência.

### P2 — O cliente fica marcado

**Given** a cobrança registrada
**When** o escritório abre a ficha do cliente, ou o motorista abre a parada do mesmo cliente
**Then** o selo "Possível cobrança na entrega" aparece para o escritório (data e link da ocorrência) e,
se o tipo estiver configurado para mostrar ao motorista, como aviso somente leitura para ele; só o
escritório limpa.

### P2 — Reenvio da fila não duplica

**Given** o app reenvia o mesmo registro após queda de rede
**When** o servidor recebe de novo
**Then** continua uma linha só em Ressarcimentos e as fotos não duplicam.

## Requisitos funcionais

- RF1. Migration aditiva (nada destrutivo, com rollback): enum `delivery_charge_type` ganha
  `receiving_charge`; `delivery_charges` ganha `stop_occurrence_id` (FK, nulo, único parcial) e
  `grouped_documents`; tabela `delivery_charge_documents`; CHECK que amarra `receiving_charge`,
  `stop_occurrence_id`, `origin = 'occurrence'` e (`trip_document_id` não nulo ou `grouped_documents`);
  colunas `driver_payout_receipt_object_id`, `driver_payout_sent_at` e `driver_payout_sent_by_user_id` em `trip_stop_occurrences`; `company_occurrence_types.show_client_charge_seal_to_driver`;
  `trip_stop_occurrences` ganha `declared_amount`, `paid_by`, `driver_pix_key` e `driver_pix_key_type`
  (PIX obrigatório com `paid_by = driver`); tabelas `company_occurrence_type_photo_slots` e
  `trip_stop_occurrence_photos`; colunas da marca em `delivery_clients`.
- RF12. Ao concluir ocorrência de parada com `paid_by = driver`, o comprovante do PIX é **opcional**
  (`driver_payout_receipt_object_id`): sem ele a conclusão funciona igual; com ele, é enviado ao
  motorista no chat da ocorrência. A chave PIX fica visível só a `trip.financials`.
- RF13. O editor de tipos grava `show_client_charge_seal_to_driver`; o app do motorista lê o valor do
  servidor (RF8) e esconde o aviso quando desligado.
- RF2. Semeadura por empresa: vagas `charge_sign` e `payment_receipt` (ambas `required`) para o tipo de
  `stopKind = unexpected_charge`; `declared_amount_mode = required`; `emails_contractor = false`;
  `contractor_notification_template_key = null`; renomear conforme E9.
- RF3. Registro de parada (`report-stop-occurrence`): lê as vagas do tipo, exige uma foto por vaga
  `required` (`422 STOP_OCCURRENCE_PHOTO_SLOT_MISSING` com a `slot_key`), exige valor (E3) e nota (E4/E8),
  grava as fotos, a linha de cobrança e a marca do cliente **na mesma transação**.
- RF4. A foto sobe pela fila existente (`kind: 'stopOccurrencePhoto'`, spec 209) ganhando o campo
  `slotKey`; fila antiga sem `slotKey` continua valendo para tipos sem vagas.
- RF5. `GET /occurrence-charges/report` e a tela de Ressarcimentos devolvem as linhas `receiving_charge`
  com `tripId`, `stopOccurrenceId`, `noteNumber/Series/accessKey`, cliente, valor e `photos[]`
  (`slotKey`, `label`, URL assinada).
- RF6. A linha `receiving_charge` segue a máquina de estados de `delivery-charge-state.policy.ts`
  (`recorded` → `submitted`...), e só é editável enquanto `recorded` (como a 164 RF25).
- RF7. Contrato que trava D1: o tipo `unexpected_charge` não envia e-mail à contratante, não cria aviso de
  portal e não aciona o bot, mesmo que o editor de tipos tente ligar `emailsContractor`
  (validação recusa a combinação para este tipo).
- RF8. Paridade de exigência nas apps (`contrato-de-paridade`): o app lê do servidor as vagas e o modo do
  valor; o servidor recobra. Nunca reimplementar a precedência no app.
- RF9. `frontend-driver`: formulário com campo de valor, seletor de modo (por nota/agrupada) e notas (quando >1), "quem pagou" e PIX e uma vaga de foto por
  rótulo, componentes padrão do design system (rótulo em cima, campo/seletor/botões padrão).
- RF10. `frontend-transportada`: Ressarcimentos mostra as fotos rotuladas; ficha do cliente mostra o selo
  e a ação de limpar; textos em `.locale.json`, componentes do design system.
- RF11. Runbook de produção e `CLAUDE.md` da API atualizados (a migration roda em staging primeiro; em
  produção só com aprovação).

## Requisitos não funcionais

- Dinheiro em `numeric`/`bigint`, nunca float; arredondamento igual nas três apps (247).
- `companyId` sempre do contexto autenticado.
- Foto: mesmos limites e miniatura da 161/209; URL assinada, nunca pública.
- Visual: comparar com outra tela do painel e conferir prints em tema claro/escuro, desktop e celular,
  antes do PR de cada frente de tela.
- Publicação em etapas (ADR-0081 §9): painel tolerante → API → app do motorista. Staging primeiro; nada
  vai à `main` por esta spec sem aprovação.

## Casos extremos e falhas

- Falha ao gravar a linha de cobrança: o registro inteiro falha (transação); o app mantém na fila.
- Foto da placa subiu e a do comprovante não: o registro fica pendente até as duas existirem; o app
  mostra qual vaga falta.
- Valor `0`: aceito como valor (247), a linha nasce com `0` e o escritório confere.
- Nota devolvida/cancelada na mesma parada: a linha aponta a nota escolhida; sem efeito no estado da nota.
- Cliente já marcado: só atualiza a data.
- Ocorrência existente (antes da migration) do tipo: **não** é migrada para Ressarcimentos (sem valor
  nem fotos rotuladas); fica como está.
- Tipo desativado (`active = false`): a spec não liga o tipo em produção, a liberação é a do `active`.

## Critérios de aceite

- CA1. Registro sem uma das duas fotos, sem valor ou sem nota (quando >1) é recusado com o código certo.
- CA2. Registro válido cria exatamente uma linha `recorded` / `receiving_charge` em Ressarcimentos com
  viagem, ocorrência, nota, cliente, valor e duas fotos rotuladas.
- CA3. Reenvio do mesmo registro não duplica linha nem foto.
- CA4. Nenhuma saída à contratante (e-mail, portal, bot) é gerada; teste de contrato cobre.
- CA5. Cliente marcado após o registro; limpar a marca funciona e exige `delivery.manage`.
- CA6. Migration aplica e reverte em Postgres descartável (`make migration-test`).
- CA7. Prints em tema claro/escuro, desktop/celular, do formulário do motorista, de Ressarcimentos e da
  ficha do cliente, anexados em `evidence.md`.

## Dúvidas

Nenhuma aberta. Respondidas pelo Anderson em 10/11/2026: uma linha por nota ou agrupada (E4), selo ao
motorista configurável (E7), só a contratante na página de acertos (E12), comprovante do PIX opcional
ao concluir (E13).
