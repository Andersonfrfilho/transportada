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
- **RF14** — No "Cheguei" **em tempo real** de uma parada não confiável, o bot pede a localização se ela não veio antes
  (opcional: "pular" registra igual). Com o ponto:
  - **dentro da tolerância** do endereço atual (por precisão: `postal_code` 2 km, `city` 15 km) **e preciso** (precisão
    do aparelho ≤ 50 m no app; o ponto do WhatsApp, sem precisão, vale em tempo real) → grava direto no cadastro (`geocoded_addresses`, `origin: 'driver'`, `precision: 'street'`,
    `source: 'driver'`) e as próximas viagens já saem com o mapa certo; o ponto do motorista segue refinável por outra
    chegada precisa (ADR-0113 §2);
  - **fora da tolerância**, impreciso, ou endereço sem coordenada → vira **sugestão** que o escritório confirma em
    `/pendencias` (uma pendente por endereço; a seguinte a atualiza);
  - **chegada tardia** (fila offline entregue além do prazo da foto atrasada, spec 205/234, o "Registrar entrega
    depois", ou a mensagem do WhatsApp cuja hora `messageTimestamp` passa da mesma janela de 60 min; sem a hora, vale como
    tempo real) → não pede localização e não corrige nem sugere. Nada sobre posição bloqueia o registro.
- **RF15** — Endereço confiável (`rooftop`/`street`) de outra fonte não é sobrescrito pela chegada. Ponto preciso a mais
  de 300 m dele vira sugestão para o escritório (o motorista pode ter achado a entrada certa); ponto impreciso é ignorado.
- **RF16** — Toda correção vira evento na linha do tempo da parada (228 estendida), com autor (motorista ou
  operador que confirmou).

### Dados do cliente no grupo

- **RF17** — O grupo do motorista mostra nome do cliente e endereço. As listas de escolha ("Qual parada?" do
  saí/cheguei, "Qual nota você entregou?") passam a trazer o cliente junto do número da nota. Os cabeçalhos e
  comentários que proíbem isso saem do código.

### Quem fala com o bot decide a regra (decidido em 2026-11-05)

- **RF18** — No WhatsApp a regra é da **pessoa**, não do canal. O bot identifica quem mandou:
  - **tripulação** — telefone de motorista ou ajudante da frota (`isCrewMember`, grupo) ou o motorista da conversa
    individual → regras do motorista (RF1–RF6, provas que o comprovante da nota exige);
  - **atendente** — telefone verificado de um usuário com vínculo ativo na empresa (`resolveWhatsAppActor`, spec 144)
    e permissão de baixa do escritório → regras do **escritório**;
  - **nenhum dos dois** → o bot não dá baixa ("Só a tripulação ou um atendente cadastrado registra a entrega.").
- **RF19** — Baixa do atendente pelo WhatsApp (grupo ou individual) vai pelo caminho do escritório (`target`,
  autoria `office`, ator = o usuário do atendente, em nome do motorista da viagem, auditoria com o canal WhatsApp):
  - pula etapas sem marcar nada junto (RF7);
  - comprovantes **opcionais**: o bot oferece foto do canhoto, foto da mercadoria e quem recebeu, mas aceita
    "pular" em todos, seja qual for a configuração da nota; a baixa sem canhoto segue como "conclui sem canhoto e
    cobra depois" (223);
  - mesma janela de horário informado do escritório (`assertInformedTimeWithinWindow`).
- **RF21** — O atendente fecha pelos **dois** caminhos — no grupo do motorista e direto com o bot (conversa
  individual, o menu do operador da spec 144) — com as mesmas ações do painel, pelas mesmas funções:
  - baixa de uma nota ou de **várias de uma vez** ("entreguei 17234 17235"; o "uma nota por vez" do grupo vale só
    para a tripulação);
  - **encerrar a viagem/rota** (a mesma de `POST /trips/:id/close`, 223 RF8), com confirmação "1 - Sim / 2 - Não"
    listando quantas notas ainda estão abertas;
  - na conversa individual, a viagem é escolhida pelo número da nota ou pela lista de viagens na rua.
- **RF22** — **Tudo por áudio, menos o comprovante.** Cada passo novo desta spec aceita resposta falada, para
  tripulação e atendente, no grupo e no individual, pelo mesmo caminho de áudio que já existe
  (`whatsapp-bot-audio.service.ts`: transcrição → "Entendi assim" → segue):
  - comandos ("saí", "cheguei", "entreguei 17234", "encerrar a rota");
  - escolhas numeradas ("um", "opção dois", "a nota dezessete mil duzentos e trinta e quatro" — `bot-spoken-note`);
  - sim/não da próxima rota, do "marquei junto" e do encerramento;
  - quem recebeu, nome de quem recebeu, "pular".
    As exceções são só as mídias: foto do canhoto e da mercadoria, e a localização compartilhada. Quando o bot pede
    uma delas e chega áudio, ele repete o pedido dizendo que esse item vai por foto/localização ("pular" falado vale
    quando o item é opcional).
- **RF23** — **Decidido em 2026-11-05: sem modelo pago; só opções gratuitas e locais no worker (OCR local melhorado, classificador próprio, modelo de visão aberto pequeno). Spike em andamento.** **Foto do canhoto dá a baixa.** Foto recebida sem "entreguei" passa pela leitura do código de barras
  que já existe (worker `canhoto-read`, specs 220/222: `readNumber`/`readDocumentId`), agora **antes** da baixa:
  - **primeiro confere se é mesmo um canhoto** (a parte destacável assinada: "Recebemos de…", data de recebimento,
    assinatura do recebedor), e não o corpo da DANFE, a mercadoria ou outra foto. Não é canhoto → "Essa foto não
    parece um canhoto assinado. É foto da mercadoria? _1_ - Mercadoria / _2_ - É o canhoto / _3_ - Descartar"
    (resposta também por áudio). O "2" do motorista vale, e a foto segue marcada para conferência do escritório
    (`pending`, como a 222 faz com o que a máquina não aprova);
  - é canhoto e casa com uma nota aberta da viagem de quem mandou → abre a entrega em preparo da nota com a foto
    como canhoto, marca junto o que faltar (RF1) e **pede a localização** ("📍 Mande sua localização pelo clipe, ou
    responda _pular_"; a compartilhada pouco antes vale sem perguntar). Sem outra prova obrigatória pendente, dá a
    baixa e responde "✅ NF 17234 entregue (li o canhoto)"; com prova pendente, pede só o que falta;
  - várias fotos seguidas → cada canhoto lido baixa a sua nota (o "uma nota por vez" não vale para foto lida);
  - não leu, ou a nota não é da viagem → "De qual nota é este canhoto?" (resposta também por áudio). Nunca baixa
    por palpite;
  - atendente: mesma leitura, regra do escritório (RF19).
- **RF24** — **Localização opcional no "Iniciar rota" e no "Cheguei"** em tempo real (registro tardio não pede, RF14), pelo bot: antes de registrar, o bot pede
  "📍 Mande sua localização pelo clipe, ou responda _pular_" ("pular" falado vale). Localização compartilhada pouco
  antes é usada sem perguntar de novo. Em endereço não confiável, o pedido do "Cheguei" diz que ela corrige o
  endereço (RF14).
- **RF25** — **Fora de ordem é conferido, não aceito calado** (tripulação; o atendente segue RF19 sem pergunta):
  - canhoto ou "entreguei" de nota de **outra** parada que não a iniciada/chegada → "⚠️ Você iniciou a rota para a
    parada 3 (NF 17234 — cliente), mas este canhoto é da NF 17300, da parada 5 (cliente). _1_ - Entreguei a parada 5
    mesmo / _2_ - Foi engano, descartar". "1" registra a parada 5 com as etapas marcadas junto (RF1) e avisa que a 3
    segue aberta; "2" descarta e não grava nada;
  - "Iniciar rota" (pela oferta da próxima rota ou pelo comando) para uma parada que não é a próxima do roteiro →
    "A próxima no roteiro é a parada 4 (cliente). Quer mesmo iniciar a parada 6? _1_ - Sim, a 6 / _2_ - Não, a 4".
- **RF26** — **Canhoto repetido não grava duas vezes:**
  - a mesma imagem (hash do conteúdo, como o "Essa foto já tinha chegado" da entrega em preparo) → "Esse canhoto
    já tinha chegado: NF 17234, entregue às 14:32." e nada é gravado;
  - outra foto de nota já entregue **com** canhoto → "_1_ - Trocar o canhoto (vai para conferência do escritório) /
    _2_ - Descartar";
  - nota entregue **sem** canhoto (223, concluída sem canhoto e cobrada depois) → a foto entra como o canhoto que
    faltava, sem pergunta.
- **RF27** — **Todas as proteções valem em todos os canais da tripulação** (app, grupo e individual), decidido em
  2026-11-05. A regra mora na **API**, e os canais só mostram a pergunta:
  - ordem e etapa marcada junto (RF1–RF6) — política na API;
  - fora de ordem (RF25) — a API devolve `outOfOrder` (parada iniciada/chegada × parada da nota, próxima do roteiro)
    e só grava com a confirmação explícita (`confirmOutOfOrder: true`); o app mostra o diálogo, o bot o 1/2;
  - canhoto repetido (RF26) — hash do conteúdo checado na API antes de anexar, em qualquer canal;
  - "é canhoto?" (RF23) — mesma conferência para a foto do canhoto enviada pelo app;
  - localização opcional no "Iniciar rota" e no "Cheguei" (RF24) — o app já pede a do aparelho; o bot pede pelo clipe.
- **RF20** — Corrige o defeito de hoje: no grupo, a entrega em preparo grava sempre em nome do motorista dono do
  grupo, mesmo quando quem mandou "entreguei" é o atendente.

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
