# ADR-0015: Cancelamento fiscal do CT-e (evento 110111) ponta a ponta

## Contexto

`POST /cte-batches/:id/cancel` cancela **o lote** — muda o status local de `draft`/`submitted` para
`cancelled` e nada mais. Para um CT-e que já foi autorizado pela SEFAZ isso é mentira contábil: o
documento continua válido no fisco, e a transportadora continua devendo o ICMS daquela prestação.

O cancelamento real é um evento fiscal: `tpEvento` 110111, transmitido no `CTeRecepcaoEventoV4`,
exigindo o **protocolo de autorização** do CT-e e uma **justificativa de no mínimo 15 caracteres**.
A SEFAZ responde `cStat` 135 (evento registrado e vinculado ao CT-e) ou uma rejeição.

Duas lacunas bloqueavam a implementação:

1. `@adatechnology/fiscal-provider` montava e assinava o `eventoCTe`, transmitia e **descartava o
   XML assinado**. `SefazCteProvider.cancel` devolvia `{ success, protocolo, rawResponse }`, e
   `rawResponse` é o objeto já parseado — não serve de arquivo fiscal. A legislação manda guardar o
   `procEventoCTe` por 5 anos, igual ao `cteProc` da autorização, e não havia o que guardar.
2. Não existia caminho de cancelamento **por item**: o `attempt_kind` `cancel` já era aceito pelo
   check constraint de `cte_issuance_attempts`, mas nenhuma rota, envelope ou consumidor o produzia.

## Decisão

### 1. Patch autorizado no `@adatechnology/fiscal-provider` (autorização explícita do usuário)

`FiscalResult` ganha `xmlEvento?: string`. Em `cStat` 135, `sendCteCancelamento` devolve o par
completo do leiaute `procEventoCTe_v3.00`:

```xml
<procEventoCTe versao="3.00" xmlns="http://www.portalfiscal.inf.br/cte">
  <eventoCTe versao="3.00">…assinado…</eventoCTe>
  <retEventoCTe versao="3.00">…retorno da SEFAZ…</retEventoCTe>
</procEventoCTe>
```

O `eventoCTe` é exatamente o fragmento assinado que foi transmitido — não é remontado — e o
`retEventoCTe` sai por recorte do envelope SOAP cru, a mesma técnica já usada em `xmlProtocolo` para
o `protCTe`. Em rejeição, `xmlEvento` fica `undefined`: não existe evento registrado para arquivar.
Changeset `minor` criado; a publicação sai pela pipeline (ADR-0014), nunca por bump manual.

### 2. O estado do cancelamento mora em `cte_fiscal_documents`

A tabela já é única por `(company_id, batch_item_id)` e já carrega `access_key` e
`authorization_protocol` — tudo que o evento 110111 exige da autorização. Cancelamento não é
documento novo; é mudança de estado do mesmo documento. Colunas adicionadas:

| coluna                                                    | quem escreve                           |
| --------------------------------------------------------- | -------------------------------------- |
| `cancellation_justification`, `cancellation_requested_at` | API, ao aceitar o pedido               |
| `cancellation_protocol`, `cancelled_at`                   | worker, após `cStat` 135               |
| `cancellation_xml_object_id`, `cancellation_xml_sha256`   | worker, após guardar o `procEventoCTe` |

Com isso o envelope do RabbitMQ continua **só com identificadores**: o worker lê chave, protocolo e
justificativa da própria linha, filtrando por `company_id`. Nenhum dado fiscal trafega na mensagem.

Check constraints: justificativa com no mínimo 15 caracteres quando presente; `status = 'cancelled'`
exige protocolo, justificativa e `cancelled_at`; `xml_object_id` e `xml_sha256` são nulos ou
presentes juntos; sha256 no formato `^[0-9a-f]{64}$` quando presente.

### 3. As colunas de XML são anuláveis — de propósito

As apps consomem a versão **publicada** do pacote (`0.3.0-rc.2`), que ainda não tem `xmlEvento`; o
campo só chega depois que a pipeline publicar a rc.3. Se `cancellation_xml_object_id` fosse
`NOT NULL`, o write-back falharia **depois** de a SEFAZ já ter registrado o evento — e o cancelamento
ficaria invisível no sistema enquanto está feito no fisco. Vale a mesma regra do XML autorizado:
falhar depois do efeito externo é pior que registrar sem o anexo. XML ausente grava evento
`reconciliation_required` com `reason: 'cancellation_xml_missing'` e o cancelamento é registrado
assim mesmo.

### 4. Um `cancel` é uma tentativa, e reaproveita a reserva

`executeCancel` cria uma linha em `cte_issuance_attempts` com `attempt_kind = 'cancel'`, reusando
`reservation_id`, série e número da tentativa autorizada — cancelar não consome numeração fiscal
nova. Novo tipo de evento de outbox `transportada.cte.item.cancel.requested`, novo evento de
domínio `cancel_requested`, e o `attempt_kind` `cancel` passa a ser aceito no outbox.

### 5. Lote com item cancelado não é lote com erro

`resolveCteBatchStatus` só devolvia `done` quando **todo** item estava `authorized`; um item
cancelado jogava o lote para `error`. Cancelar é desfecho de sucesso, não falha de emissão:
`authorized` **ou** `cancelled` em todos os itens agora resulta em `done`.

## Consequências

- o CT-e cancelado passa a ser cancelado na SEFAZ, não só na nossa tabela
- o `procEventoCTe` é arquivado no mesmo bucket e com o mesmo tratamento do XML autorizado
- enquanto a rc.3 não for publicada, o cancelamento funciona e registra
  `reconciliation_required` — o XML do evento entra sozinho quando o pacote subir
- o pacote ganha um campo novo em `FiscalResult`; é aditivo e opcional, nada quebra
- `cte_fiscal_documents` deixa de ser tabela só de autorização e passa a ser o estado fiscal do item
