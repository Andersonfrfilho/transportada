# 057 — A viagem cabe no bolso do motorista · evidência

> Concluída em 2026-08-26. O que ficou de fora está no fim, escrito — e é a parte deste arquivo que
> importa para quem chegar depois.

## O que rodou

| Comando                                                | Resultado                                                 |
| ------------------------------------------------------ | --------------------------------------------------------- |
| `make migration-test`                                  | **86** testes — aplica, exercita as constraints e reverte |
| `bun run --cwd apps/api-transportada test`             | **3261** contratos, 0 falhas                              |
| `bun run --cwd apps/api-transportada test:integration` | **149** testes contra Postgres, 0 falhas                  |
| `make worker-integration`                              | **57** testes, 0 falhas                                   |
| `bun run --cwd apps/frontend-transportada test`        | **2029** contratos, 0 falhas                              |
| `ENV_FILE=../../.env bun run smoke`                    | **38** cenários no navegador, 0 falhas                    |
| `typecheck` + `lint` nas quatro apps                   | limpos                                                    |
| `bun run --cwd apps/frontend-transportada build`       | `built in 2.71s`                                          |

## O que cada verificação provou

| Decisão                                         | Como ela está travada                                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D2 — o contrato é do canal, não do PWA**      | `test/integration/me-trip.integration.ts` executa a viagem inteira — chegar, entregar duas, ocorrência, devolver, fechar — **sem browser nenhum**      |
| **D1 — o motorista não escolhe id**             | contrato sobre as rotas: nenhuma leva `:id` nem `:tripId`, e todas ficam sob `/me/trips/current`                                                       |
| `driver` não alcança o escritório               | contrato que varre **as políticas declaradas** das rotas de viagem e checa contra as permissões do papel — não uma lista de caminhos que alguém mantém |
| **D3.1 — a recusa de GPS não bloqueia**         | contrato do caso de uso + CHECK do banco: entrega sem coordenada nenhuma é aceita nos dois níveis                                                      |
| Coordenada meia não entra                       | `trip_stop_events_coordinates_check` e `trip_stop_events_accuracy_check`, exercitados contra Postgres                                                  |
| Precisão de 5 km é gravada, não descartada      | inserção explícita no teste de migration — galpão de laje é o caso normal, não o suspeito                                                              |
| **D3.3 — retenção de 90 dias com expurgo real** | rotina no `JOB_CATALOG` das quatro apps + integração com **relógio injetado**: o evento de 91 dias perde a coordenada e mantém `arrived_at`            |
| **D5 — a fila offline não duplica**             | integração contra Postgres: três chegadas com a mesma chave devolvem o mesmo evento e a tabela tem **uma** linha                                       |
| **D5 — a tela diz a verdade**                   | smoke com a rede abortada de verdade: o toque fica "aguardando envio" e nada sobe                                                                      |
| **D6.2 — ocorrência e entrega convivem**        | dois contratos: a ocorrência não muda estado de nota nenhuma, e a entrega da mesma nota funciona logo depois                                           |
| **D7 — a assinatura não colhe CPF**             | não há coluna para ele; e a chave do objeto no bucket tem contrato próprio provando que não leva nome de pessoa                                        |
| Filtro de tenant                                | teste negativo na integração: o motorista de outra empresa abre o app e não enxerga a viagem, nem alcança a parada dela                                |
| `Permissions-Policy`                            | contrato que quebra nos dois sentidos, e um teste **só** para o microfone continuar `()`                                                               |
| A CSP não mudou                                 | `dist/content-security-policy.txt` sai do build com o mesmo sha256 de antes da spec (`c7ade7eb…`)                                                      |

## Dois defeitos meus que a verificação pegou

1. **Eu tinha escrito "nota já entregue → 409".** Está errado, e a 056 já explicava por quê no
   comentário do `checkTripDocumentTransition`: a fila offline drena muito depois do toque, e uma
   entrega que **funcionou** voltaria como conflito para o motorista que fez tudo certo. Corrigido
   para reusar a política da 056 em vez de manter uma segunda lista de estado terminal.
2. **O contrato do catálogo de rotinas lia o seed de uma migration só.** O relógio não nasce inteiro
   numa migration — cada rotina nova semeia a linha dela na sua —, então ele diria "não foi semeada"
   sobre uma rotina semeada, e deixaria de acusar a ausência de verdade na rotina seguinte.

E três violações de design system que os contratos da casa pegaram na tela do motorista: `<select>`
nativo em campo de escolha, parágrafo de "carregando" no lugar do esqueleto, e a origem do mapa sem
declaração na política de conteúdo. É para isso que esses contratos existem.

## O que ficou de fora, e é para a próxima pessoa saber

1. **A assinatura na tela não existe.** A rota aceita `kind: 'signature'` com o nome do recebedor, o
   banco guarda, e o contrato está fechado — mas o PWA só oferece **foto do canhoto**. O traço em
   canvas é trabalho próprio (área de desenho, toque, exportação, acessibilidade) e não foi feito.
2. **O comprovante não passa pela fila offline.** Ele anexa a uma entrega já confirmada e falhar não
   desfaz nada — a tela diz isso por extenso. Mas foto tirada sem sinal se perde: enfileirar arquivo
   é outro problema (tamanho, cota do aparelho, expurgo da fila) e está declarado em vez de
   resolvido pela metade.
3. **`GET /me/trips/history` não existe.** A RF-1 a lista; nada na tela a consome hoje, e uma rota
   sem consumidor é superfície de ataque sem função.
4. **O `sync` do service worker não é usado.** A drenagem acontece no evento `online` e na abertura
   da tela. `Background Sync` drenaria com o app fechado; não está ligado.
5. **A tela não mostra a janela de entrega** (`delivery_window_*`). A coluna existe e o payload a
   carrega — quem a preenche é a **060**, que ainda é só spec. A tela nasce pronta para ela.
6. **Nada foi conferido em aparelho real.** O smoke roda em 375px no Chromium; toque de dedo, sol na
   tela e 3G de verdade são outra coisa. O RNF de "uma mão, ao sol" está atendido no papel — alvo de
   44px, uma coluna, contraste por token — e não medido com gente usando.
7. **Duas viagens despachadas: a tela mostra a primeira.** O servidor devolve as duas (é o caso que a
   spec nomeia), e a escolha na tela não foi construída.

## Auditoria de segurança (§15 do `code-standart.md`)

- **Nenhum log de PII**, em nível nenhum. O expurgo conta quantas coordenadas caíram, nunca quais; o
  hook do PWA descarta a mensagem de erro do pdf.js e da rede porque ela carrega trecho de conteúdo.
- **Autorização por objeto** sem objeto a escolher: `/me/trips/current` resolve pelo token, e o teste
  negativo de tenant roda contra Postgres.
- **Idempotência no servidor**, não no cliente: reserva por `insert` num unique dentro da transação.
- **Bucket privado** para o comprovante, chave sem nome de pessoa, nenhuma URL pública no caminho.
- Nenhum valor arbitrário na tela nova; texto todo em `*.locale.json` com paridade travada.
