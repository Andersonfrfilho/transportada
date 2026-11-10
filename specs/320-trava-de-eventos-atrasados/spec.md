# Spec 320 — Evento velho do app do motorista fica retido para o escritório liberar

## Problema e resultado

Em 10/11/2026 o app de um motorista (usuário 87) começou a reenviar eventos e ocorrências pedidos havia muito tempo, que o escritório e o bot já tinham tratado de outro jeito. Tudo entrou como novo e duplicou.

Causa lida no código (a confirmar com os dados de produção, T0.1):

1. A fila offline do app (`offlineQueue.service.ts`) reenvia tudo, sempre, sem limite de idade. A spec 229 só avisa ("parado há mais de 24 h") e a 227 proíbe apagar por idade.
2. O servidor só reconhece repetição pela chave de idempotência do toque (`trip_field_reports`). Se o mesmo fato foi registrado por outro caminho (painel, bot, WhatsApp), a chave do app é nova e o evento entra como novo.
3. A ocorrência de nota não leva a hora do toque (o esquema é `.strict()`), então o servidor grava a hora da chegada: a ocorrência velha aparece como de hoje.

**Resultado:** ocorrência do app cuja data do toque não é a do dia em que chega **não é aplicado**. Fica retido, o escritório vê em `/pendencias` e decide **Liberar** (aplica com a hora original do toque) ou **Descartar**. Se o fato já consta no sistema, a retenção avisa que é provável duplicata.

## Decisões (propostas, aguardam OK do Anderson)

- **D1 — A trava é no servidor.** O PWA instalado pode ser um build antigo; só o servidor garante.
- **D2 — Regra "mesma data".** Compara o dia do toque corrigido (`tappedAt + clockOffsetMs`) com o dia do recebimento, no fuso `America/Sao_Paulo`. Dias diferentes **e** mais de 3 h entre toque e recebimento: retém (tolerância de 3 h confirmada pelo Anderson). A tolerância evita reter o toque das 23:58 recebido às 00:03.
- **D3 — O que é retido (decisão do Anderson, 10/11/2026): só ocorrências** do motorista pelo app (`channel = driver_app`): ocorrência de parada e ocorrência de nota. Chegada, saída, baixa, retorno e comprovante seguem como hoje nesta spec. Escritório e WhatsApp nunca são retidos.
- **D4 — Retido não é recusado.** O servidor responde `202` com `held: true`. O app trata como entregue e tira da fila (recusa de negócio faria o motorista descartar; erro de rede faria reenviar para sempre) e mostra "enviado ao escritório para conferência".
- **D5 — Duplicata provável.** Ao reter, procura o mesmo fato já registrado entre o toque e o recebimento, por qualquer canal: mesma parada e tipo de evento, ou mesma nota e mesmo tipo de ocorrência. Achando, o painel mostra "provável duplicata de <registro>" com Descartar sugerido. Liberar continua possível.
- **D6 — O app manda a hora do toque também na ocorrência de nota** (`tappedAt` e `clockOffsetMs` opcionais). Sem o campo o servidor não retém (comportamento de hoje), para não quebrar build antigo.
- **D7 — Liberar aplica com a hora original** (`occurredAt` = toque corrigido), pelo mesmo caminho do relato e a mesma chave de idempotência. Liberar duas vezes não duplica. Descartar guarda quem, quando e por quê.
- **D8 — Interruptor por empresa**, desligado por padrão. Primeiro staging; produção só com aprovação.
- **D10 — Quem libera (decisão do Anderson): só o escritório.** Liberar e descartar exigem a permissão de gestão de viagens do escritório; atendente e motorista não liberam.
- **D9 — A liberação roda as validações da spec 315** com a hora do toque; falhou, o item continua retido com o motivo.

## Fora do escopo

- Apagar ou cancelar a duplicação que já está em produção (decisão separada, com OK do Anderson depois da leitura dos dados).
- Mudar a fila do app para apagar por idade (a 227 segue valendo).
- Reter eventos do escritório ou do bot.
- Reter chegada, saída, baixa, retorno e comprovante (ficam para uma spec futura, se a medição do T0.1 mostrar necessidade).

## Histórias priorizadas

### P1 — Evento velho retido

**Given** o app guardou uma ocorrência há 2 dias **When** o motorista abre o app com sinal **Then** o servidor responde `202 held`, nada é aplicado e o item some da fila.

### P1 — Escritório decide

**Given** há itens retidos **When** o operador abre `/pendencias` **Then** vê motorista, nota ou parada, tipo, hora do toque, hora do recebimento e provável duplicata, e escolhe Liberar ou Descartar.

### P2 — Mesmo dia passa direto

**Given** toque e recebimento no mesmo dia (ou com menos de 3 h) **Then** nada muda.

## Requisitos funcionais

- RF1 Tabela `trip_field_report_holds` (empresa, chave, operação, payload validado, ator, toque, recebimento, estado `held|released|discarded`, duplicata provável, decisor, decidido em, motivo).
- RF2 Rotas para listar, liberar e descartar (permissão `trip.manage`).
- RF3 Reenvio da mesma chave retida devolve o mesmo `202`, sem segunda linha.
- RF4 O contador "N aguardando" do app não conta item retido.
- RF5 Interruptor por empresa.

## Requisitos não funcionais

- Migration só aditiva, sem backfill.
- Teste de contrato antes do código; integração para liberar de forma idempotente.
- Painel com os componentes padrão do design system, conferido em tema claro e escuro, desktop e celular.

## Casos extremos e falhas

- Relógio do aparelho errado: vale a correção `clockOffsetMs`; correção descartada (futuro ou velha demais) segue a regra da spec 234.
- Item retido de motorista que já saiu da viagem: Liberar falha com motivo e o item continua retido.

## Critérios de aceite

- CA1 Ocorrência de nota com toque de 2 dias atrás, interruptor ligado: `202 held`, zero linhas em `trip_document_occurrences`.
- CA2 Toque às 23:58 recebido às 00:03: aplicado.
- CA3 Mesmo fato já registrado pelo painel: retenção marcada como provável duplicata.
- CA4 Liberar cria o registro com a hora do toque; liberar de novo não cria outro.
- CA5 Descartar não cria nada e fica auditado.
- CA6 Interruptor desligado ou build sem `tappedAt`: comportamento atual.

## Dúvidas

Nenhuma aberta. Decididas pelo Anderson em 10/11/2026: tolerância de 3 h; retenção só para ocorrências; só o escritório libera.
