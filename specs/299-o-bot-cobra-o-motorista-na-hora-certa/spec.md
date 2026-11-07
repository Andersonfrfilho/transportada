# Feature 299 — O bot cobra o motorista na hora certa

> Ideia do dono (Anderson), decidida em 2026-11-06. Os padrões sugeridos foram aceitos e, no mesmo dia, o dono
> acrescentou: **3** cobranças antes de escalar (não 2), **o relógio recomeça a cada etapa** da parada e, no grupo, a
> cobrança **marca o motorista** (@menção) para tocar mesmo com o grupo silenciado.
> Status: fechada em 2026-11-06 (Q1 e Q2 respondidas pelo dono; ver § Dúvidas).

## Specs do mesmo assunto (lidas contra o código em `origin/staging` `42e63ccbc`, 2026-11-06)

| Spec / ADR                                                                                 | O que decidiu                                                                                                          | Situação aqui                                                                                                        |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 206 D5/D7/D11 + ADR-0088                                                                   | "Iniciar rota" grava `departed` e `trip_stops.en_route_since`; chegada zera o "a caminho"; amostra de trajeto derivada | **Usa**: a saída e a chegada são os gatilhos do relógio. Não consome a amostra de trajeto (D11 segue sem consumidor) |
| 109 / 210                                                                                  | ETA do roteiro (previsão por parada), deslocado no despacho e na chegada                                               | **Não usa nem desloca**: a previsão do lembrete é outra, interna e por etapa (D2)                                    |
| 207 + ADR-0087                                                                             | Distância e tempo da parada no app                                                                                     | Mantida; o lembrete não muda a tela                                                                                  |
| 294 RF1–RF6, RF27                                                                          | Ordem `departed → arrived → delivered/returned`; etapa pulada é marcada junto                                          | **Usa**: as respostas do lembrete chamam os mesmos caminhos; etapa marcada junto fecha o lembrete                    |
| 294 RF18/RF19                                                                              | Regra é da pessoa: tripulação × atendente                                                                              | **Usa**: o lembrete é só para a tripulação; resposta de atendente segue a regra dele                                 |
| 294 RF24 / RF30                                                                            | Localização opcional na saída; distância e chegada prevista **só** com ponto compartilhado e pela estrada do OSRM      | **Mantida para o que se mostra** (RF6). Internamente a previsão existe sempre (D2)                                   |
| 294 RF28–RF34                                                                              | Jornada do bot: bloco da parada, menu por estado, despedida só no fim, marcação do WhatsApp                            | **Usa**: o lembrete é mais um passo da jornada, com a mesma marcação e o mesmo bloco                                 |
| 292/293 (sem pasta em `specs/`; decisões no código e em `apps/api-transportada/CLAUDE.md`) | Grupo do motorista no Evolution, `GROUP_STEP_REGISTRY`, "cancelar" fecha, matrizes de isolamento                       | **Usa**: passo novo no registro, coberto pelas matrizes que já iteram o registro                                     |
| 286 RF7/RF9 (T7/T8)                                                                        | Toda fala do bot é nó `fala_*` do grafo raiz; teste de arquitetura reprova texto literal                               | **Usa**: as falas do lembrete são nós `fala_*` novos, nunca literal                                                  |
| 289                                                                                        | Envio pelo Evolution reserva vaga no intervalo mínimo; o worker espera até 120 s                                       | **Usa**: o envio do lembrete passa pela mesma vaga; sem vaga, adia (não fura)                                        |
| 062                                                                                        | Janela de 24 h da Cloud API; fora dela só template aprovado                                                            | **Usa**: fora da janela, template aprovado; dentro, texto livre                                                      |
| 223                                                                                        | Baixa sem canhoto conclui e cobra depois                                                                               | Mantida; o lembrete não cobra canhoto (isso é da 223)                                                                |
| 034 / 275                                                                                  | Notificação no sino do painel                                                                                          | **Usa** para a escalada                                                                                              |
| `/pendencias` (093, 294 T6.1)                                                              | Página de pendências por tipo                                                                                          | **Usa**: tipo novo de pendência para a escalada                                                                      |
| Memórias do dono                                                                           | Grupo mostra cliente e endereço; sem IA paga; nada novo se cifra; nada de PII em log                                   | Mantidas                                                                                                             |

## Problema e resultado

Hoje o motorista sai para uma parada e o sistema só volta a saber dele quando ele manda o próximo evento. Se ele
esquece o "Cheguei" ou a baixa, ninguém percebe até alguém abrir a viagem; a linha do tempo fica furada e o escritório
descobre o atraso pelo cliente.

Resultado: a cada etapa registrada da parada, o sistema calcula **quando a próxima etapa já deveria ter acontecido**.
Passado esse prazo sem o evento, o bot pergunta ao motorista, no canal que ele usou por último, com um menu que leva
direto ao fluxo certo. Três cobranças sem resposta escalam para o escritório (pendência e notificação no painel).
Tudo atrás de duas chaves: a da empresa (painel, padrão desligado) e a global do ambiente.

## Decisões

- **D1 — O relógio é por etapa da parada e recomeça a cada evento** (dono, 2026-11-06).
  - **Etapa `arrival`** (aberta pela saída, "Iniciar rota"/"saí", qualquer canal): pergunta "já chegou?".
    Vence em `departed_at + tempo de viagem + folga`.
  - **Etapa `settlement`** (aberta pela chegada, "Cheguei", qualquer canal): pergunta "já entregou?".
    Vence em `arrived_at + tempo de permanência` (configuração da empresa, padrão 30 min).
  - **Baixa que fecha a parada** encerra o ciclo da parada. O ciclo da próxima parada só começa quando o motorista
    **sai** para ela (a oferta da próxima rota da 294 RF31 já pergunta). Sem saída, não há lembrete.
  - O contador de tentativas zera a cada etapa.
- **D2 — A previsão interna existe sempre; a mostrada, só com ponto compartilhado.** O tempo de viagem vem do
  roteamento que já existe (OSRM), com origem, nesta ordem: ponto compartilhado pelo motorista nesta perna (o evento
  `departed` com coordenada), senão a parada anterior da viagem, senão o endereço da empresa (primeira parada).
  Roteamento falhou → duração fixa de reserva; **o lembrete sempre existe**. Na mensagem, "chegada prevista ~HH:MM" só
  aparece quando a origem foi o ponto compartilhado (regra da 294 RF30); senão a linha mostra só a hora da saída.
- **D3 — Folga** = `max(30 min, 50% do tempo de viagem)`; o piso (30 min) e o percentual são configuração da empresa.
- **D4 — Três cobranças, 30 min entre elas**, depois escalada (dono). Número e intervalo são configuração da empresa.
- **D5 — Canal**: o último que o motorista usou (grupo do Evolution, conversa individual da Meta ou app). Sem
  histórico → grupo. Uso do app não vira canal de envio (o app não recebe mensagem do bot): conta o último canal de
  WhatsApp; sem nenhum, grupo.
- **D6 — Duas chaves**: `DRIVER_REMINDERS_ENABLED` (env, padrão `false`, API e worker, padrão do
  `MDFE_AUTO_ISSUE_ENABLED`) **e** o interruptor da empresa (Configurações, padrão desligado). As duas ligadas para
  enviar. Com a global desligada nada é calculado nem gravado.
- **D7 — No grupo, a cobrança marca o motorista** (@menção, dono): o WhatsApp avisa mesmo com o grupo silenciado.
- **D8 — A menção vem do suporte de menção do grupo**, entregue antes desta spec (dono, 2026-11-06: no grupo o bot marca
  a pessoa com quem fala — toda resposta marca quem mandou o pedido, e as mensagens proativas marcam o motorista). Esta
  spec não implementa menção: o lembrete marca o motorista pelo suporte de menção do grupo (plan.md § Menção).
- **D9 — Sem ADR nova**: a feature não muda arquitetura nem revoga decisão.

## Requisitos funcionais

### Abertura, cálculo e fechamento

- **RF1** — Saída registrada (`departed`, qualquer canal e autoria da tripulação, inclusive marcada junto pela 294 RF1)
  abre o lembrete da etapa `arrival` da parada, com `expected_at` (chegada prevista) e `due_at` (D1–D3). Saída
  cancelada (`departure_cancelled`, 206 D18) cancela o lembrete aberto da parada.
- **RF2** — Chegada registrada (`arrived`, qualquer canal) fecha o lembrete `arrival` da parada (`closed_by: arrived`)
  e abre o `settlement`, com `due_at = arrived_at + permanência`.
  - Chegada **marcada junto** com a baixa (294 RF1) não abre `settlement`: a baixa vem na mesma transação.
- **RF3** — Fecham o lembrete aberto da parada, em qualquer canal (app, grupo, individual, painel):
  - baixa que fecha a parada (entregue/devolvida), cancelamento de saída, encerramento da viagem (223 RF8), parada
    removida/viagem cancelada → `closed`, sem envio;
  - ocorrência registrada na parada ou numa nota dela → `closed_by: occurrence` (a ocorrência já tem dono no escritório).
- **RF4** — Fechar é idempotente e acontece **na mesma transação** do evento que fecha; o envio no worker relê o
  estado da parada antes de mandar (RF8), então um evento que chegue entre a leitura e o envio não gera cobrança.
- **RF5** — Escritório que registra a chegada em nome do motorista (`office`: painel `stops/:stopId/arrive`, "Iniciar
  rota" da viagem, atendente pelo WhatsApp da 294 RF19) **também** abre lembrete da etapa seguinte; qualquer baixa do
  escritório fecha, como no RF3. (Q2, dono 2026-11-06.)
- **RF6** — Distância e tempo **mostrados** ao motorista seguem a 294 RF30: só com ponto compartilhado nesta viagem.

### O envio

- **RF7** — Rotina agendada no worker, a cada 5 min (padrão `trip.canhoto.read`), busca lembretes `pending` com
  `due_at <= agora`, por empresa com as duas chaves ligadas (D6).
- **RF8** — Antes de enviar, confere, nesta ordem, e adia sem consumir tentativa quando alguma falha:
  1. a parada ainda está na etapa (sem chegada para `arrival`; não fechada para `settlement`) — senão fecha;
  2. dentro do horário de funcionamento da empresa (configuração nova; feriado nacional conta como fechado (dono, 2026-11-07); faixa
     vazia = sempre aberto) — senão adia para a próxima abertura;
  3. o motorista **não** tem pergunta aberta do bot em nenhum fluxo (grupo ou individual: o mesmo portão da oferta da
     próxima rota da 294) — senão adia 5 min;
  4. vaga de envio do Evolution (289) dentro da espera do worker — senão adia para a vaga.
- **RF9** — Mensagem da etapa `arrival` (nós `fala_*`, marcação da 294 RF34; dado de terceiro escapado). **Bloco completo da
  parada** (dono, 2026-11-07): `{{blocoParada}}` é o mesmo bloco da "Chegada registrada" (294 RF28), montado pelo sistema, sem
  "Próximo passo" nem "Depois desta" (o menu 1–4 os substitui); leitura da parada no envio, da empresa e do motorista atual;
  falha na leitura (melhor esforço, como na 294) envia sem o bloco:

  ```text
  👋 Oi, @<telefone> <nome>! Já chegou na parada?
  Saída às *14:05* · chegada prevista *~14:40*

  *Parada 2 de 5*
  *NF 17234* · R$ 1.234,56
  🏪 *Cliente*
  🏢 Contratante: Contratante
  📍 Endereço da parada
  🗺️ https://www.google.com/maps/search/?api=1&query=-21.5,-47.9
  📦 3 volumes para entregar

  *1* - Cheguei
  *2* - Já entreguei (mande a foto do canhoto)
  *3* - Tive um problema (abrir ocorrência)
  *4* - Ainda estou a caminho
  ```

  A linha da previsão some sem ponto compartilhado (RF6), ficando "Saída às _14:05_". As várias notas aparecem no
  bloco (`*NFs 17234, 17235*`).

- **RF10** — Mensagem da etapa `settlement` (mesmo bloco completo da parada, dono 2026-11-07):

  ```text
  👋 Oi, @<telefone> <nome>! Já entregou na parada?
  Chegada às *14:41*

  {{blocoParada}}

  *1* - Entreguei (mande a foto do canhoto)
  *2* - Não entreguei
  *3* - Tive um problema (abrir ocorrência)
  *4* - Ainda estou descarregando
  ```

- **RF11** — As respostas delegam aos fluxos que já existem, sem regra nova:
  - `arrival`: 1 → "Cheguei" da parada (294, com o pedido de localização da RF24); 2 → "entreguei" da parada (entrega
    em preparo, com canhoto; etapas marcadas junto pela 294 RF1); 3 → ocorrência da parada; 4 → adia (RF13);
  - `settlement`: 1 → "entreguei"; 2 → "não entreguei" (294 RF33); 3 → ocorrência; 4 → adia (RF13).
  - Também valem por áudio (294 RF22) e por comando digitado ("cheguei", "entreguei 17234"), que escapa do passo.
- **RF12** — Cada envio grava `attempts + 1`, `last_sent_at`, canal e o id da mensagem; o próximo `due_at` é
  `last_sent_at + intervalo`. Sem resposta depois da última tentativa (D4) → escalada (RF17).
- **RF13** — "Ainda estou a caminho" / "ainda descarregando" (opção 4) **não consome tentativa** (Q1, dono 2026-11-06):
  adia pelo intervalo e soma em `postponements`, no máximo **3 adiamentos por etapa**. Esgotados os adiamentos, a
  opção 4 deixa de adiar: a cobrança conta como sem resposta e segue o caminho das tentativas até a escalada (RF17).
- **RF14** — Grupo: passo próprio `reminder.stage` no `GROUP_STEP_REGISTRY`, com dono e regras de isolamento: a
  pergunta mais nova é dona do "1"; comando digitado escapa; "cancelar" fecha o passo sem gravar nada e **não** fecha o
  lembrete (ele segue o relógio). As matrizes `group-{flow,inbound}-isolation` cobram o passo novo.
- **RF15** — Grupo: o lembrete **marca o motorista** da viagem pelo suporte de menção do grupo (D7, D8) — inclusive
  quando a mensagem é juntada a outro texto numa mensagem só (uma resposta, uma mensagem, PR #561), regra que é do
  suporte de menção.
- **RF16** — Conversa individual (Meta): pedido tipado `stop_reminder` com as mesmas regras de isolamento do
  individual. **Dentro** da janela de 24 h → texto livre (RF9/RF10). **Fora** → template aprovado na Meta
  ("Já chegou na NF {{1}}?" / "Já entregou a NF {{1}}?"), escolhido pelo modelo do módulo de Notificações (canal
  `whatsapp`, regra da 286), cujas respostas caem no mesmo pedido. Sem template
  aprovado configurado → cai para o grupo; sem grupo → só escala (nunca silencioso: o motivo vai para o lembrete).

### Escalada ao escritório

- **RF17** — Esgotadas as tentativas da etapa, o lembrete fica `escalated`:
  - aparece em `/pendencias` como tipo novo "Motorista sem resposta" (parada, motorista, etapa, desde quando,
    tentativas), com atalho para a viagem;
  - gera notificação no sino do painel para os responsáveis (mesma lista efetiva da 267/275).
  - A pendência some quando a etapa se resolve por qualquer canal (RF3) ou quando o escritório a dispensa.
- **RF18** — Escalada não manda mais nada ao motorista naquela etapa; a etapa seguinte (se ele registrar) começa do zero.

### Configuração e chave

- **RF19** — Configurações → bloco "Cobrança do motorista": ligado/desligado (padrão desligado), número de cobranças
  (padrão 3, 1–5), intervalo (padrão 30 min, 10–120), folga mínima (padrão 30 min) e percentual (padrão 50%),
  permanência (padrão 30 min), horário de funcionamento (dias e faixa). Permissão `settings.manage`.
- **RF20** — `DRIVER_REMINDERS_ENABLED` (padrão `false`) no schema de env da API e do worker. Desligada: a API não abre
  lembretes e a rotina do worker, que fica sempre registrada (a migration semeia a agenda; rotina ausente fecharia
  `job_run_routine_missing`), fecha o ciclo `succeeded` sem ler nada (dono, 2026-11-06).

## Requisitos não funcionais

- **RNF1 — Isolamento** dos fluxos do bot (294 RNF1): o lembrete nunca abre pergunta sobre outra aberta (RF8.3), e
  nenhuma resposta a outro fluxo é lida como resposta a ele. Contratos provam cada combinação.
- **RNF2 — Idempotência**: um lembrete aberto por (parada, etapa) — índice único parcial; reenvio do mesmo evento não
  abre outro; duas réplicas do worker não mandam a mesma tentativa (reserva atômica `FOR UPDATE SKIP LOCKED`).
- **RNF3 — Sem PII em log**: só empresa, parada, lembrete, etapa, tentativa e motivo. Nada de telefone, nome, cliente
  ou coordenada.
- **RNF4 — Sem IA paga, sem criptografia nova**, migration só aditiva (VARCHAR, sem ENUM nativo, PK UUID).
- **RNF5 — Multiempresa**: `company_id` em toda linha e toda consulta; a rotina varre por empresa.
- **RNF6 — Relógio injetável** em toda regra de prazo, para a jornada com relógio falso (T5).

## Casos extremos

- Motorista sai, volta (cancelamento) e sai de novo: um lembrete por etapa aberta; o cancelado fica no histórico.
- Saída de outra parada com uma a caminho (`TRIP_HAS_STOP_EN_ROUTE`, ou saída fora de ordem confirmada pela 294 RF25):
  o lembrete da parada abandonada fecha (`superseded`).
- Viagem trocou de motorista na rua (249): o lembrete segue a parada; o envio vai ao motorista atual.
- Roteamento fora do ar → duração de reserva (plan.md); endereço sem coordenada → reserva.
- Horário de funcionamento vazio → sempre aberto.
- Mensagem chega do motorista com hora antiga (fila do WhatsApp): vale o evento, e o lembrete fecha pelo evento.

## Fora do escopo

- Cobrar canhoto pendente depois da baixa (223).
- Mostrar o lembrete no app do motorista (o app já mostra o card da parada).
- Mudar a previsão do roteiro (109/210) ou consumir a amostra de trajeto (206 D11).
- Aviso à contratante sobre atraso.

## Critérios de aceite

1. Com as duas chaves ligadas: motorista sai às 14:05 para uma parada a 35 min; às 15:10 (35 + 30) nada chegou → o
   grupo recebe a mensagem RF9 marcando o motorista; "1" registra a chegada pelo mesmo caminho do "cheguei".
2. Chegada às 14:41 → o "já chegou?" não sai; às 15:11 sem baixa sai o "já entregou?"; "1" abre a entrega em preparo.
3. Sem resposta às três tentativas → `/pendencias` mostra "Motorista sem resposta" e o sino avisa; a baixa da parada
   pelo painel tira a pendência.
4. Com uma ocorrência aberta no grupo, o lembrete vencido espera; fechada a ocorrência, sai na próxima rodada.
5. Chave global ou da empresa desligada → nenhuma linha nova e nenhuma mensagem.
6. Conversa individual fora da janela de 24 h → sai o template aprovado; dentro → o texto livre.
7. Log da rotina sem telefone, nome, cliente nem coordenada.

## Dúvidas

- **Q1** — Respondida pelo dono em 2026-11-06: "ainda a caminho"/"ainda descarregando" não consome tentativa; adia pelo
  intervalo, no máximo 3 adiamentos por etapa; depois conta como sem resposta e segue para a escalada (RF13).
- **Q2** — Respondida pelo dono em 2026-11-06: chegada registrada pelo escritório abre o "já entregou?" como qualquer
  chegada; qualquer baixa do escritório fecha (RF5, RF3).

Nenhum `[NEEDS CLARIFICATION]` aberto.
