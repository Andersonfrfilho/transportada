# 032 — Nota de serviço municipal a partir de NF-e selecionadas

## Problema

A tela **Notas** tem um caminho só para a seleção: virar lote de CT-e. Para os destinatários de
Ribeirão Preto a transportadora não emite CT-e — emite **nota fiscal de serviço eletrônica municipal
(NFS-e)**. O serviço é o mesmo, o frete é calculado do mesmo jeito, mas o documento fiscal sai fora
do sistema: o operador soma as notas à mão, redigita a descrição no portal da prefeitura e devolve o
número da nota para o controle interno.

O custo disso é o de sempre quando o cálculo sai do sistema: valor que não bate com a regra de frete
vigente, descrição sem a lista das notas transportadas, e nenhum vínculo entre a nota de serviço e as
NF-e que ela cobre — o que torna impossível saber, depois, se uma nota já foi cobrada.

## Objetivo

1. A mesma seleção de NF-e da tela Notas pode virar **uma nota de serviço municipal**.
2. As notas selecionadas **não viram CT-e**: elas ficam **vinculadas** à NFS-e, e a lista delas entra
   na **descrição do serviço**.
3. O valor vem do **mesmo cálculo do CT-e** — regra de frete versionada mais componentes de encargo.
4. Os dados fiscais do serviço (município, CNAE, item da LC 116, alíquota de ISS) vivem num **perfil
   de emissão de NFS-e**, do mesmo jeito que `cte_emission_profiles` guarda os do CT-e.
5. A emissão é assíncrona, no mesmo trilho outbox → fila → worker que o CT-e e o MDF-e usam, e o XML
   e o PDF autorizados são arquivados como qualquer documento fiscal.

## Decisões

**Nota RP API v2, não v3.** A coleção oficial da Nota RP diz, sobre a v3: _"aplica-se apenas aos
municípios atendidos pelo emissor nacional, **exceto Ribeirão Preto** … enquanto isso utilize a nossa
versão 2"_. O `NotaRpNfseProvider` de `@adatechnology/fiscal-provider` fala **só v3**
(`/api/v3/nota/emitir`) e devolve erro explícito para município não migrado — ele não atende o caso
de uso hoje. Detalhe e alternativas rejeitadas em [ADR 0029](../../docs/adr/0029-nfse-municipal-via-nota-rp-v2.md).

**O cliente HTTP fica atrás de uma porta.** `NfseFiscalGateway` expõe `issue`/`cancel`/`fetchStatus`/
`fetchDocuments` em outcomes tipados; a Nota RP v2 é um adaptador por trás dela. Quando Ribeirão
Preto migrar para a v3, troca-se o adaptador — não a funcionalidade.

**A autorização se confirma por consulta, não por postback.** A v2 emite de forma assíncrona: o
`POST /emitir` devolve `id_nota` na hora e a autorização chega depois. A fonte da verdade é a
consulta autenticada `GET /notas/?id_nota=`, rodada por um job de cron. O `CallbackUrl` — campo
obrigatório do payload v2 — aponta para uma rota anônima que é **só gatilho**: antecipa a consulta e
nada mais. O corpo do postback nunca é lido como verdade.

**Uma NFS-e por tomador.** A seleção inteira vira uma nota de serviço quando o tomador é o mesmo, que
é o caso normal. Seleção com tomadores distintos produz uma NFS-e por tomador: nota de serviço com
dois tomadores não existe. Quem é o tomador — remetente ou destinatário — vem do perfil, no mesmo
vocabulário do CT-e (`taker` `'0'` ou `'3'`, ADR-0028).

**Nada cravado em Ribeirão Preto.** Código IBGE do município, CNAE, item da LC 116, código de
tributação municipal e alíquota são campos do perfil. O produto é genérico e instalado por
transportadora (ADR-0021); o município é configuração, não código.

**CT-e e NFS-e se excluem.** Uma NF-e vinculada a NFS-e ativa é bloqueada na seleção de CT-e, e uma
NF-e em lote de CT-e ativo é bloqueada na seleção de NFS-e. Emitir os dois para o mesmo transporte é
cobrar imposto duas vezes pelo mesmo serviço.

**A NFS-e fica fora do faturamento.** Decisão do usuário em 11/08/2026. Ela não entra em
`billing_invoices` nem na listagem de elegíveis — a nota de serviço já é o documento de cobrança.

## Comportamento

### Perfil de emissão

`nfse_emission_profiles`, um por empresa e por regra de cobrança, com `status` e `version` como o
perfil de CT-e. Campos fiscais: `municipality_ibge_code`, `cnae_code`, `service_list_item` (LC 116),
`municipal_taxation_code`, `nbs_code`, `iss_rate`, `iss_withheld`, `iss_exigibility`. Campos de
cobrança, herdados do vocabulário do CT-e: `freight_rule_id`, `taker`, `charge_component_label`.
Campos de texto: `description_template`, `description_max_length` (padrão 2000), `observations`.

Permissão `settings.manage`, escopo `company`.

### Credencial do provedor

`nfse_provider_credentials`: `provider` (`notarp`), `fiscal_environment`, `cnpj`,
`inscricao_municipal`, `secret_envelope` (token da API e segredo de webhook, cifrados no padrão do
ADR-0004) e `callback_token_sha256`. O token **nunca** volta numa resposta — o `GET` devolve máscara
e status. Escrita deixa trilha de auditoria.

### Seleção e prévia

`POST /nfse-service-invoices/preview` recebe `documentIds` e opcionalmente `emissionProfileId`.
Devolve, por tomador: as notas incluídas, a base (soma dos totais das NF-e), o valor do serviço
composto pela regra de frete vigente, o detalhamento dos componentes, o ISS calculado e a **descrição
montada**. Devolve também os **bloqueios**, no mesmo vocabulário de razões do CT-e, acrescido de
`already_linked_to_nfse` e `linked_to_active_cte_batch`.

### Descrição

O `description_template` do perfil aceita as variáveis abaixo; variável fora da lista é erro de
validação na gravação do perfil, não na emissão.

| Variável              | Origem                                                  |
| --------------------- | ------------------------------------------------------- |
| `{{notas}}`           | lista das NF-e vinculadas — número/série, uma por linha |
| `{{quantidadeNotas}}` | quantidade de NF-e vinculadas                           |
| `{{periodo}}`         | menor e maior data de emissão entre as notas vinculadas |
| `{{tomador}}`         | razão social do tomador                                 |
| `{{valorServico}}`    | valor total do serviço, formatado                       |
| `{{observacoes}}`     | `observations` do perfil                                |

O texto final é truncado em `description_max_length`, e o corte acontece **na fronteira da lista de
notas**, substituindo o excedente por `… e mais N notas` — nunca no meio de uma chave. A descrição
resolvida é **editável na tela antes de emitir**, e o que a tela mandou é o que se grava e envia.

### Emissão

`POST /nfse-service-invoices` cria a nota de serviço, grava os vínculos e as linhas de encargo, e
enfileira no outbox — tudo numa transação, sem chamada externa no request. Header `idempotency-key`
obrigatório; repetir a mesma chave com o mesmo corpo devolve a nota já criada, com corpo diferente é 409.

O worker consome, chama a Nota RP e guarda o `id_nota` devolvido; a nota fica em
`pending_authorization`. O job `nfse.status.pull` consulta as pendentes; autorizada, ele baixa XML e
PDF, arquiva em `stored_objects` e grava `nfse_fiscal_documents`; rejeitada, grava código e mensagem
da prefeitura e a nota fica em `rejected`, com as NF-e liberadas.

### Cancelamento

`POST /nfse-service-invoices/:id/cancel` com motivo. Cancelar marca `cancelled_at` nos vínculos na
mesma transação que muda o status — o mesmo desenho que o cancelamento de fatura usa para devolver o
CT-e à fila (índice parcial único sobre linha não cancelada). As NF-e voltam a ficar elegíveis, para
CT-e e para NFS-e.

## Fora de escopo

- Faturamento: a NFS-e não entra em `billing`.
- Substituição e carta de correção de NFS-e. A v2 aceita re-`POST` em `/emitir` com o `id_nota`; o
  caminho existe e entra quando for pedido.
- Emissão para município que não seja o configurado no perfil, ou provedor que não seja a Nota RP.
  A porta comporta os dois; o adaptador é um só hoje.
- Retenções federais (PIS, COFINS, INSS, IR, CSLL) por linha. O payload v2 tem os campos; enquanto
  não houver regra de negócio para preenchê-los, vão zerados.

## Critérios de aceite

- Seleção com um só tomador produz **uma** NFS-e; seleção com dois tomadores produz duas, e a prévia
  mostra os dois grupos separados.
- O valor do serviço de uma seleção é **idêntico** ao valor que a prévia de CT-e calcularia para a
  mesma seleção com a mesma regra de frete.
- NF-e já vinculada a NFS-e ativa aparece bloqueada na prévia de CT-e, e vice-versa.
- Perfil com variável desconhecida no `description_template`: 422 na gravação, citando o nome.
- Descrição que estoura `description_max_length` corta na fronteira da lista e termina em
  `… e mais N notas`; nenhuma chave aparece partida.
- `POST` repetido com a mesma `idempotency-key` e mesmo corpo não cria segunda nota.
- Resposta da Nota RP com HTTP 200 e `success:false` é tratada como falha, nunca como sucesso.
- Cancelar a NFS-e libera as NF-e vinculadas para nova seleção.
- Nenhuma resposta da API devolve o token da Nota RP; nenhum log carrega token, payload fiscal ou
  dado do tomador.
- NFS-e de outra empresa é invisível, ineditável e incancelável pela rota (contrato de isolamento).
