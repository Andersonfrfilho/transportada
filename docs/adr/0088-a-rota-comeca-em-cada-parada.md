# ADR-0088 — A rota começa em cada parada

- **Status:** **aceita** (2026-09-26, T0.1 da spec 206), proposta em 2026-09-25 e revisada no mesmo dia
  depois da crítica. As onze premissas do `plan.md` foram conferidas contra `origin/staging`, com
  arquivo:linha em `specs/206-a-rota-comeca-em-cada-parada/evidence.md`. Nenhuma divergiu; a premissa 8
  ficou **melhor** do que o escrito (a API da 205 já está publicada).
- **Data:** 2026-09-25
- **Decisores:**
  - o usuário, em 2026-09-25: "o iniciar rota é em cada item da viagem"; o fluxo Iniciar rota →
    Cheguei → Entreguei; o fim do botão de viagem; o aviso ao cliente e a medição do trajeto; e, no
    mesmo dia, sobre o aviso: "pode mandar e-mail se for sem custo";
  - o usuário, em 2026-09-26, vendo a tela: "se houver uma não pode iniciar a outra" e, sobre o
    segundo toque, "bloqueia com um link para fechar a outra com o botão de confirmar ou fechar
    depois" — o que substitui a troca que esta ADR tinha decidido no dia anterior;
  - o usuário, em 2026-09-26, respondendo à Q4 da spec (o toque errado): **"Desfazer sempre, com
    registro"** — "Cancelar rota" a qualquer momento antes do Cheguei, sem janela de tempo, com o
    cancelamento no histórico e o cliente avisado de que o motorista não vem mais. Antes disso não havia
    saída além de entregar ou "Registrar entrega depois";
  - o usuário, em 2026-09-26, sobre o aviso depois de um cancelamento: **"Cada Iniciar rota manda o
    aviso, inclusive depois de um cancelamento"** — o cliente sempre sabe quando o caminhão está vindo, ao
    custo de um motorista indeciso render três ou quatro e-mails na mesma parada;
  - o usuário, em 2026-09-26, sobre subir o aviso: **"nao enviar isso ainda implementar mas, deixa
    desligado por configuração"** e **"tbm deixe preparado para integrações com outros parceiros"** — o
    aviso existe no código e nasce desligado, por configuração de empresa, e o e-mail é o primeiro destino,
    não o único previsto;
  - esta ADR decide o desenho: evento, estado, fila, bloqueio, cancelamento, travas, medição, teto,
    supressão e a porta de saída do aviso.
- **Spec:** `specs/206-a-rota-comeca-em-cada-parada/`
- **Emenda:**
  - `docs/adr/0058-a-viagem-comeca-e-termina-por-toque-do-motorista.md` §1–§2: o "iniciar trajeto"
    deixa de ser da viagem.
  - `docs/adr/0081-todo-toque-do-motorista-carimba-onde-aconteceu.md`:
    - §5: "Iniciar rota" deixa de ser toque direto e passa à fila;
    - na tabela "Finalidade", "Iniciar rota" passa a ser a base do tempo de trajeto **da parada**.
  - `docs/adr/0079-quem-recebeu-e-o-contato-do-destinatario.md` B3: o contato do destinatário pode
    ir para **um** aviso (§7).
  - Spec 158 D6: só a lista de `kind` da linha do tempo ganha `stop.departed`.
- **Mantém:**
  - `docs/adr/0058-a-viagem-comeca-e-termina-por-toque-do-motorista.md` §3: o estado não anda para
    trás, e fechar nota adianta o estado.
  - `docs/adr/0058-o-motorista-abre-a-porta-do-despacho.md`: o despacho continua como está.
  - ADR-0074 §5 e §6: o despacho marca "A caminho" no portal e congela o ETA.
  - ADR-0045 §3: a coordenada é do toque.
  - ADR-0068 §2: a ordem das travas.

## Contexto

O "Iniciar rota" era um toque por viagem, no pátio. Ele dizia "saí" e não dizia para onde. Na rua, o
motorista vai de parada em parada, e a pergunta do escritório e do cliente é "ele está vindo para
cá?". Nenhum evento separava a ida para a parada 3 da espera na parada 2.

## Decisão

### 1. A saída é um evento da parada

`trip_stop_events` ganha `departed`, no molde do `arrived`:

- evento da parada, sem nota;
- carimbo da ADR-0081;
- `tapped_at`, a hora do aparelho no toque;
- idempotência pelo `trip_field_reports` (`stop.depart`).

Toque sem efeito não grava evento, mas **liquida a chave** com `result_changed = false`. É o que faz o
reenvio repetir `changed: false`, em vez de decidir de novo sobre um estado que já mudou.

### 2. Uma parada a caminho por vez, e o banco garante

- **Colunas e constraints:**
  - `trip_stops.en_route_since` (hora do servidor) e `en_route_tapped_at` (hora do toque);
  - um CHECK que só permite "a caminho" em parada aberta e sem chegada;
  - um índice único parcial por viagem.
- **Toda escrita de `arrived_at` ou `completed_at` zera o "a caminho" no mesmo `UPDATE`.** A
  conclusão pela baixa do escritório, que preenche a chegada, é um desses escritores. Um contrato
  estático vigia os escritores.
- **A parada aberta bloqueia as outras — tocar noutra é recusado, não troca.** Na tela o botão das
  demais fica desabilitado e visível, com o motivo escrito e um atalho que leva à parada a caminho;
  ela se fecha entregando ou por "Registrar entrega depois" (ADR-0087/spec 205), e só então as outras
  liberam. No servidor, `409 TRIP_HAS_STOP_EN_ROUTE` com `{ enRouteStopId, enRouteStopSequence }`, sem
  tocar a parada aberta e sem liquidar a chave de idempotência — o reenvio depois de fechar é aceito.
  A recusa é depois do no-op por toque velho: item de fila antigo não pode virar recusa eterna.
- **Travas na ordem da ADR-0068 §2, como a 192 D5** — sem troca elas servem a outra coisa: serializar
  a leitura de "alguma parada a caminho?", para o toque perdedor receber 409 e não o 500 do índice:
  1. as paradas da viagem, `for no key update order by id`;
  2. só depois a decisão;
  3. depois a viagem.
- O índice é rede de segurança. Não há `catch` de violação, que numa transação abortada não teria o
  que executar.
- **A parada aberta se fecha por três caminhos, e são eles que liberam as outras:** entregar, "Registrar
  entrega depois" (spec 205) e **"Cancelar rota"**.

### 2b. "Cancelar rota" desfaz a saída, e o cancelamento fica na história

Resposta do usuário à Q4, em 2026-09-26. Sem ela, quem abrisse a parada errada só sairia entregando ou
por um registro tardio que abaixa a nota dele.

- **Disponível na parada a caminho, a qualquer momento antes do Cheguei, sem janela de tempo.**
- **Não é a troca de volta:** cancelar **não inicia** parada nenhuma, e ir para outra são dois toques.
  Nenhuma transação escreve em duas paradas.
- **Nada é apagado:** `trip_stop_events` ganha `kind = 'departure_cancelled'` (grafia `cancelled`, a do
  repositório), com o mesmo carimbo, a mesma hora de servidor e o mesmo `tapped_at` do `departed`. O
  `departed` fica lá.
- **Rota:** `POST /me/trips/current/stops/:stopId/cancel-departure`, corpo idêntico ao do `depart`,
  idempotência por `trip_field_reports` (`stop.cancel-departure`) e as **mesmas travas** — só o
  `en_route_*` da própria parada é zerado, e `trips.status` não muda: a viagem segue em rota de entrega,
  que descreve a viagem, não a parada.
- **Recusa depois do Cheguei:** `409 TRIP_STOP_DEPARTURE_NOT_CANCELLABLE` com
  `{ reason: 'arrived' | 'completed' }`. Nesse ponto o caminho é entregar ou registrar depois. Parada que
  já não está a caminho é no-op, e o toque velho é no-op **antes** da recusa, pela mesma razão do 409 da
  §2.
- **A tela pede confirmação** dizendo o efeito no cliente; o servidor não pergunta, porque a fila drena
  sem ninguém olhando.
- **A saída cancelada não vira amostra de trajeto** (§6): um `departed` com cancelamento depois dele fica
  fora.
- **O painel mostra "Cancelou a rota da parada N"**, com prioridade 0, como os outros itens de parada.

### 3. O primeiro "Iniciar rota" de parada põe a viagem em rota

- Usa `markTripOnDeliveryRoute`, na porta do relato de campo, no molde de `markTripInTransit`:
  compare-and-set, `checkTripTransition({ action: startRoute })` e `recordTripStatusChange`, dentro da
  transação do evento.
- O botão de viagem sai da app.
- `POST /me/trips/current/start-route` segue aceito para a versão antiga, como o `confirm-load`
  (ADR-0074 §5).

### 4. O toque entra na fila, e a hora do toque ordena

- O toque de parada é na rua, com o sinal do "Cheguei", e segue o caminho dele.
- A fila **não descarta** o item recusado, e o reenvio manual chega fora de ordem. Por isso o item
  leva `tappedAt`.
- O servidor responde `changed: false` quando o `tappedAt` é anterior ao último `departed` ou
  `arrived` da viagem, com tolerância de 2 min.
- `tappedAt` fora da janela é ignorado, e relógio errado não trava a fila.

### 5. "Cheguei" depende da saída só na tela

- **A app** libera o Cheguei na parada a caminho, pela função `resolveEnRouteStopId`, que ignora os
  itens recusados.
- **A API** continua aceitando chegada sem saída: escritório, WhatsApp e versão antiga.
- **A chegada do motorista** zera o "a caminho" da viagem. **A do escritório** zera só a própria
  parada.
- **Snapshot sem a chave `enRouteSince`** é API antiga, e o Cheguei aparece como antes.
- **O "Registrar entrega depois"** dispensa os dois toques.

### 6. A duração do trajeto é derivada, e ninguém a consome ainda

- A amostra `arrived − departed` segue a regra de relógio da spec 198 D14:
  - os dois extremos no mesmo relógio;
  - só o canal `driver_app`;
  - fora com `location_state = 'expired'`.
- É derivada na leitura, nunca coluna.
- A 198 D1 não muda. O consumo fica para a 058 T014 ou para uma emenda.

### 7. O destinatário recebe um e-mail, sem custo para ninguém

- **Base legal:** legítimo interesse (art. 7º, IX), com a finalidade de avisar a chegada da própria
  entrega do titular. A B3 da ADR-0079 ganha **esta** exceção e nenhuma outra.
- **Sem custo:**
  - a conta Resend do worker, cuja cota gratuita é de 3 000 por mês e 100 por dia, por conta;
  - uma fatia com teto por instalação e por empresa, contado antes de chamar o provedor;
  - teto atingido ou `429` de cota: "não enviado — limite", e o motorista e a entrega não percebem;
  - `429` de taxa: nova tentativa com backoff;
  - sem a chave, o aviso fica desligado.
- **Reputação:** subdomínio próprio de aviso, e supressão por bounce e reclamação via webhook
  assinado (Svix). Uma chave separada não daria cota separada.
- **Opt-out:** link em todo e-mail, e o endereço guardado só como HMAC com segredo.
- **Três interruptores, todos desligados por padrão:** global, empresa e contratante do frete.
- **Atraso de cerca de 2 min,** conferindo a chegada antes de enviar.
- **Cancelou? O cliente sabe, se já sabia** (Q4, 2026-09-26):
  - cancelamento **dentro** do atraso suprime os dois avisos — nada sai, e nenhuma vaga da cota é gasta.
    É o caminho normal do dedo torto, e vale **em cada ciclo**, não só no primeiro;
  - depois de enviado, sai o segundo e último e-mail **daquele ciclo**: "o motorista não vem mais", com
    as mesmas notas, sem previsão nova e sem nada do motorista;
  - **cada Iniciar rota avisa de novo** (decisão do usuário, 2026-09-26): "o cliente sempre sabe quando o
    caminhão está vindo; em troca, um motorista indeciso pode render três ou quatro e-mails na mesma
    parada". A unicidade é por **saída** — `(empresa, parada, hash do e-mail, tipo, id do evento de
saída)` —, então replay e drenagem dobrada não repetem nada, mas um ciclo novo é um par novo;
  - **o teto reserva uma vaga por obrigação em aberto,** e não uma vaga só: o "a caminho" sai quando
    `enviados + obrigações em aberto < teto`, para que quem foi avisado possa sempre ser desavisado —
    mesmo com várias viagens com parada a caminho ao mesmo tempo;
  - **o freio do volume é o teto do dia**, que é por instalação: o pior caso do motorista indeciso está
    escrito na spec, e um teto por parada e endereço é a Q5, em aberto;
  - opt-out, supressão por bounce, HMAC do endereço e os três interruptores são os mesmos.
- **Nada do motorista:** o texto diz a transportadora, as notas e a previsão (`estimated_arrival_at`,
  nunca recalculada pela posição).
- **Retenção:** o registro em 90 dias e a outbox em 7 dias depois de publicada.

### 7b. O aviso nasce desligado, e é um evento com destinos

Decisão do usuário, 2026-09-26. O "sem custo" da §7 foi a **condição de existir** o aviso; nascer ligado
numa instalação nova seria assumir, em nome da transportadora, um custo e um envio a cliente que ninguém
pediu.

- **Interruptor de configuração, por empresa, desligado de fábrica** — não variável de ambiente, porque
  ligar é decisão de quem opera, não de quem faz deploy. Tabela de settings com PK `company_id` e
  `boolean not null default false`, como as outras configurações de empresa, e a migration **não liga
  ninguém**: empresa que já existe nasce desligada. O que fica no ambiente é a pré-condição de **custo**
  do canal de e-mail (a chave Resend), não uma preferência.
- **Desligado é não existir:** nada enviado, **nada gravado** — sem linha de aviso, sem outbox, sem
  contador, sem token de descadastro. O toque do motorista responde igual. Um "desligado" que ainda
  grava linha e conta no teto seria a pior versão, e é contrato, não confiança.
- **A Fase 7 pode subir em produção sem efeito nenhum**, e o efeito vem depois, por configuração.
- **O aviso é um evento de negócio com destinos**, não "um e-mail": uma porta do domínio recebe o evento
  com os dados já resolvidos, e o e-mail é um adaptador. Canais previstos: e-mail (implementado),
  WhatsApp (exigiria template na Meta, janela de 24 h e opt-out próprio) e webhook de parceiro (exigiria
  HMAC na saída, retry com limite e idempotência). **Os dois últimos não são implementados aqui**, e
  canal sem adaptador **não pode ser ligado**.
- **Regra do evento, custo do canal:** atraso, supressão, opt-out e unicidade rodam **antes** de
  qualquer canal — senão cada canal novo repetiria a regra e um deles a repetiria errado. O teto e o
  `429` são **por canal**: webhook para o sistema do parceiro não gasta cota de e-mail.
- **Canal novo não amplia o que se compartilha.** A base legal é do **evento**, não de um provedor, e um
  canal que exigisse dado a mais é decisão nova, com ADR própria.
- **Uma** porta, **um** adaptador, uma constante de catálogo e uma coluna `channel`. Sem registro de
  plugins, sem fábrica genérica, sem coluna para canal que não existe.

### 8. Um nome e um dono

- "A caminho" é `en_route_since`/`en_route_tapped_at` na API e `resolveEnRouteStopId` na app.
- `findCurrentStop` é desta decisão.
- A spec 207 consome esses nomes, usando `enRouteTappedAt` como âncora, e não cria outra função.

## Consequências

- O escritório vê "A caminho da parada N". O produto passa a ter a perna real "saí → cheguei" para
  aprender.
- A app ganha um toque por parada, custo aceito pelo usuário. O "Registrar entrega depois" cobre
  quem esqueceu, mas a foto conta como atrasada e abaixa a nota do motorista (205).
- O painel precisa tolerar tipo novo na linha do tempo antes da API (ADR-0081 §9). A reversão é na
  ordem inversa: app, API, banco.
- O rollback da migration apaga os `departed` e os `departure_cancelled`.
- O escritório passa a ver quantas vezes cada motorista desiste de uma parada. **Nenhuma penalidade nasce
  aqui** — medir primeiro (ADR-0070).
- O aviso usa uma fatia da cota que os e-mails de sistema também usam. Com "cada Iniciar rota avisa", um
  motorista indeciso pode consumir essa fatia sozinho num dia — o número está na spec, e o teto por
  parada é a Q5.

## Alternativas descartadas

| Alternativa                                                                              | Por que não                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Derivar "a caminho" do último `departed`, sem coluna                                     | Sem constraint, dois celulares deixam duas paradas a caminho, e a leitura pagaria a consulta.                                                                                                                                                            |
| Trocar a parada a caminho no segundo toque                                               | Decisão do usuário em 2026-09-26: a parada aberta bloqueia as outras. O motorista que mudou de ideia não fica preso — ele cancela a rota da parada aberta (§2b) e inicia a outra.                                                                        |
| Janela curta para desfazer o "a caminho"                                                 | Oferecida ao usuário na Q4 e recusada: desfazer vale sempre, até o Cheguei.                                                                                                                                                                              |
| Apagar o `departed` ao cancelar                                                          | O histórico é o que explica a mudança de destino ao escritório. Cancelar grava, não apaga.                                                                                                                                                               |
| Unicidade do aviso sem o id da saída (um "a caminho" por parada e endereço, para sempre) | Recusada pelo usuário em 2026-09-26: depois de um cancelamento o cliente saberia que o motorista não vem e **nunca** que ele voltou a vir. Avisar sempre custa e-mail; não avisar custa a confiança no aviso. O freio do volume passa a ser o teto (Q5). |
| Aviso ligado de fábrica, com env da instalação para desligar                             | Decisão do usuário em 2026-09-26: nascer ligado assume custo e envio a cliente que ninguém pediu, e um env só o deploy mexe. O interruptor é configuração de empresa, desligado de fábrica.                                                              |
| Chamar o provedor de e-mail direto do caso de uso                                        | Amarraria o aviso a um canal (code-standart §6) e faria cada canal novo reabrir a regra do evento. A porta custa uma interface e um `.gateway.ts`.                                                                                                       |
| Registro de plugins / fábrica genérica de canais, já agora                               | Abstração vazia com um adaptador só. Canal novo custa uma coluna, um adaptador e uma linha na composição — e é isso que está preparado.                                                                                                                  |
| Capturar a violação do índice e tentar de novo                                           | A transação abortada não executa o retry; a trava das paradas serializa antes.                                                                                                                                                                           |
| Extrair o `applyFieldStep`                                                               | Ele roda na transação que o `updateStatus` abre, não numa existente.                                                                                                                                                                                     |
| API exigir `departed` para aceitar `arrived`                                             | Quebra escritório, WhatsApp e versão antiga, e condena itens na fila.                                                                                                                                                                                    |
| Manter o toque direto, fora da fila                                                      | O toque agora é na rua; sem sinal, falharia onde o Cheguei funciona.                                                                                                                                                                                     |
| Confiar na ordem da fila                                                                 | A fila mantém o recusado e permite reenvio fora de ordem.                                                                                                                                                                                                |
| E-mail pela chave Resend da transportadora                                               | O plano da conta é dela, e o produto não garante "sem custo".                                                                                                                                                                                            |
| WhatsApp ao destinatário                                                                 | Sem driver, template pago na Meta e opt-out próprio (spec 062).                                                                                                                                                                                          |
| Recalcular a previsão pela posição do toque                                              | Finalidade nova para a coordenada (ADR-0081).                                                                                                                                                                                                            |
