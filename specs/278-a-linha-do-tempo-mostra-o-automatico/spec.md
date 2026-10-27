# Feature 278 — A linha do tempo mostra o automático

Pedido do dono (Anderson, 21/10/2026), desenho aprovado no preview antes da implementação. Estende a 276 (a resposta da
contratante se confere), a 248 (retorno da contratante) e a 183 RF19 (linha do tempo da ocorrência); não recria nada delas.

> Numeração: o pedido chamava esta pasta de `277-…`, mas a 277 já existe em `staging`
> (`277-a-lista-de-ocorrencias-tem-busca-rapida`). Esta é a 278.

Specs lidas antes (mesmo assunto): 183, 248, 266, 274, 275, 276 e 277 (`tasks.md`/`evidence.md` conferidos no código).

## Problema e resultado

O que o sistema faz sozinho com o retorno da contratante não aparece na linha do tempo da ocorrência. A conferência do
boleto (276 T2) só deixa rastro quando **falha**, e como motivo da etapa (`document_not_confirmed`); o acerto não grava
nada. A entrega ao motorista (`occurrence_contractor_reply_deliveries`) e a leitura dele não são lidas pela linha do tempo.
A resposta "Solicitado" sem anexo (276 T1) aparece como uma resposta qualquer.

Resultado: a linha do tempo do painel mostra, com ator **Sistema**, "Boleto conferido" (marco), "Boleto não conferido"
(com o motivo, e "PDF sem texto para conferir" quando nada foi lido), "Boleto entregue ao motorista" (marco) ou "Falhou a
entrega ao motorista" (motivo e tentativa); com ator **Motorista**, "O motorista leu o boleto"; e o e-mail sem anexo que
deixou o retorno aguardando diz isso. Um filtro novo, **Automático**, mostra só o que o sistema fez.

Na aba Tipos de `/ocorrencias`, salvar a edição de um tipo existente (inclusive o bloco "Salvar retorno") confirma com
"Configuração salva. Vale para as próximas ocorrências.", no mesmo estilo do aviso de tipo criado.

## Fora do escopo

Mudar a decisão do retorno (`decideContractorReply`) ou o motivo gravado no retorno (`occurrence_contractor_replies.reason`
continua `document_not_confirmed`); mostrar a etiqueta "NOVO" do preview; app do motorista e portal (não leem esta rota).

## Decisões

- **D1** O resultado da conferência fica no histórico do retorno que já existe: `occurrence_contractor_reply_events.reason`.
  Motivos novos, **só do evento** (`CONTRACTOR_REPLY_EVENT_REASONS`): `document_confirmed` (na transição de aceite) e
  `document_without_text` (na ida ao operador quando o PDF não trouxe texto ou não havia leitor). O retorno segue com
  `document_not_confirmed`. A CHECK do evento é montada da lista e alarga por migration aditiva na API
  (`20261021120000_contractor_reply_event_document_reasons`); o worker tem a cópia por valor da constante.
- **D2** Quem escolhe o motivo do evento é uma função pura da política (`resolveContractorReplyEventReason`), cópia
  idêntica na API e no worker (paridade byte a byte) — o repositório só passa se conferiu e se leu texto.
- **D3** A linha do tempo ganha três tipos de evento (`contractor.reply.document`, `contractor.reply.delivery`,
  `contractor.reply.driver_read`) e o `contractor.mail.received` ganha `attachmentCount` e `awaitingAttachment`. O painel
  publicado descarta tipo desconhecido (266 T1.2) e ignora campo a mais: a API pode ir antes do painel.
- **D4** A leitura do motorista é o `status_times.read` da mensagem que a entrega gravou no chat do app (a escada `app` da
  183 RF14). Sem `read`, nada aparece.
- **D5** A tentativa é a ordem da entrega ao motorista (app ou WhatsApp) dentro do retorno, por `created_at`.
- **D6** "Sem anexo. Segue aguardando o boleto." só quando o e-mail chegou sem anexo na conversa com o retorno ainda
  aguardando (`awaiting_contractor`/`overdue`) — o caso que a 276 T1 ignora.
- **D7** O aviso de edição salva vem do hook do cadastro (`useOccurrenceTypeCatalogPanel`), só depois do `PUT` de um tipo
  existente dar certo; some quando outro salvamento começa ou quando um tipo é criado.

## Critérios de aceite

- **CA1** `resolveContractorReplyEventReason`: aceite conferido → `document_confirmed`; recusa conferida sem texto →
  `document_without_text`; com texto → `document_not_confirmed`; sem conferência → o motivo da decisão (paridade).
- **CA2** Contra Postgres (API e worker): o boleto certo grava `document_confirmed` no evento; o PDF da nota grava
  `document_not_confirmed`; sem leitor/sem texto grava `document_without_text`; o retorno guarda `document_not_confirmed`.
- **CA3** Política pura da linha do tempo: eventos novos na ordem certa no mesmo instante (conferência → recebido →
  entrega → entregue), marcos, `awaitingAttachment` e etapas inalteradas.
- **CA4** Contra Postgres: a linha do tempo lê a entrega (nome do motorista, canal, tentativa), a falha, a leitura e a
  conferência; outra empresa não lê nada.
- **CA5** Painel: frases e detalhes pt-BR/en, filtro Automático só com ator Sistema, parser tolerante; aviso
  "Configuração salva…" depois da edição.
