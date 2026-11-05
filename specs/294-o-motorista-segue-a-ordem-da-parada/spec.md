# Feature 294 — O motorista segue a ordem da parada

> Decidido com o Anderson em 2026-11-05. Substitui decisões registradas — ver "Decisões que esta spec revoga".

## Specs do mesmo assunto (lidas contra o código em `origin/staging`, 2026-11-05)

| Spec / ADR                               | O que decidiu                                                                             | Situação aqui                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 056 D1                                   | Última nota fecha a parada; última parada fecha a viagem                                  | Mantida                                                                    |
| 156 C1/D5/D7, 182 RF3, 223 RF7/RF8       | Escritório dá baixa retroativa, em massa, sem exigir saída                                | Mantida: o escritório continua livre                                       |
| 205 D6                                   | A baixa sem "Cheguei" preenche `arrived_at`, mas **nunca inventa** evento `arrived`       | **Revogada** para o motorista                                              |
| 205 D3 / "Registrar entrega depois"      | Link no app que dá baixa sem saída nem chegada, baixando a nota do placar                 | Mantido, agora marcando as etapas junto                                    |
| 206 D6/D8                                | "Iniciar rota → Cheguei → Entreguei" é regra **só da tela**; a API aceita fora de ordem   | **Revogada**: a API garante a ordem para o motorista                       |
| 195 + ADR-0080                           | Ponto do motorista é **sugestão** que o escritório aplica, nunca direto (195: 0/26 tasks) | **Revogada em parte**: perto do endereço grava direto; longe vira sugestão |
| 228 D4/D11                               | Evento "endereço corrigido" só de correção humana                                         | Estendida: correção pela chegada do motorista também vira evento           |
| 292/293 (cabeçalhos dos fluxos do grupo) | "Nada de nome de cliente nem endereço no grupo"                                           | **Revogada**: nunca foi decisão do dono                                    |
| 234                                      | O momento do evento é o do toque (+ offset), não o de chegada ao servidor                 | Mantida: etapa marcada junto usa o momento da baixa                        |

## Problema e resultado

Hoje o motorista pode registrar a entrega sem ter iniciado a rota nem chegado: pelo WhatsApp não há trava
nenhuma, e no app a fila offline deixa a entrega passar quando o "Cheguei" à frente dela é recusado ou descartado.
A linha do tempo fica sem chegada, as estatísticas de deslocamento perdem amostra e o escritório não sabe se o
motorista esteve no local.

Resultado: para o **motorista** (app, grupo do WhatsApp e conversa individual), cada parada segue
**Iniciar rota → Cheguei → Entreguei / Não entreguei**. Quando ele pula uma etapa, o sistema **não recusa**: avisa
que vai marcá-la junto e grava. O **escritório** continua podendo pular etapas e concluir entregas e rotas em massa.

Ao fechar uma parada, o bot oferece a **próxima rota** com cliente, endereço e mapa. Se o endereço não tem
localização confiável, o bot avisa que vai corrigi-lo pela chegada do motorista, e corrige.

## Requisitos funcionais

### Ordem dos eventos

- **RF1** — Para quem está na rua — **motorista e ajudante** (`authorship` `driver_app` ou `whatsapp`; o ajudante entra pelo mesmo `/me/trips/current/*` com o próprio `driverId` e papel `helper` em `trip_drivers`), a parada só aceita o evento seguinte da
  sequência `departed → arrived → delivered|returned`. Evento fora de ordem **marca junto** as etapas que faltam,
  na mesma transação e sob a mesma chave de idempotência do evento pedido.
- **RF2** — A etapa marcada junto:
  - usa o momento do evento pedido (`tappedAt`/`occurredAt`, spec 234);
  - fica marcada como **registrada junto** (`recorded_together`), visível na linha do tempo ("Chegada marcada junto
    com a entrega");
  - fica **fora** das estatísticas de tempo de serviço, permanência (232) e amostra de deslocamento (206 D11),
    e não dispara o deslocamento de previsão (109).
- **RF3** — "Cheguei" sem "Iniciar rota" marca a saída junto. "Entreguei" ou "Não entreguei" sem chegada marca a
  chegada (e a saída, se faltar) junto.
- **RF4** — Saída marcada junto não esbarra em `TRIP_HAS_STOP_EN_ROUTE`: a chegada marcada em seguida já tira a
  outra parada de "a caminho", como o "Cheguei" do motorista faz hoje (206 D7).
- **RF5** — O motorista é **avisado** de que a etapa foi marcada junto:
  - WhatsApp: linha na resposta ("Marquei a chegada junto com a entrega da NF 17234.");
  - app: aviso na tela depois da baixa. No "Entreguei" sem chegada, a confirmação já diz "Vamos marcar Cheguei junto".
- **RF6** — "Registrar entrega depois" (205) continua: marca as etapas junto (RF2) **e** mantém a queda no placar.
- **RF7** — Escritório (`target` presente, `isOffice`) não passa pela ordem: baixa avulsa, em massa e
  "Encerrar viagem" seguem como hoje, sem evento marcado junto (o `arrived_at` continua preenchido como em 205 D6).

### Próxima rota

- **RF8** — Quando uma baixa do motorista **fecha a parada**, a resposta oferece a próxima parada pendente do
  roteiro (mesma regra do "saí", `resolveDepartureStop`):
  - parada N de M, cliente, endereço, notas;
  - link do mapa (coordenada de `geocoded_addresses`);
  - **1 - Sim, iniciar rota** / **2 - Agora não**.
    Uma parada com várias notas oferece **uma vez**, quando fecha, nunca a cada nota.
- **RF9** — "Sim" registra a saída pela função do app (`reportStopDeparture`), com chave de idempotência do pedido.
  "Agora não" encerra a conversa; o motorista pode mandar "saí" depois.
- **RF10** — Última parada fechada: em vez da oferta, "Rota concluída, todas as paradas fechadas" com a despedida
  do #531.
- **RF11** — No app, depois de fechar a parada, o card da próxima parada aparece com "Iniciar rota" em destaque e o
  aviso de endereço não confiável (RF12).

### Endereço confiável e correção pela chegada

- **RF12** — Endereço **não confiável** = sem coordenada, ou `precision` `postal_code` ou `city`. A oferta da
  próxima rota (bot e app) avisa: "Este endereço está sem localização certa no mapa. Quando chegar, marque Cheguei
  e compartilhe a localização: eu atualizo o endereço."
- **RF13** — A `precision` passa a chegar ao snapshot da viagem do motorista e às portas do bot (hoje não chega).
- **RF14** — No "Cheguei" de uma parada não confiável, o bot pede a localização se ela não veio antes. Com o ponto:
  - **dentro da tolerância** do endereço atual (por precisão: `postal_code` 2 km, `city` 15 km; sem coordenada
    nenhuma não há com o que comparar, e o ponto vira sugestão) → grava direto no cadastro (`geocoded_addresses`, `origin: 'driver'`,
    `precision: 'rooftop'`, `source: 'driver'`) e as próximas viagens já saem com o mapa certo;
  - **fora da tolerância** → vira **sugestão** que o escritório confirma em `/pendencias`.
- **RF15** — Endereço confiável (`rooftop`/`street`) não é sobrescrito pela chegada. Ponto a mais de 300 m dele
  vira sugestão para o escritório (o motorista pode ter achado a entrada certa).
- **RF16** — Toda correção vira evento na linha do tempo da parada (228 estendida), com autor (motorista ou
  operador que confirmou).

### Dados do cliente no grupo

- **RF17** — O grupo do motorista mostra nome do cliente e endereço. As listas de escolha ("Qual parada?" do
  saí/cheguei, "Qual nota você entregou?") passam a trazer o cliente junto do número da nota. Os cabeçalhos e
  comentários que proíbem isso saem do código.

## Requisitos não funcionais

- **RNF1 — Um fluxo do bot não atrapalha o outro.**
  - Só um pedido aberto por grupo/conversa (índice único que já existe). A oferta da próxima rota e o pedido de
    localização só abrem um pedido novo quando não há outro aberto; se houver, a frase sai sem pergunta ("Quando
    for, mande _saí_.").
  - "1"/"2" e textos só respondem ao pedido aberto do fluxo dono dele.
  - A localização compartilhada é consumida por **uma** ação, e a chegada vem antes da entrega em preparo da mesma
    parada.
  - Cada combinação (ocorrência aberta, entrega em preparo, escolha de parada, oferta de próxima rota) tem
    contrato que prova a não interferência.
- **RNF2** — Etapa marcada junto, oferta e correção de endereço são idempotentes: reenvio do mesmo evento não
  grava duas vezes nem corrige duas vezes.
- **RNF3** — Fila offline do app: entrega cujo "Cheguei" foi recusado ou descartado passa e marca a chegada junto,
  em vez de virar baixa sem chegada.
- **RNF4** — Log sem PII: coordenada, endereço e nome nunca em log; só empresa, parada, evento e motivo.
- **RNF5** — Migration só aditiva (VARCHAR, sem ENUM nativo).

## Decisões que esta spec revoga

- **205 D6** e **206 D6/D8**, para o motorista: a API garante a ordem e grava a etapa pulada como evento marcado
  junto. O escritório segue como antes.
- **ADR-0080**, em parte: dentro da tolerância, o ponto da chegada grava direto. Novo ADR registra a troca.
- **"Nada de cliente nem endereço no grupo"** (292/293): sai.

## Fora do escopo

- Ordem de eventos para ocorrência (continua sem exigir chegada, 182 P3/204 P3).
- Recusar o evento fora de ordem (decidido: marcar junto, nunca recusar).
- Geocodificação reversa por serviço externo.
- Lote "entreguei 17234 17235" no grupo (T13 da 293).

## Critérios de aceite

1. Motorista manda "entreguei 17234" no grupo sem ter iniciado rota nem chegado: a nota é baixada, saída e chegada
   aparecem na linha do tempo como "marcadas junto", e a resposta diz isso.
2. Escritório marca entregue em massa: nenhuma etapa marcada junto, comportamento igual ao de hoje.
3. Fechou a última nota da parada 3 de 5: o bot oferece a parada 4 com cliente, endereço e mapa; "1" registra a
   saída; "2" encerra.
4. Parada 4 com endereço só pelo CEP: a oferta avisa; no "Cheguei" com localização a 800 m, o endereço é corrigido
   e a próxima viagem para o mesmo endereço já mostra o ponto novo; a 5 km, vira pendência do escritório.
5. Com uma ocorrência aberta no grupo, fechar uma parada não abre a oferta como pergunta, e o "1" seguinte responde
   à ocorrência.
6. Estatística de tempo de serviço não recebe amostra de chegada marcada junto.
