# ADR-0083 — A viagem diz seu tamanho e quanto já foi

- **Status:** proposta (2026-09-25). Passa a `aceita` na T0.1 da spec 198, depois de conferida contra
  o código.
- **Data:** 2026-09-25
- **Decisores:**
  - o **usuário**, em 2026-09-25, pediu duração, km, início e fim e porcentagem na app do motorista,
    e decidiu duas coisas:
    - a duração total é estrada + paradas, com o tempo de parada aprendido "conforme o espaço entre
      os eventos registrados";
    - a porcentagem conta **notas**, na app e no painel;
  - o **desenho** de cada decisão é desta ADR.
- **Spec:** `specs/198-a-viagem-diz-seu-tamanho-e-quanto-ja-foi/`
- **Estende:**
  - **spec 153 D4:** o jsonb congelado passa a guardar `depot.endKind` e `excludedStopIds` na mesma
    escrita;
  - **spec 058 D6:** a mediana do tempo de parada, decidida e nunca alimentada, ganha amostra e
    leitor. A regra não muda. A fonte da amostra, sim: os eventos com a hora do aparelho, e não
    `trip_stops.arrived_at`/`completed_at`.
- **Emenda:** spec 079. A porcentagem do painel passa de parada (`Math.round`) para nota (piso). O
  ritmo da previsão continua por parada.
- **Aplica sem revisar:** 153 D8/D9/D10, 097 D2/D7, ADR-0044, ADR-0045, ADR-0070, ADR-0075 §7/§8 e
  `specs/082-o-campo-ganha-fila-visivel-e-assinatura/` D1 (a barra da app segue por parada).

## Contexto

A rota é congelada numa escrita só (`drizzle-trip-planned-route.repository.ts:85-111`). Distância e
tempo somam todas as pernas, volta incluída. Nada disso chega ao motorista, e há quatro lacunas.

1. **O fim não é gravado.** O jsonb sabe se há trecho final (`trailingLegs`), mas não se ele vai ao
   barracão ou a um endereço.
2. **A origem configurada não tem endereço escrito.** O jsonb guarda o endereço fiscal da empresa, e
   ele só descreve a partida quando a origem veio dele.
3. **Parada sem geocódigo sai do traçado em silêncio.** O leitor usa `innerJoin`
   (`trip-stop-coordinates.support.ts:24-35`).
4. **O tempo de parada nunca foi medido.** `resolveServiceTime` existe sem chamador, e o solver usa o
   padrão de 600 s.

## Decisão

1. **A estrada vem da rota congelada, sem recalcular e sem dinheiro.** O snapshot ganha `route`
   com:
   - distância e duração;
   - o último trecho;
   - origem e fim;
   - `excludedStopCount`.

   Ficam de fora pedágio, custo, coordenada do barracão, telefone, traçado e pernas. Sem rota,
   `route: null`.

2. **A duração total é estrada + paradas medidas.** A tela mostra as duas partes e o total com "~".
   Sem medição suficiente, mostra "tempo nas paradas ainda sendo medido". Nunca mostra o padrão de
   600 s.
3. **A amostra é o espaço entre os eventos da parada.**
   - **Extremos:** vai do primeiro `arrived` ao último `delivered`/`returned`, só com
     `channel = 'driver_app'`. O início avança até o último desfecho de uma irmã (mesma viagem,
     mesmo `address_key`) que caia dentro da janela, para que dois "Cheguei" no portão não se
     contaminem.
   - **Relógio:** os dois extremos têm de usar o mesmo relógio (`captured_at` nos dois, ou
     `recorded_at` nos dois). Relógio misto fica fora.
   - **Limites:** fica fora o que dura menos de 30 s ou mais de 2 h.
   - **Agregado:** é `resolveServiceTime`, por cliente quando todas as notas da parada são dele,
     senão só pela empresa. O cliente é sempre o CNPJ/CPF do destinatário normalizado, nunca a
     `recipient_key` da 197, que é zerada quando a viagem conclui.
   - **Onde se calcula:** na leitura, com cache de 1 h por empresa, sem tabela nova. O valor vencido
     serve enquanto recalcula, e a consulta tem `statement_timeout`. Se ela falhar, o GET segue sem o
     `stopTime`, com `warn`.
   - **O que nunca é:** por motorista, nem entra na nota dele.
4. **O fim passa a ser gravado.** `depot.endKind` é gravado no congelamento, e rota antiga sai como
   `unspecified`. O fim `address` diz "término cadastrado pela empresa", e o último trecho vira
   "trecho até o término", não "volta".
5. **O início nomeia a empresa.** O endereço só aparece quando a origem é o endereço fiscal. Sem
   barracão, o início é a primeira parada medida, com aviso.
6. **As paradas fora do traçado são ditas.** `excludedStopIds` é gravado no congelamento, e a tela
   mostra "N paradas fora da conta". A rota parcial continua sendo aceita, como hoje: recusá-la seria
   decisão da 153.
7. **A porcentagem conta notas, na app e no painel.** A regra é `delivered` + `returned` sobre o
   total, com piso. A barra da app continua por parada, com legenda.

## Alternativas consideradas

- **Porcentagem por parada.** Rejeitada por três motivos:
  - repetiria a barra;
  - daria o mesmo peso a paradas de 1 e de 6 notas;
  - mudaria com a 197 sem nenhuma entrega nova.
- **Porcentagem arredondada** (`Math.round`, o painel de hoje). Rejeitada: daria 100% com uma nota
  pendente em 200.
- **Ler `end_policy` na leitura.** Rejeitada: a política pode ter mudado depois do congelamento.
- **Deduzir o fim pelo traçado.** Rejeitada: é heurística sobre o encaixe do OSRM.
- **Recusar rota parcial no congelamento.** Rejeitada aqui: mudaria a conta prevista de viagens
  planejadas, e a decisão é da 153.
- **Tempo de parada por `trip_stops.arrived_at`/`completed_at`.** Rejeitada: no app, essas colunas
  são a hora do servidor, e a fila offline colapsa as duas.
- **Tabela materializada por rotina do cron.** Rejeitada por ora: exige três apps, migration,
  handler e paridade para um número que muda devagar. A porta
  (`StopServiceTimeEstimatePort`) permite trocar depois.
- **Mediana no SQL a cada GET.** Rejeitada: roda a cada 30 s e duplica a regra.
- **Chave de cliente pela `recipient_key` da 197.** Rejeitada: a 197 a zera quando a viagem
  conclui, e as amostras vêm de viagens concluídas.
- **`captured_at ?? recorded_at` por extremo.** Rejeitada: mistura o relógio do aparelho com a hora
  da drenagem da fila, e a diferença não mede nada.
- **Deixar a falha da consulta subir.** Rejeitada: o tempo de parada é acessório, e o motorista
  perderia a viagem inteira por causa dele.
- **Mostrar os 600 s padrão sem amostra.** Rejeitada: seria número inventado.

## Consequências

- O motorista vê tamanho, início e fim, paradas fora da conta, duração e progresso, também sem rede.
- Painel e app mostram a mesma porcentagem.
- Instalação nova mostra "ainda sendo medido" até juntar amostra.
- **Rotas congeladas antes da 198** dizem "com volta" e não avisam paradas fora da conta. Viagem já
  despachada **não recongela** (o vínculo fica bloqueado, `trip-state.policy.ts:128-131`), então
  isso dura até ela fechar. A exceção é a reordenação da 192.
- `GET .../route-geometry` do painel ganha `depot.endKind`, de forma aditiva.
- Réplicas da API podem divergir por até 1 h no tempo de parada.

## Seguimentos

- **192:** `route.isFromPreviousStopOrder` (spec 198 RF9), feito por quem chegar por último.
- **Solver (058 T014) e ETA da 192 D8:** podem adotar `StopServiceTimeEstimatePort`.
- **Q3:** piso e teto da amostra, conferidos contra a distribuição medida em staging (T0.1).
