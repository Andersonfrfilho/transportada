# Tasks

> 🤖 Modelo: `sonnet` (T001 e T010 são 🧠 — validar com `opus` antes)

## Fase 1 — o mapa mostra o caminho

- [ ] **T001** 🧠 Descobrir por que a parada não tem coordenada — a geocodificação **já existe**
      (ADR-0044, spec 069: BrasilAPI pelo CEP como degrau primário, centroide de município como
      último, cache quente e rotina de população). Quem escreve `geocoded_addresses` é o **worker**,
      no caminho da sugestão de roteiro; a API do detalhe só lê. Hipótese a confirmar: viagem que
      nunca passou por sugestão nunca teve endereço geocodificado. Evidência: consulta mostrando
      as paradas desta viagem sem linha em `geocoded_addresses`.
- [ ] **T002** Geocodificar a parada no vínculo da nota, não só na sugestão — reusando
      `geocode-address.use-case.ts` como está. Contrato: endereço já geocodificado não chama
      provedor de novo (a chave é o cache), e falha do provedor não impede vincular a nota.
- [ ] **T003** [P] Rotina de retaguarda para endereço já gravado, com a pausa de cortesia que a
      rotina de população já usa. Contrato: reexecutar não duplica linha nem rechama o provedor.
- [ ] **T004** Trajetória: porta de rota no OSRM interno
      (`/route/v1/driving/...?overview=full&geometries=geojson`), guardada por viagem e invalidada
      quando a ordem das paradas muda. Contrato: o navegador nunca fala com o OSRM; OSRM fora do ar
      devolve viagem sem linha, com os pinos de pé.
- [ ] **T005** Desenhar a linha em `TripRouteMap`, na mesma projeção dos pinos (a correção pelo
      cosseno da latitude já existe em `tripRouteMap.service.ts`). Contrato: parada sem coordenada
      continua nomeada fora do mapa.

## Fase 2 — o que é barato e é regra

- [ ] **T006** [P] Ícone em todo botão de ação da viagem (`web.md` §9) — contrato de tela.
- [ ] **T007** [P] Número do endereço no rótulo da parada — vem de `nfe_addresses`; hoje o rótulo
      monta rua, cidade e UF. Contrato: endereço sem número não imprime vírgula solta.
- [ ] **T008** [P] Emitir CT-e na linha da nota, além do painel de prontidão fiscal. Contrato: nota
      que já tem CT-e não oferece a ação.

## Fase 3 — os números que faltam

- [ ] **T009** Motorista com telefone e e-mail no detalhe, vindos de `fleet_drivers`.
      ⚠️ A ADR-0039 decidiu criptografar o telefone do motorista e avisa que **escrever leitor para
      esses campos obriga a abrir envelope** — conferir a ADR antes de expor, e registrar no
      `evidence.md` se este vira o primeiro leitor.
- [ ] **T010** 🧠 A conta da viagem com ganho e custo previstos, ou a razão da ausência. Investigar
      antes se o painel de `trip-financials` está sem fiação ou sem dado (viagem sem frete
      calculado). Contrato: sem cálculo, a tela diz por quê — nunca zero.

## Fase 4 — a carga e o andamento

- [ ] **T011** Juntar ocupação, peso e mapa de carga num painel só, com a origem estimada dita uma
      vez. Contrato: nenhum número sem a origem ao lado (CA2 da 079 continua valendo).
- [ ] **T012** Desenhar o baú com as caixas na **ordem de carregamento**.
      ⚠️ Sem posição de peça: a nota da 079 T003 continua valendo — a NF-e não traz dimensão de
      volume, e sugerir canto é enganar. Contrato: o desenho não afirma empilhamento.
- [ ] **T013** O andamento vira etapas de processo com estado atual e transição animada,
      respeitando `prefers-reduced-motion`. Investigar antes por que a barra atual não anima — pode
      ser dado que não muda, não CSS.

`[P]` significa que a tarefa pode executar em paralelo sem editar os mesmos arquivos. Marque como
concluída apenas após registrar evidência em `evidence.md`.
