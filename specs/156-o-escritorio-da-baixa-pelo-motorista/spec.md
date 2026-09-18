# Spec 156 — O escritório dá baixa pelo motorista

- Status: rascunho para aprovação
- Data: 2026-09-18
- Módulos: `apps/api-transportada` (`trips`, `identity`) · `apps/frontend-transportada` (`modules/trip`,
  `components/ui`)
- Herda: spec 056 (a nota anda pela viagem), spec 057 (app web do motorista, `/me/trips`), ADR-0057
  (comprovante configurável), ADR-0058 (conferir carga e iniciar trajeto), spec 079 (ver o comprovante
  na tela), spec 152 (padrão de função experimental com interruptor por empresa)
- Não mexe em: app nativo (`transportada-mobile`, spec 082), fluxo do WhatsApp (spec 144)

## Problema

O motorista registra no PWA (`/minha-viagem`) cada etapa da entrega: conferir a carga, iniciar o
trajeto, chegar na parada, registrar ocorrência, anexar o comprovante com a foto do canhoto e marcar a
nota como entregue ou devolvida. Na prática, muitos motoristas não fazem isso pelo aplicativo. Eles
voltam com os canhotos na mão, e a viagem continua `in_transit` para sempre.

Quem resolve é o administrativo, pela tela da viagem (`/trips/:id`). Hoje essa tela não permite:

- conferir a carga, iniciar o trajeto ou registrar a chegada na parada;
- registrar ocorrência de parada, e ocorrência de nota só para uma nota por vez;
- anexar comprovante (a spec 079 só mostra o comprovante que o motorista mandou);
- entregar várias notas de uma vez (a API aceita `deliver` no `batch-status`, mas a tela não oferece);
- informar **quando** a entrega aconteceu (a baixa do escritório chega dias depois).

Há também um defeito: com a viagem em `on_delivery_route`, a tela esconde entregar e devolver, e a
API aceita as duas (`tripStatus.service.ts` × `trip-state.policy.ts:103`).

## Resultado esperado

Um usuário do administrativo com a permissão nova abre a viagem e dá a baixa que o motorista não deu:
inicia a rota, registra chegadas e ocorrências e entrega as notas com a foto do canhoto de cada uma,
uma de cada vez ou várias juntas. Na entrega em massa, a câmera mostra por cima do preview os dados
da nota que está pedindo a foto. Quando o código de barras da chave aparece na foto, o sistema
identifica sozinho a nota fotografada e avisa se ela não bate com a nota pedida. Tudo o que o
escritório registra fica na linha do tempo como "registrado por <usuária> (escritório) pelo
motorista <nome>".

## Usuários

- **Administrativo/gerencial** (`admin`, `operator`, `finance`) com `trip.report-on-behalf`: resolve a baixa que
  ficou pendente, normalmente dias depois e com o maço de canhotos na mesa.
- **Motorista** (`driver`, `aggregate`): nada muda para ele; continua com `trip.report` e as rotas `/me`.
- **Separador** (`separator`): continua sem reportar entrega; não recebe a permissão nova.

## Decisões

- **D1 — Permissão nova `trip.report-on-behalf`**, dada a `admin`, `operator` e `finance`. Não reusa
  `trip.manage`, porque o separador tem essa permissão e não reporta entrega. Também não reusa
  `trip.report`, porque ela abre as rotas `/me` do motorista. _(Decisão do usuário: "permissão nova
  para a parte gerencial".)_ Perfis confirmados pelo usuário em 2026-09-18: `admin`, `operator` e `finance` (o canhoto às
  vezes chega junto da cobrança). A permissão também pode vir por grupo da empresa; o aceite 1 vale
  por papel. Registrada na ADR-0067, que revisa a ADR-0058 §4 só para deixar o escritório disparar os
  dois toques (a máquina de estados e o ranking anti-regressão não mudam).
- **D2 — As rotas do escritório espelham as do motorista**, com o `tripId` no caminho em vez da
  "viagem atual". Os casos de uso são os mesmos. O que muda é **como a viagem é encontrada**: pelo
  motorista (rotas `/me`) ou pela viagem da empresa (rotas `/trips/:id`). Não se cria um segundo
  caminho de regra, e a política de estados (`trip-state.policy.ts`) vale igual para os dois.
- **D3 — Autoria: o escritório em nome do motorista.** Todo registro de campo passa a gravar o
  `channel` (`driver_app | office | whatsapp`) e, quando o canal é `office`, o `on_behalf_of_driver_id`
  (o motorista da viagem). `actor_user_id` continua sendo quem clicou. A linha do tempo mostra os dois.
  Também grava trilha em `audit_logs` (security.md §10). _(Decisão do usuário.)_
  - **Vários motoristas:** por padrão é o motorista de `position = 1` em `trip_drivers`. O payload
    pode trazer um `driverId` escolhido entre os motoristas da viagem; fora da viagem responde 422
    `DRIVER_NOT_ON_TRIP`. Viagem sem motorista responde 422 `TRIP_WITHOUT_DRIVER`. A tela só mostra
    o seletor quando a viagem tem mais de um motorista.
  - **Isolamento:** viagem de outra empresa responde 404, não 403. A FK é composta,
    `(company_id, on_behalf_of_driver_id)`.
  - **Idempotência:** a mesma tabela `trip_field_reports`, com `operation` própria prefixada
    `office.`. A mesma chave enviada por outro ator responde 422 `IDEMPOTENCY_KEY_REUSED`.
  - **Baixa repetida:** no canal `office`, nota já `delivered` ou `returned` responde 409
    `DOCUMENT_ALREADY_SETTLED`, sem evento novo. O canal do motorista continua idempotente como hoje.
    Anexar o canhoto a uma entrega já feita é ação própria (`field-proof`): anexa ao evento
    `delivered` existente, substitui pelo unique `(company, stop_event, kind)` da ADR-0057, e não cria
    evento nem muda `delivered_at`.
- **D4 — A hora da entrega é informada.** A baixa do escritório registra quando a entrega
  **aconteceu**, não quando foi digitada. O campo é "Entregue em", que vem preenchido com agora e pode
  ser mudado. Não aceita hora futura nem anterior ao despacho da viagem
  (`trip_dispatch_snapshots.dispatched_at`). O horário em que o registro foi feito fica gravado à
  parte (`recorded_at`, coluna nova da T4).
- **D5 — Entrega em massa: uma foto de canhoto por nota.** O usuário marca as notas e abre um
  assistente que passa por uma nota de cada vez. Em cada passo, o preview da câmera mostra por cima o
  número e a série da nota, o destinatário e a cidade. O usuário tira a foto, confere e segue, ou
  pula a nota. No fim, uma confirmação envia cada nota com o próprio comprovante. Cada nota é uma
  operação idempotente separada: se uma falhar, as outras seguem, e a tela lista o que falhou para
  tentar de novo. _(Decisão do usuário: "foto do canhoto de cada nota no preview da câmera com
  informações da nota".)_
- **D6 — Identificar a nota pela foto, sem nunca decidir sozinho.** A ordem de tentativa é:
  1. **Código de barras da chave de acesso** (Code128, 44 dígitos), com o leitor que já existe
     (`@zxing/library`, `barcodeDecoder.service.ts`). Só funciona quando a foto pega o corpo do DANFE,
     não só o canhoto destacado.
  2. **Número da nota por OCR**, comparado apenas com as notas daquela viagem. É **experimental**,
     desligado por padrão e com interruptor por empresa, no mesmo padrão da spec 152. Fica na Fase 5
     e não bloqueia o resto.
  3. **Escolha manual** entre as notas selecionadas. É sempre possível.

  Se a nota identificada for outra nota da seleção, o assistente oferece trocar. Se não pertencer à
  viagem, **bloqueia** com a mensagem "este canhoto é da nota X, que não está nesta viagem". Nenhuma
  foto é gravada numa nota sem o usuário confirmar o passo.

- **D7 — Ocorrência em massa.** O mesmo tipo de ocorrência, com a mesma observação e a mesma foto
  opcional, pode ser aplicado a várias notas marcadas (ex.: "cliente ausente" em uma parada com três
  notas). Grava uma ocorrência por nota.
- **D8 — O comprovante segue a configuração da empresa (ADR-0057), com uma exceção explícita à
  ADR-0057 §1.** Se a empresa exige foto, o escritório não conclui a entrega sem ela. Assinatura
  **não** é colhida pelo escritório, porque quem assina é o recebedor. Com assinatura `required`, o
  escritório cumpre com a foto do canhoto assinado mais o nome de quem recebeu. Isso fica registrado
  como comprovante do canal `office`, não como assinatura digital. O documento do recebedor digitado
  pelo escritório passa pelo mesmo envelope e pela mesma máscara da ADR-0057 §3.
- **D11 — O `finance` lê a viagem sem ler a frota.** Uma variante de política "qualquer uma de"
  (`anyPermission`), com `['fleet.read', 'trip.report-on-behalf']`, vale **só** para `GET /trips`,
  `GET /trips/:id`, `GET /trips/:id/stops`, `GET …/documents/:documentId/proof` e
  `GET …/documents/:documentId/occurrences`. Sem `fleet.read`, `driverTaxId`, `driverEmail` e
  `driverPhone` vêm nulos; `driverName` fica. Rejeitados: dar `fleet.read` ao `finance` (expõe CPF,
  CNH, PIX e endereço de todos os motoristas, security.md §1) e reusar `trip.read` (BOLA).
- **D9 — O arquivo vai pela API, como no motorista.** O envio é multipart, validado pelo mesmo
  `delivery-proof.schema.ts`. A imagem é reduzida no navegador antes de subir (lado maior ≤ 2000 px,
  JPEG). Não se cria link de upload direto nesta spec.
- **D10 — Corrigir a divergência de `on_delivery_route`** no frontend, com teste, antes de qualquer
  outra tela. A regra do frontend passa a vir da mesma tabela de ações da API, exposta na resposta de
  `GET /trips/:id` (`allowedActions`), em vez de ser reescrita no cliente.

## Fora do escopo

- EDI de ocorrência (Proceda/OCOREN) para o embarcador.
- Mudanças no app nativo e no fluxo do WhatsApp (apenas passam a gravar `channel`).
- Assinatura digital colhida pelo escritório.
- Link de upload direto para o storage.

## Critérios de aceite

1. Sem `trip.report-on-behalf`, as ações de campo não aparecem na tela, e as rotas respondem 403,
   mesmo para quem tem `trip.manage`. Isso vale inclusive para o separador.
2. Com a permissão, numa viagem `in_transit`: iniciar a rota leva a viagem a `on_delivery_route`, e a
   linha do tempo mostra "por <usuária> (escritório) pelo motorista <nome>".
3. Viagem de outra empresa responde 404, não 403, e não vaza que a viagem existe.
4. Com a viagem em `on_delivery_route`, a tela mostra entregar e devolver (D10).
5. Entrega em massa com 5 notas: cada passo mostra a nota certa sobre a câmera. Ao pular 1 nota,
   só as 4 fotografadas ficam `delivered`, cada uma com o próprio comprovante e o "Entregue em"
   informado.
6. Foto com o código de barras de outra nota da seleção: o assistente oferece trocar. Código de uma
   nota fora da viagem: o assistente bloqueia.
7. Falha de rede em 1 das 5 notas: as outras 4 gravam, e a que falhou aparece para tentar de novo.
   Repetir não duplica comprovante nem evento (idempotência).
8. "Entregue em" no futuro, ou antes do despacho, responde 400 com código estável.
9. Com a empresa exigindo foto, a entrega sem foto responde 422, igual acontece com o motorista.
10. Ocorrência em massa em 3 notas grava 3 ocorrências, dispara a notificação configurada de cada
    uma, e cada uma aparece em `/ocorrencias`.
11. Nenhum log contém a imagem, o documento de quem recebeu ou o nome do destinatário (security.md §1).
12. Dar baixa pelo escritório numa nota já entregue ou devolvida responde 409
    `DOCUMENT_ALREADY_SETTLED` e não cria evento. Anexar o canhoto depois (`field-proof`) não muda
    `delivered_at`.
13. Viagem com dois motoristas: sem `driverId`, a autoria vai para o de `position = 1`; com `driverId`
    de fora da viagem, responde 422 `DRIVER_NOT_ON_TRIP`.
14. O `finance` abre a viagem (200 nas cinco leituras do D11) com `driverTaxId` nulo, e continua com
    403 em `/fleet/drivers`, no feed e na geometria.

## Pendências

Nenhuma. D1 confirmada em 2026-09-18.
