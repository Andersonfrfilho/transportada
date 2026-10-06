# Spec 229 — A fila avisa o que está parado há dias

## Problema

O app do motorista só envia com ele aberto (sem Background Sync, ADR-0075 §8), e desde a spec 227
nada sai da fila por idade. Quem fecha o app sem sinal e esquece não tem como saber que o trabalho
dele não chegou ao escritório: a fila segura o dado, mas ninguém avisa.

Decisão do usuário (02/10/2026), entre três opções: **uma faixa de aviso para o que está parado há
dias, sem apagar nada**.

## Decisões

- **D1 — Limite de 24 horas.** Com o app aberto a drenagem tenta a cada 30 s; parado há mais de um dia
  é anormal. Constante nomeada `STALE_PENDING_AFTER_MS`, fácil de ajustar. Exatamente 24 h ainda não
  avisa.
- **D2 — Conta só o que ainda pode subir sozinho.** Item na fila ou com falha de rede (`queued`,
  `failed`) e o grupo de anexos órfão (`proof`). Recusado e não verificado ficam de fora: já têm aviso
  e decisão próprios.
- **D3 — A faixa mora no topo da viagem**, acima do "N aguardando envio", em cobre (o mesmo do "na
  fila" do cartão) com o relógio — não em vermelho: o item ainda sobe. Diz quantos e **desde quando**
  (data e hora do mais antigo) e o que fazer: "Abra o app com sinal". Todo ela é um botão que leva à
  tela de pendências.
- **D4 — A tela de pendências mostra a data do item que não é de hoje.** Antes só a hora: "03:34 PM"
  num item de dois dias atrás soava como hoje (`formatQueuedAt`).
- **D5 — Só avisa.** Nada é apagado, enviado ou bloqueado por causa da faixa.

## Fora de escopo

- Aviso ao escritório (heartbeat do aparelho), `navigator.storage.persist()` e Background Sync —
  propostas do levantamento, não escolhidas.
- Notificação do sistema (push) quando o app está fechado: o app fechado não roda nada (spec 147).
- Legado `/minha-viagem`: está em extinção e ganha "sem prazo" pela 227, mas não a faixa.

## Critérios de aceite

- **CA1** Item parado há mais de 24 h aparece na faixa, com a contagem e a data do mais antigo.
- **CA2** Exatamente 24 h, fila vazia, recusado e não verificado não aparecem.
- **CA3** Item de outro dia mostra a data na tela de pendências; o de hoje, só a hora.
- **CA4** A faixa leva à tela de pendências.
