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
2. No "Cheguei" **em tempo real** da tripulação, com o ponto do motorista (emenda da revisão final, 2026-11-05 — "se
   for tardio não pede"). **Preciso** = precisão do aparelho até **50 m** quando a fonte a informa (o app); o ponto
   compartilhado pelo WhatsApp não traz precisão e, em tempo real, vale como preciso (decisão do dono, 2026-11-05):

   | Endereço atual                         | Ponto da chegada                               | Resultado                            |
   | -------------------------------------- | ---------------------------------------------- | ------------------------------------ |
   | qualquer                               | chegada **tardia** (abaixo)                    | nada — nem correção, nem sugestão    |
   | `postal_code`                          | até **2 km** do ponto atual, preciso           | grava direto em `geocoded_addresses` |
   | `city`                                 | até **15 km** do ponto atual, preciso          | grava direto em `geocoded_addresses` |
   | `postal_code` / `city`                 | dentro da tolerância e impreciso, ou fora dela | sugestão ao escritório               |
   | sem coordenada                         | qualquer                                       | sugestão ao escritório               |
   | ponto de motorista (`source = driver`) | até 300 m, preciso e mais longe que a precisão | regrava (refina)                     |
   | ponto de motorista (`source = driver`) | até 300 m sem isso                             | nada                                 |
   | confiável de outra fonte               | até 300 m                                      | nada                                 |
   | confiável (qualquer fonte)             | a mais de **300 m**, preciso                   | sugestão ao escritório               |
   | confiável (qualquer fonte)             | a mais de 300 m, impreciso                     | nada                                 |

   **Tardia** é a chegada que a fila offline do app entregou depois do prazo da foto atrasada (spec 159/205/234,
   `proofWindowMinutes` padrão, 60 min, entre o toque corrigido pelo desvio do relógio e o recebimento), e o "Registrar
   entrega depois" (205), que nem passa pela chegada. Tardia não pede localização nem mexe no endereço. **Nada sobre
   posição bloqueia o registro**: a chegada grava sempre; a régua só decide o que o ponto faz no cadastro. No WhatsApp,
   tardia é a mensagem cuja hora (`messageTimestamp` do Evolution) passa da mesma janela até o recebimento; sem a hora,
   vale como tempo real. A mensagem tardia não ganha o pedido de localização.

3. A gravação direta usa o mesmo caminho da correção do operador (084), com `origin = 'driver'`,
   `precision = 'street'` (nunca `rooftop`: o ponto do motorista continua refinável por outra chegada precisa),
   `source = 'driver'`, trilha em `geocoded_address_corrections` e evento na linha do tempo da parada (228 estendida). As
   próximas viagens para o mesmo endereço já saem com o ponto novo.
4. **Endereço confiável de outra fonte nunca é sobrescrito** pela chegada (o pino manual nem pelo upsert).
5. A sugestão vai para `address_correction_suggestions` (com `company_id`) e aparece em `/pendencias`, onde o escritório
   aplica ou descarta. Uma pendente por (empresa, endereço): a chegada seguinte atualiza a pendente em vez de somar
   outra. Coordenada e autor saem pela purga de localização (90 dias da decisão, ou da criação se pendente). Correção idempotente pela chave `address-correction:<eventId>`.
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

### 5. A foto do canhoto se reconhece pelo número da nota, com OCR local (emenda de 05/11/2026)

Spikes T4.8a e T4.8b (`specs/294-o-motorista-segue-a-ordem-da-parada/spike-canhoto*.md`). O dono decidiu em 05/11/2026:
**nenhuma API paga nem serviço externo; a foto do canhoto não sai das nossas máquinas.** O modelo de visão hospedado
da T4.8a está fora.

1. O worker lê a foto com **PaddleOCR PP-OCRv4 (detecção + reconhecimento) em `onnxruntime-web` WASM** e `sharp`
   (roda no Alpine; Apache-2.0/MIT; ~28 MB). O código de barras não serve: o canhoto destacado não o traz.
2. A prova principal é o **número da nota**: os dígitos lidos casam com **uma** nota aberta da viagem de quem mandou →
   é o canhoto dessa nota. Casamento só aproximado pede confirmação; ambíguo ou nenhum pergunta "De qual nota é este
   canhoto?"; sem número e com menos de 2 marcas do canhoto ("Recebemos de", "Data de recebimento", assinatura...),
   cai na pergunta do RF23 (mercadoria / é o canhoto / descartar). Nota de outra parada segue o RF25. Nunca baixa por
   palpite e toda foto lida continua `pending` para o escritório (222).
3. O texto reconhecido não é gravado em banco, log nem fila: só veredito, nota casada, tipo de casamento e tempo.
4. Medido na T4.8b (110 canhotos aprovados de produção, 49 negativos): 99/110 casam com a nota certa, 1 com outra nota da
   viagem, 0 negativo casa por acaso; p50 1,8 s, p95 4,7 s por foto numa thread.
5. Classificador de imagem (MobileNetV3 + sonda) e Florence-2 ficam fora por ora: o primeiro não diz a nota e só foi
   medido contra negativos fáceis; o segundo é lento e pesado para o worker.

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
