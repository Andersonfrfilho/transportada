# 059 — o MDF-e nasce da viagem completa

> **Depende da 056** (o estado `dispatched` é o gatilho e a garantia).

## Problema e resultado

A emissão de MDF-e já funciona: `mdfe_manifests` existe, `POST /trips/:id/mdfe-manifests` existe, a
trilha de outbox → RabbitMQ → `fiscal-provider` está viva (ADR-0016), e `mdfe_manifests.trip_id` já
aponta para a viagem. O que não existe é a **regra que decide quando a viagem está pronta para
manifestar** — e o custo disso é caro do jeito específico que só o fiscal é: o manifesto declara à
SEFAZ quais CT-e vão naquele veículo. Manifestar cedo é declarar documento que ainda não existe;
manifestar tarde é caminhão na estrada sem MDF-e, que é multa e retenção em barreira.

Hoje quem decide é uma pessoa olhando duas telas: a de viagem e a de lote de CT-e. Existe até um
`TripMdfePendingDialog` no frontend — ele é a evidência do problema, não a solução.

O resultado é a viagem que sabe se está completa: para cada nota vinculada, existe um CT-e
autorizado; quando a última chega, o manifesto é ofertado (ou emitido) sozinho, com o veículo, os
condutores e os municípios de carregamento e descarregamento que a viagem já conhece.

## Fora do escopo

- Mudar a emissão de MDF-e. Ela funciona; esta feature só decide _quando_ chamar.
- Emitir CT-e. A 007/008/012+ já fazem, e a viagem só observa.
- Encerramento de MDF-e ao fim da viagem (`MDFE_ATTEMPT_KINDS` já tem `close`) —
  ver **Dúvidas**: é o candidato natural à próxima spec.

## Decisões

### D1 — Completude é uma consulta, não uma flag

Nasce `GET /trips/:id/fiscal-readiness`, e ela responde **por nota**, nunca só sim/não:

| Nota        | CT-e                    | Situação         |
| ----------- | ----------------------- | ---------------- |
| chave …1234 | autorizado, chave …5678 | ok               |
| chave …9012 | em lote, `issuing`      | aguardando SEFAZ |
| chave …3456 | rejeitado, cStat 539    | **bloqueia**     |
| chave …7890 | nenhum                  | **bloqueia**     |

Uma flag booleana em `trips` seria mais rápida de ler e impossível de confiar: ela dessincroniza
quando um CT-e é cancelado, e um manifesto emitido sobre flag velha é declaração falsa à SEFAZ. A
consulta lê o estado real de `cte_fiscal_documents` toda vez.

A mesma consulta alimenta a lista de **notas retornadas com CT-e ativo** da 056 D8 — é o mesmo
caminho de índice, e construí-lo duas vezes seria construí-lo diferente.

O que ela não faz é ser lenta: um índice de `cte_fiscal_documents` pela chave da NF-e (via
`cte_batch_item_documents`) resolve as N notas em uma consulta. Se não existir esse caminho de
índice hoje, criá-lo é parte desta feature.

### D2 — O gatilho é evento, não varredura

Quando um CT-e é autorizado, o worker já escreve `cte_fiscal_documents`. Ali mesmo nasce um evento
`cte.authorized.v1`, e um consumer novo pergunta: _a viagem dessa nota ficou completa?_ Se ficou,
age.

O cron varrendo viagens abertas de minuto em minuto seria mais simples de escrever e erraria pelos
dois lados: atrasa o caminhão que está com o motor ligado e desperdiça consulta em viagem que não
mudou. O evento já existe no fluxo; só falta escutá-lo.

### D3 — Automático é opção, e a opção é da empresa

`automatic_mdfe_on_completion` na configuração fiscal da empresa, **desligado por padrão**:

- **Desligado**: a viagem completa vira notificação e um botão que pisca. A pessoa aperta.
- **Ligado**: o manifesto é emitido sozinho ao ficar completa.

Emissão fiscal automática é ação irreversível contra órgão público — cancelar MDF-e tem janela e
regra própria. Ligar isso por padrão para todo cliente é decidir pelo cliente algo que custa
dinheiro dele quando erra. Quem liga, liga sabendo, e a trilha grava quem ligou (`security.md` §10).

Mesmo ligado, a emissão automática **só dispara com a viagem em `dispatched`** (056 D2). É a garantia
que fecha o buraco: depois de `dispatched` nenhuma nota entra ou sai, então o conjunto declarado no
manifesto não pode mudar por baixo dele.

### D4 — O manifesto se preenche da viagem, e o que ele não sabe ele pergunta

Da viagem saem, sem digitação: veículo (`trips.vehicle_id` → placa, RENAVAM, tara, capacidade),
condutores (`trip_drivers`, com o mesmo teto de 10 do ADR-0016 §1), os CT-e (via readiness),
município de carregamento (endereço da empresa/filial), municípios de descarregamento (das paradas
da 056 — e `mdfe_manifest_loading_cities` já limita a 50).

O que a viagem não sabe: seguro da carga, tipo de carga quando ambíguo, produto predominante, valor
do vale-pedágio. Esses vêm do perfil de emissão da empresa quando houver padrão, e o diálogo só
pergunta o que sobrar — a tela pede **o resto**, não tudo de novo.

### D4b — O gatilho é a nota, e o `freight_calculations` não é caminho de MDF-e

A viagem é montada **pelas NF-e**, e é o CT-e delas que fecha a prontidão. Viagem que carregue
`freight_calculations` (o XOR que `trip_documents` permite) não tem CT-e por nota e, portanto, não
tem o que manifestar por este caminho: a readiness declara isso explicitamente em vez de ficar
`incomplete` para sempre, que é como uma viagem some da lista sem ninguém entender.

### D4c — O manifesto fica disponível para conferência, sempre

Emitido não é arquivado. Todo MDF-e da viagem fica acessível **da própria viagem**: número, chave,
status, e o XML e o DAMDFE para download por presigned URL curta (o bucket privado e os
`stored_objects` já fazem isso com o XML da NF-e).

O motivo é prosaico e é o que mais acontece: fiscalização em barreira, dúvida do contador, conferência
antes de encerrar. Um documento fiscal que existe e não pode ser aberto na tela em que ele foi gerado
manda a pessoa procurar no portal da SEFAZ — e é isso que faz o produto ser contornado.

Vale para os manifestos **cancelados e rejeitados** também: eles ficam listados com o motivo, porque
"por que esse não valeu?" é exatamente a pergunta que se faz depois.

### D5 — Mais de 50 municípios de descarregamento é caso real, e ele é recusado com nome

O layout do MDF-e limita a 50. Uma viagem de distribuição capilar passa disso. A recusa acontece
**na validação da viagem**, com a lista dos municípios e a sugestão de dividir em duas viagens —
nunca como rejeição da SEFAZ traduzida do jeito que a SEFAZ fala.

## Histórias priorizadas

**P1 — a viagem diz o que falta**
_Dado_ uma viagem com 10 notas, 8 com CT-e autorizado,
_quando_ o operador abre a viagem,
_então_ vê "8 de 10 prontas" e, por nota faltante, o motivo: sem CT-e, em processamento, ou
rejeitado com o cStat e a mensagem.

**P1 — a última autorização acende o botão**
_Dado_ essa viagem em `dispatched` e a autorização do décimo CT-e chegando,
_quando_ o consumer processa o evento,
_então_ a viagem é marcada como fiscalmente pronta e uma notificação avisa quem despachou.

**P1 — emitir com um toque**
_Dado_ uma viagem pronta,
_quando_ o operador emite,
_então_ o manifesto nasce com veículo, condutores, CT-e e municípios preenchidos, e o diálogo só
pede o que falta.

**P2 — automático para quem escolheu**
_Dado_ a empresa com `automatic_mdfe_on_completion` ligado,
_quando_ a viagem fica pronta em `dispatched`,
_então_ o manifesto é emitido sozinho e a notificação diz o resultado, não o convite.

**P2 — um CT-e é cancelado depois do manifesto**
_Dado_ um MDF-e autorizado,
_quando_ um dos CT-e é cancelado,
_então_ a viagem é marcada como divergente, com alerta em destaque e a lista do que diverge. O
sistema **não** cancela o manifesto sozinho — isso é decisão fiscal humana.

**P2 — nota rejeitada não trava o dia**
_Dado_ uma nota com CT-e rejeitado,
_quando_ o operador a desvincula (viagem ainda não `dispatched`),
_então_ a readiness recalcula e a viagem pode seguir sem ela.

**P3 — o painel de viagens mostra o semáforo**
Coluna de prontidão fiscal na lista de viagens, filtrável por "prontas para manifestar".

## Requisitos funcionais

1. `GET /trips/:id/fiscal-readiness` conforme D1, com código estável por motivo de bloqueio.
2. Índice/caminho de consulta NF-e → CT-e autorizado, se ainda não existir.
3. Evento `cte.authorized.v1` publicado na autorização, e consumer `trip-fiscal-readiness` com a
   trilha padrão de retry/`processed_messages`/dead-letter.
4. `trips` ganha `fiscal_readiness_state` (`incomplete|ready|manifested|divergent`) — **derivado e
   recalculado**, nunca autoritativo: a resposta de D1 é sempre a verdade, esta coluna é índice para
   filtrar lista.
5. `automatic_mdfe_on_completion` no perfil fiscal da empresa, com trilha de quem alterou.
6. `POST /trips/:id/mdfe-manifests` passa a aceitar corpo parcial e completar o resto da viagem
   (D4), recusando por `409` se a readiness não estiver `ready`.
7. Validação dos 50 municípios antes da emissão (D5).
8. Notificação (o provider `@adatechnology/notification-*` já existe) no "ficou pronta", no
   "emitido" e no "divergiu".
9. Frontend: painel de prontidão na tela de viagem, evoluindo o `TripMdfePendingDialog`; coluna e
   filtro no `TripTable`.
10. Lista de manifestos da viagem (D4c) com download de XML e DAMDFE, incluindo cancelados e
    rejeitados com motivo.

## Requisitos não funcionais

- A readiness de uma viagem de 200 notas responde sem N+1.
- O consumer é idempotente: o mesmo `cte.authorized` duas vezes não emite dois manifestos. Duplicar
  MDF-e é incidente fiscal, não bug de tela.
- **Trava de concorrência na emissão automática**: duas autorizações chegando no mesmo instante não
  podem disparar duas emissões. Lock por viagem, ou unique parcial em `mdfe_manifests` por
  `(trip_id)` para manifesto vivo.
- Nenhuma chave de acesso nem dado de participante em log — id opaco (`security.md` §1).
- Falha de emissão automática nunca é silenciosa: vira notificação e fica visível na viagem.

## Casos extremos e falhas

| Caso                                             | Comportamento                                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Viagem sem nenhuma nota                          | Readiness `incomplete`; não existe manifesto vazio.                                                                    |
| Viagem só com `freight_calculations` (sem NF-e)  | Readiness declara que não há o que manifestar por este caminho (D4b). Não fica `incomplete` para sempre. |
| CT-e autorizado depois de a viagem ser cancelada | Consumer ignora e registra.                                                                                            |
| Viagem `draft` fica completa                     | Readiness vira `ready`; emissão automática **não** dispara (D3). O botão manual fica disponível? — ver Dúvidas.        |
| Manifesto rejeitado pela SEFAZ                   | Estado volta a `ready`; erro visível com cStat traduzido; retry pela trilha que já existe.                             |
| Nota desvinculada depois do manifesto autorizado | Impossível: `dispatched` bloqueia (056 D2). Se o vínculo mudar por caminho administrativo, `divergent`.                |
| Mais de 50 municípios                            | D5.                                                                                                                    |
| Empresa sem certificado válido                   | Readiness `ready`, emissão recusada com código próprio antes de tocar a fila.                                          |

## Critérios de aceite

- [ ] Teste de readiness para cada motivo de bloqueio.
- [ ] Teste de idempotência do consumer.
- [ ] Teste de concorrência: dois eventos simultâneos → um manifesto.
- [ ] Teste de que automático não dispara fora de `dispatched`.
- [ ] Teste de divergência por cancelamento de CT-e.
- [ ] Teste de recusa acima de 50 municípios.
- [ ] Teste de que o XML e o DAMDFE são recuperáveis da viagem, inclusive de manifesto cancelado.
- [ ] E2E: viagem → CT-e para todas as notas → despacho → prontidão → emissão → manifesto
      autorizado com veículo, condutores e municípios corretos.
- [ ] `tsc --noEmit` + `make validate`.
- [ ] ADR (**0045**) — e ele revisa o ADR-0023 ("a viagem não fala com a SEFAZ"): a viagem continua
      sem falar, mas passa a **saber quando** e a poder pedir. A distinção precisa estar escrita, ou
      a próxima pessoa lê o 0023 e conclui que esta feature o viola.
- [ ] `docs/spec/fiscal-integration.md` atualizado.

## Dúvidas

- `[NEEDS CLARIFICATION: encerramento do MDF-e. 'close' já existe em MDFE_ATTEMPT_KINDS. Quando a viagem vai a 'completed' (056), o encerramento deve ser automático? Manifesto não encerrado é pendência na SEFAZ e trava o próximo. Isto pode ser P3 desta spec ou a spec 060.]`
- `[NEEDS CLARIFICATION: emissão manual de MDF-e em viagem 'draft'/'route_planned' — permitir ou exigir 'dispatched' também no manual? Exigir é mais seguro e pode conflitar com a prática de emitir antes de o caminhão sair. Qual é a operação real?]`
  > **Fechado:** a operação é de chassi único, sem composição cavalo+carreta (056 D6). O manifesto
  > declara um veículo de tração e nenhum reboque. Se a frota mudar, a 056 D6 descreve o que nasce.

## 🤖 Modelo

| Etapa                                      | Modelo    |
| ------------------------------------------ | --------- |
| Regra de prontidão, concorrência, ADR-0045 | `opus` 🧠 |
| Consumer, rotas, readiness, testes         | `sonnet`  |
| Painel e filtro                            | `sonnet`  |
