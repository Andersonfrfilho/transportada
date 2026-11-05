# ADR 0113 — O ponto da chegada corrige o endereço

- **Status:** aceita pelo Anderson em 2026-11-05 (T0.1 da spec 294).
- **Data:** 2026-11-05
- **Nasce da spec 294:** para o motorista, cada parada segue **Iniciar rota → Cheguei → Entreguei / Não
  entreguei**; a etapa pulada é marcada junto, nunca recusada; e a chegada do motorista corrige o endereço sem
  localização confiável.
- **Substitui em parte:** a [ADR-0080](0080-o-ponto-do-motorista-e-sugestao-que-o-escritorio-aplica.md) §1 ("o ponto
  proposto só vira coordenada com uma decisão"), só para o ponto da **chegada** do motorista em endereço não confiável
  (§2 abaixo). O relato "Endereço incorreto" e o pino do escritório continuam como a 0080 decidiu.
- **Revoga, para o motorista:** a [spec 205](../../specs/205-o-registro-tardio-pesa-como-foto-atrasada/spec.md) **D6** (a baixa sem
  "Cheguei" nunca inventa evento `arrived`) e a [spec 206](../../specs/206-a-rota-comeca-em-cada-parada/spec.md) **D6/D8** (a ordem "Iniciar rota → Cheguei → Entreguei" é regra
  só da tela; a API aceita fora de ordem). O escritório segue como as duas decidiram.
- **Revoga:** a restrição "nada de nome de cliente nem endereço no grupo" dos cabeçalhos dos fluxos das specs 292/293.
- **Mantém:** 056 D1 (última nota fecha a parada), 156/182/223 (o escritório dá baixa retroativa e em massa), 234 (o
  momento do evento é o do toque), 206 D7 (o "Cheguei" do motorista tira as outras paradas de "a caminho") e a
  [ADR-0021](0021-one-deployment-per-company.md) (um deploy por transportadora).
- **Base factual:** `specs/294-o-motorista-segue-a-ordem-da-parada/spec.md` § "Specs do mesmo assunto" e `plan.md`
  § "Contexto e premissas", conferidos em `origin/staging` em 2026-11-05.

## Contexto

- Os eventos de campo da parada moram em **`trip_stop_events`** (`apps/api-transportada/src/database/trip.schema.ts`,
  `tripStopEvents`), com `kind ∈ {departed, arrived, delivered, returned, occurrence, departure_cancelled}`. Saída,
  chegada e baixa do motorista gravam ali pelo mesmo `recordEvent`
  (`drizzle-driver-field-report.repository.ts`). A saída também marca `trip_stops.en_route_since`
  (`markStopEnRoute`); a baixa de campo não escreve em `trip_document_events`, que é a trilha de separação.
- A chegada não exige saída (206 D6) e a baixa não exige chegada (205 D6): `completeStopIfSettled` preenche
  `trip_stops.arrived_at` sem evento. Pelo WhatsApp não há trava nenhuma; no app, a fila offline drena a entrega mesmo
  quando o "Cheguei" à frente dela foi recusado ou descartado. A linha do tempo fica sem chegada, a amostra de
  deslocamento perde dados e o escritório não sabe se o motorista esteve no local.
- A coordenada da parada vem de `geocoded_addresses` por `address_key`, com `precision`
  (`rooftop | street | postal_code | city`) e `source`. A tabela é **global**: não tem `company_id`.
- A ADR-0080 fez de todo ponto do motorista uma sugestão que o escritório aplica. A spec 195, que a realizaria, ficou em
  0/26 tasks: `trip_stop_location_suggestions` nunca foi criada. Na prática, endereço resolvido só pelo CEP ou pela
  cidade continua mandando o próximo caminhão para o centro do CEP.
- A proibição de cliente e endereço no grupo do WhatsApp estava só em comentários de código das specs 292/293; nunca foi
  decisão do dono.

## Decisão

### 1. Para o motorista, a API garante a ordem da parada e marca junto a etapa pulada

1. Vale para `authorship` `driver_app` e `whatsapp`. A sequência por parada é `departed → arrived → delivered|returned`.
2. Evento fora de ordem **nunca é recusado**. As etapas que faltam são gravadas **junto**, em `trip_stop_events`:
   - na **mesma transação** e sob a **mesma chave de idempotência** do evento pedido (reenvio cai no `recall`);
   - com a coluna nova `recorded_together boolean not null default false` = `true`;
   - com o momento do evento pedido (`tapped_at`/`occurred_at`, spec 234).
3. "Cheguei" sem saída marca `departed` junto; "Entreguei"/"Não entreguei" sem chegada marca `arrived` (e `departed`,
   se faltar) junto. A saída marcada junto não esbarra em `TRIP_HAS_STOP_EN_ROUTE`: a chegada logo em seguida já tira a
   outra parada de "a caminho" (206 D7).
4. Evento com `recorded_together = true` fica **fora** do tempo de serviço, da permanência (232), da amostra de
   deslocamento (206 D11) e não dispara o deslocamento de previsão (109).
5. O motorista é avisado de que a etapa foi marcada junto (linha na resposta do WhatsApp; aviso no app).
6. O **escritório** (`target` presente, `isOffice`) não passa pela ordem: baixa avulsa, em massa e "Encerrar viagem"
   seguem como hoje, sem evento marcado junto, com `arrived_at` preenchido como em 205 D6.

### 2. A chegada corrige o endereço não confiável; o resto vira sugestão

1. **Endereço não confiável** = sem coordenada, ou `precision` `postal_code` ou `city`.
2. No "Cheguei" de parada não confiável, com o ponto do motorista:

   | Endereço atual                 | Ponto da chegada             | Resultado                            |
   | ------------------------------ | ---------------------------- | ------------------------------------ |
   | `postal_code`                  | até **2 km** do ponto atual  | grava direto em `geocoded_addresses` |
   | `city`                         | até **15 km** do ponto atual | grava direto em `geocoded_addresses` |
   | `postal_code` / `city`         | fora da tolerância           | sugestão ao escritório               |
   | sem coordenada                 | qualquer                     | sugestão ao escritório               |
   | confiável (`rooftop`/`street`) | a mais de **300 m**          | sugestão ao escritório               |
   | confiável (`rooftop`/`street`) | até 300 m                    | nada                                 |

3. A gravação direta usa o mesmo caminho da correção do operador (084), com `origin = 'driver'`,
   `precision = 'rooftop'`, `source = 'driver'`, trilha em `geocoded_address_corrections` e evento na linha do tempo da
   parada (228 estendida). As próximas viagens para o mesmo endereço já saem com o ponto novo.
4. **Endereço confiável nunca é sobrescrito** pela chegada.
5. A sugestão vai para `address_correction_suggestions` (com `company_id`) e aparece em `/pendencias`, onde o escritório
   aplica ou descarta. Correção idempotente pela chave `address-correction:<eventId>`.
6. **Escopo do dado:** `geocoded_addresses` é global, então a correção direta vale para todas as empresas do ambiente.
   Isso é aceitável porque a distribuição é um deploy por transportadora (ADR-0021). A sugestão carrega `company_id` e o
   painel só lista as da empresa do token.
7. O ponto copiado para o cadastro é dado de endereço; o vínculo com o motorista fica só no evento de auditoria
   (ADR-0081).

### 3. O grupo do WhatsApp mostra cliente e endereço

As listas de escolha ("Qual parada?", "Qual nota você entregou?"), os resumos e a oferta da próxima rota passam a trazer
o nome do cliente e o endereço. Os cabeçalhos e comentários que proíbem isso saem do código. Continua valendo a regra de
log sem PII (coordenada, endereço e nome nunca em log).

### 4. Um fluxo do bot nunca atrapalha o outro

1. Só **um pedido aberto** por grupo ou conversa (índice único que já existe). A oferta da próxima rota e o pedido de
   localização só abrem pedido quando não há outro aberto; havendo, a frase sai sem pergunta ("Quando for, mande
   _saí_.").
2. "1"/"2" e textos respondem só ao pedido aberto, e quem trata é o fluxo dono dele.
3. A localização compartilhada é consumida por **uma** ação; a chegada vem antes da entrega em preparo da mesma parada.
4. Cada combinação (ocorrência aberta, entrega em preparo, escolha de parada, oferta da próxima rota) tem contrato de não
   interferência.

## Consequências

- A linha do tempo da parada passa a ter saída e chegada sempre que o motorista deu baixa, com "marcada junto" quando
  ele pulou a etapa; as estatísticas não recebem amostra falsa.
- O escritório não perde nada: retroativo e em massa seguem iguais.
- Endereço resolvido só por CEP ou cidade se corrige com o uso, sem trabalho do escritório, desde que o ponto esteja
  dentro da tolerância.
- **O custo:** coluna `recorded_together` em `trip_stop_events`, tabela `address_correction_suggestions`, os `perform`
  de saída e chegada extraídos para serem chamados dentro de outra transação, uma política pura para a ordem e outra para
  a correção, e um item novo em `/pendencias`.
- **O risco aceito:** um ponto ruim dentro da tolerância move o endereço para todas as empresas do ambiente. A tolerância
  é o raio que a própria precisão atual já admite, e endereço confiável nunca é tocado.
- Eventos anteriores ao deploy não são reescritos: o histórico continua sem etapa marcada junto.

## Alternativas descartadas

| alternativa                                                  | por que não                                                                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Recusar o evento fora de ordem                               | o motorista na rua contorna a recusa e a entrega some do sistema; o dono decidiu marcar junto                   |
| Manter a ordem só na tela (206 D8)                           | o WhatsApp e a fila offline já furam a tela; a regra precisa morar onde todos os canais passam                  |
| Gravar a etapa pulada com a hora do servidor                 | contradiz a 234 e põe a chegada depois da entrega na linha do tempo                                             |
| Aplicar a ordem também ao escritório                         | quebraria a baixa retroativa e em massa (156/182/223), que é trabalho de fim de dia                             |
| Todo ponto do motorista como sugestão (ADR-0080 inteira)     | o endereço por CEP ou cidade nunca melhora, porque a fila de sugestões não é tratada; a 195 nunca saiu do papel |
| Sobrescrever também endereço confiável                       | um GPS de galpão moveria um ponto que já estava certo; longe de um ponto confiável é dúvida para o humano       |
| Colocar `company_id` em `geocoded_addresses`                 | a instalação é dedicada (ADR-0021); dividir o cadastro por empresa duplicaria geocodificação sem ganho          |
| Abrir a oferta da próxima rota mesmo com outro pedido aberto | o "1" do motorista cairia no fluxo errado; um pedido aberto por grupo é a regra que já existe                   |
