# 057 — a viagem cabe no bolso do motorista

> **Depende da 056** (paradas ordenadas e máquina de estados). Sem parada não há o que mostrar.

## Problema e resultado

Depois de `dispatched`, o produto perde o motorista. O que acontece na rua volta por WhatsApp, foto
de canhoto e ligação — e volta horas depois, para alguém digitar. O escritório descobre a entrega
quando o motorista volta ao barracão.

O resultado é o motorista abrindo o mesmo PWA no celular e vendo **só a viagem dele**: a lista de
paradas na ordem, o que descarregar em cada uma, e dois toques por parada — cheguei, entreguei.
Cada toque vira estado no servidor no mesmo segundo, e o painel do escritório acompanha sem ninguém
perguntar nada.

## Fora do escopo

- Aplicativo nativo. Decisão: **o PWA primeiro, o app depois** — e é por isso que a D2 abaixo
  existe.
- Rastreamento contínuo de posição durante a viagem.
- Canal WhatsApp para o motorista. Ver D2: esta spec deixa a porta aberta e não a atravessa.
- Navegação turn-by-turn própria. O botão abre o app de mapa que a pessoa já usa.
- Alteração da ordem das paradas pelo motorista (ela está congelada desde `dispatched`, 056 D2).
- Hora agendada, protocolo de portaria e lançamento de taxa de entrega — o dado vem da **060**. Esta
  spec só precisa que a parada saiba mostrar o que a 060 anexar a ela, e o `GET /me/trips/current`
  nasce com espaço para isso.

## Decisões

### D1 — O motorista vê a viagem dele, e o servidor é quem decide qual

`fleet_drivers.membership_id` já liga o motorista a um usuário de identidade, e `trip_drivers` liga
o motorista à viagem. Então existe uma rota **sem parâmetro de viagem**:
`GET /me/trips/current` — o servidor resolve `membership → driver → trip` e devolve a viagem em
`dispatched` ou `in_transit` daquele motorista.

Não existe `GET /trips/:id` para o papel `driver`. Passar id no cliente é convidar o motorista a
trocar o id — e o BOLA (API1) é o campeão de vulnerabilidade em REST justamente aqui. Se ele não
escolhe, não há o que enumerar.

**O agregado vê a mesma tela do motorista próprio.** Ele precisa exatamente das mesmas informações
para entregar, e uma segunda variante de tela por causa de vínculo trabalhista seria complexidade sem
função.

`driver` e `aggregate` já têm `['trip.read', 'trip.report']` reservados em `authorization.policy.ts`
e sem consumidor nenhum. Esta feature é o consumidor: `trip.read` lê a viagem própria,
`trip.report` reporta chegada e entrega. Nenhum dos dois dá `trip.manage` nem `fleet.manage`.

### D2 — O contrato é do canal, não do PWA

O app nativo vem depois, e o WhatsApp talvez venha. Se as rotas nascerem desenhadas para uma tela,
os dois canais seguintes viram tradução. Então as rotas de execução são **de domínio**, não de tela:
`chegou na parada N`, `entregou o documento X`, `não entregou o documento X por Y`. Quem chama —
PWA hoje, app amanhã, webhook do WhatsApp depois — é irrelevante para o use case.

O corolário prático: **nenhuma regra de viagem mora no componente React**. O PWA é uma casca sobre
`/me/trips/*`, e a prova disso é que a suíte E2E chama as rotas sem browser nenhum.

### D3 — A posição carimba a entrega, e não segue o motorista

O celular consegue dar a coordenada, e ela vale como prova: é o que separa "entreguei" de
"entreguei _lá_". Então `Permissions-Policy` passa a `geolocation=(self)` — junto com o
`camera=(self)` que a 055 pede — e a captura acontece **uma vez por confirmação**, com
`getCurrentPosition`, nunca `watchPosition`.

Três limites, e nenhum é opcional:

1. **A recusa não bloqueia.** GPS desligado, sem sinal no galpão, permissão negada — a entrega é
   confirmada mesmo assim, com `location: null`. Um produto que exige coordenada para aceitar
   entrega é um produto que o motorista contorna anotando no papel.
2. **A coordenada é da entrega, não da pessoa.** Ela mora em `trip_stop_events`, presa ao evento, e
   nunca numa tabela de posição do motorista. Não existe "onde ele está agora" — só "onde estava
   quando confirmou".
3. **Ela tem prazo.** Retenção declarada em `docs/SECURITY.md` (proposta: 90 dias), com expurgo
   agendado; depois disso resta o evento sem a coordenada. Dado de localização de pessoa
   identificada é dado pessoal na LGPD, e reter para sempre "por garantia" é o que transforma um
   comprovante em passivo.

O rastreamento contínuo é uma decisão diferente, com consentimento próprio do motorista, e não entra
aqui.

### D4 — O comprovante é foto e assinatura, e a foto não vai para o log

Cada entrega aceita anexo: foto do canhoto e/ou **assinatura colhida na tela** — no PWA hoje, no
app nativo depois, pelo mesmo contrato (D2).

**Se a assinatura é obrigatória, quem decide é a empresa**, por configuração
(`requires_signature_on_delivery`), e não o código. Operações diferentes tratam o canhoto de formas
diferentes, e travar a entrega por uma regra fixa é o tipo de coisa que o motorista contorna dizendo
que o cliente recusou assinar.

**A assinatura colhe traço e nome do recebedor — nunca CPF.** Puxar CPF de recebedor para dentro do
sistema por causa de um comprovante é dado pessoal novo com criptografia em repouso, retenção e
trilha própria, desproporcional ao ganho: quando a disputa acontece, é o canhoto em papel que a
resolve. Se o valor legal da assinatura digital virar exigência de cliente ou de seguradora, isso é
decisão nova, e ela traz o CPF junto com o custo dele. Vai para o bucket
privado via `stored_objects` e `@adatechnology/object-storage-provider`, como o XML já faz — bucket
privado, entrega por presigned URL curta, chave do objeto **sem** nome de pessoa (`security.md` §7).

Foto é cara em 3G ruim: comprimir no cliente antes de subir, teto declarado, e upload em fila que
sobrevive à tela fechando.

### D5 — Offline é requisito, não polimento

O motorista entra no subsolo do shopping e sai sem sinal por vinte minutos. Se o toque em "entreguei"
falhar ali, ele para de usar o produto no mesmo dia.

O service worker já existe (`vite-plugin-pwa`). A viagem inteira é cacheada na abertura, e toda
confirmação vai para uma **fila local** (IndexedDB) drenada quando a rede volta. Duas coisas fazem
isso funcionar de verdade:

- **Idempotência de verdade**: cada confirmação carrega um id gerado no cliente, e o servidor
  guarda-o (o padrão de `*_processed_messages` que os workers já usam). Reenvio da fila não duplica
  entrega. O `apis.md` já exige chave de idempotência em `POST` que cria recurso.
- **A tela diz a verdade**: entrega na fila aparece como "aguardando envio", não como enviada.
  Mentir sobre sincronização é pior que não ter offline.

### D6 — Quando dá problema, ele avisa em dez segundos

Entrega que sai do previsto é rotina, e hoje o motivo volta por WhatsApp e morre lá. Então o PWA tem
um botão de **ocorrência**, disponível em qualquer parada, a qualquer momento: tipo de uma lista
fechada, descrição curta opcional, foto opcional.

Tipos: cobrança inesperada, espera longa, doca interditada, agendamento exigido, mercadoria avariada,
endereço não localizado, cliente fechado, outro.

Três regras que fazem isso ser usado em vez de contornado:

1. **Não pede decisão.** O motorista não escolhe valor, não classifica custo, não julga de quem é a
   culpa. Ele descreve o que viu. Quem decide é o escritório, com a 060 na mão.
2. **É independente da entrega.** Ele esperou duas horas _e_ entregou — os dois fatos convivem, e
   forçar a ocorrência a ser um motivo de não-entrega perderia o caso mais comum.
3. **Vai pela mesma fila offline** da D5, com a mesma idempotência. Problema costuma acontecer
   exatamente onde o sinal é ruim.

A ocorrência é matéria-prima, não conclusão: a 060 transforma a de cobrança em taxa sugerida, e as
demais em número — espera longa vira tempo medido, endereço não localizado vira correção de pino.

### D7 — Navegar é delegar

Botão "navegar" abre `geo:` / `https://maps.google.com/?q=` com o endereço da parada, no app que a
pessoa já usa e já confia. Construir navegação própria é competir com o Google Maps para entregar
uma seta pior.

## Histórias priorizadas

**P1 — a viagem do dia**
_Dado_ um motorista com uma viagem `dispatched`,
_quando_ ele abre o PWA,
_então_ vê as paradas na ordem congelada, com quantas notas e quantos volumes em cada, e a primeira
pendente destacada. Nenhuma outra viagem, de ninguém.

**P1 — cheguei**
_Dado_ a parada 3,
_quando_ ele toca em "cheguei",
_então_ `trip_stops.arrived_at` é gravado, a coordenada é carimbada se houver, e a viagem vai a
`in_transit` se ainda estiver em `dispatched`.

**P1 — entreguei**
_Dado_ uma parada com duas notas,
_quando_ ele confirma as duas,
_então_ elas vão a `delivered`, a parada a `completed_at`, e quando a última parada fecha a viagem
vai sozinha a `completed` (056 D1).

**P1 — não entreguei**
_Dado_ uma nota,
_quando_ ele registra a não-entrega,
_então_ escolhe um motivo de uma lista fechada (ausente, recusa, endereço não encontrado, avaria,
estabelecimento fechado) e a nota vai a `returned`.

**P1 — deu problema**
_Dado_ uma parada em que o cliente cobrou uma taxa não combinada,
_quando_ o motorista registra a ocorrência com foto do recibo,
_então_ ela é gravada na parada e aparece para o escritório — sem que ele precise informar valor
nenhum.

**P1 — sem sinal**
_Dado_ o celular offline,
_quando_ ele confirma três entregas,
_então_ as três entram na fila local, a tela mostra "aguardando envio", e ao voltar o sinal as três
sobem sem duplicar.

**P2 — o comprovante**
_Dado_ uma entrega,
_quando_ ele anexa foto do canhoto e colhe a assinatura,
_então_ os arquivos sobem para o bucket privado e ficam ligados ao evento de entrega.

**P2 — o escritório vê andar**
_Dado_ uma viagem `in_transit`,
_quando_ o operador abre a tela de viagem no desktop,
_então_ vê parada a parada o que já foi feito e a que horas, sem apertar nada — atualização por
`refetchInterval` do TanStack Query, não WebSocket novo.

**P3 — falar com quem despachou**
Botão que abre WhatsApp/telefone do responsável pela viagem. Um link, não uma integração.

## Requisitos funcionais

1. Rotas novas sob `trip.read`/`trip.report`, todas resolvendo o motorista pelo token:
   - `GET /me/trips/current`
   - `POST /me/trips/current/stops/:stopId/arrive`
   - `POST /me/trips/current/documents/:documentId/deliver`
   - `POST /me/trips/current/documents/:documentId/return`
   - `POST /me/trips/current/documents/:documentId/proof` (upload)
   - `POST /me/trips/current/stops/:stopId/occurrences` (D6, com anexo opcional)
   - `GET /me/trips/history` (últimas N viagens do motorista)
2. Todas aceitam `Idempotency-Key` e o honram (D5).
3. Nasce `trip_stop_occurrences`: parada, documento opcional, tipo (lista fechada), descrição,
   anexo em `stored_objects`, ator e hora. É consumida pela 060 (D4c de lá).
4. Nasce `trip_stop_events` com `latitude`/`longitude` nulos, precisão, e `captured_at`. É desta
   tabela que sai o tempo real de atendimento por parada — a medição que a 058 D6 e a 060 D6
   consomem. Ela nasce gravando `arrived_at` e `completed_at` com precisão de segundo por isso, e
   não porque a tela precisa.
5. `Permissions-Policy` → `geolocation=(self), camera=(self), microphone=()`. Microfone continua
   negado a todo mundo.
6. Frontend: workspace `/minha-viagem` no `resolveCurrentWorkspace` de `src/main.tsx`, **default
   para quem tem papel `driver`** — o motorista não deve cair na tela de NF-e.
7. Fila offline em IndexedDB com drenagem no `online` e no `sync` do service worker.
8. O desktop de viagem (056) ganha a coluna de execução: chegada, entrega, motivo de retorno.
9. Texto em `*.locale.json`.

## Requisitos não funcionais

- **A tela é do motorista, não do analista.** Alvo de toque ≥44px, contraste legível ao sol, fonte
  grande, e a ação principal ao alcance do polegar. Nada de tabela densa.
- Payload de `GET /me/trips/current` enxuto o bastante para abrir em 3G — sem XML, sem histórico de
  eventos, sem produto item a item que a tela não mostra.
- Nenhum dado pessoal do destinatário além do necessário para entregar (nome, endereço, telefone de
  contato). Nada disso em log (`security.md` §1).
- Token de vida curta com refresh rotativo — o celular do motorista é o dispositivo mais perdido da
  operação. Nada de refresh token em `localStorage` (`security.md` §8).
- Rate limit próprio nas rotas `/me/*`.

## Casos extremos e falhas

| Caso                                                             | Comportamento                                                                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Motorista em duas viagens `dispatched` ao mesmo tempo            | Devolve lista e a tela pede para escolher. A 056 não impede — dois veículos, dois dias.                          |
| Motorista sem viagem ativa                                       | `200` com corpo vazio e tela de "nada para hoje". Não é 404.                                                     |
| Viagem cancelada com o motorista na rua                          | A tela dele muda no próximo poll e explica; confirmações já enfileiradas são aceitas e registradas com ressalva. |
| Confirmação enfileirada de uma nota que o escritório desvinculou | O servidor recusa com código estável; a tela mostra o conflito em vez de sumir com o toque.                      |
| Coordenada absurda (0,0 / precisão de 5km)                       | Gravada com a precisão; a tela do escritório mostra a precisão junto. Nunca descartada em silêncio.              |
| Dois celulares logados no mesmo motorista                        | Ambos funcionam; a idempotência resolve a duplicata.                                                             |
| Foto de 12MB em 3G                                               | Comprimida no cliente; acima do teto, recusada com mensagem, nunca travando a entrega.                           |
| Bateria acaba com a fila cheia                                   | IndexedDB sobrevive; drena na próxima abertura.                                                                  |

## Critérios de aceite

- [ ] E2E chamando **só as rotas**, sem browser — a prova da D2.
- [ ] Teste de que `driver` não alcança `/trips/:id` nem nenhuma rota de `trip.manage`.
- [ ] Teste de idempotência: mesma `Idempotency-Key` duas vezes → uma entrega.
- [ ] Teste de entrega com `location: null` (D3.1).
- [ ] Teste de drenagem de fila offline (simulando `navigator.onLine`), incluindo ocorrência.
- [ ] Teste de que ocorrência e entrega bem-sucedida convivem na mesma nota (D6.2).
- [ ] Contrato que falha se `microphone` deixar de ser `()` no `Permissions-Policy`.
- [ ] Retenção de coordenada escrita em `docs/SECURITY.md` com o expurgo implementado, não só
      documentado.
- [ ] Conferido em 375px, com uma mão.
- [ ] `tsc --noEmit` + `make validate`.
- [ ] ADR (**0043**) sobre canal-agnóstico + posição pontual com retenção.

## Dúvidas

- `[NEEDS CLARIFICATION: o WhatsApp como canal do motorista é intenção real de curto prazo? Se for, ele muda a prioridade da D2 e pede uma spec própria — o número de telefone do motorista já está no cadastro, mas confirmação por conversa livre precisa de fluxo desenhado (`conversation-flow.md`).]`

## 🤖 Modelo

| Etapa                                                 | Modelo    |
| ----------------------------------------------------- | --------- |
| Desenho canal-agnóstico, LGPD da coordenada, ADR-0043 | `opus` 🧠 |
| Rotas, use cases, testes, fila offline                | `sonnet`  |
| Tela mobile, locale                                   | `sonnet`  |
