# Objetivo — terminar as specs pendentes

> Criado em 2026-08-26. Este arquivo é o plano de execução do conjunto; cada spec continua com o
> próprio `tasks.md`. Aqui fica **a ordem e o porquê dela**.

## Regra de conclusão

Vale para toda spec deste plano, sem exceção:

- **Nada é dado por concluído sem verificação executada.** "Compila" não é "funciona".
- Teste que só existe contra fixture não prova encanamento. Onde houver integração ou smoke que
  exercite o caminho real, ele roda antes de a spec ser marcada.
- A spec só recebe `evidence.md` depois de a verificação existir — e o que ficou de fora entra
  escrito nele. **Spec marcada como concluída com buraco silencioso é pior que spec aberta**: a
  próxima pessoa confia nela.
- Modelo por fase conforme `model-economy.md`; fase 🧠 pede `opus` e a sessão para antes de começar.

## Estado inicial (verificado no código)

| Spec    | Tamanho | O que é                                 | Estado                                          |
| ------- | ------- | --------------------------------------- | ----------------------------------------------- |
| **048** | 141     | OCR do CRLV preenche a ficha do veículo | ✅ fase CRLV; CNH/ANTT bloqueadas               |
| **057** | 272     | PWA do motorista — a viagem no bolso    | ✅ concluída                                    |
| **058** | —       | roteiro se sugere sozinho               | ✅ P1; **P2 multi-veículo pendente**            |
| **059** | 226     | MDF-e nasce da viagem completa          | ⚠️ parcial: manual ok, gatilho falta            |
| **060** | 383     | cliente tem janela de entrega e taxa    | só `spec.md`                                    |
| **061** | 216     | a viagem fecha a conta (margem real)    | só `spec.md`                                    |
| **062** | 235     | WhatsApp como canal                     | só `spec.md`                                    |
| **063** | 206     | portal do cliente                       | só `spec.md`                                    |
| **064** | —       | portal do agregado                      | `tasks.md`, sem `evidence.md`                   |
| **066** | 184     | o MEI chega com anexo                   | só `spec.md` — quatro dúvidas abertas           |
| **065** | 190     | o caminhão sai antes do documento       | só `spec.md` — **corrige dois defeitos da 059** |

## Ordem, e a razão dela

A ordem **não** é por tamanho: é por dependência de dado. Construir consumidor antes do produtor
gera tela que mostra vazio e mediana que nunca sai do padrão — foi o que aconteceu com a D6 da 058,
que lê `arrived_at`/`completed_at` que **nada no sistema escreve** ainda.

```
048 ──┐
      ├──> 059 ──> 065 ──> 061
057 ──┴──────────────┘
060 ──> 063
062 (independente)
058-P2 (independente)
```

**A 065 entrou na frente da 061 e ela é corretiva.** A ordem real da operação não é a que a 059
assume: **o caminhão sai antes de qualquer emissão**. O CT-e é emitido depois, por lote inteiro, e só
quando a contratante autoriza; a NFS-e das entregas urbanas sai junto; o MDF-e nasce por último. Disso
saem dois defeitos no que já está no código:

1. **O portão exige `dispatched` exato.** Quando o lote autoriza, a viagem já está `in_transit` ou
   `completed` — o portão recusa o caso normal.
2. **A prontidão só conhece CT-e.** Entrega dentro do município da transportadora vira NFS-e e nunca
   terá CT-e: a nota ficaria `no_cte` para sempre e uma carga mista travaria a viagem inteira.

E há um vazio operacional que ninguém preenche: entre a saída do caminhão e o MDF-e, o motorista não
tem o que mostrar. A 065 dá a ele o romaneio da carga.

### 1. 048 — OCR preenche a ficha do veículo

Independente, e a infraestrutura **já existe**: o OCR de CNH/CRLV do agregado foi construído nesta
base (`aggregate-document-ocr`). É estender o que há para o cadastro de veículo do painel, não criar
pipeline novo. Menor risco, e entrega valor sozinha.

### 2. 057 — PWA do motorista

**É o produtor de dado que três specs esperam.** Hoje `arrived_at` e `completed_at` são colunas que
ninguém escreve; sem elas a mediana da 058 devolve `default` para sempre, e a 061 não tem custo real
de viagem. Fazer 061 antes de 057 é calcular margem sobre dado que não existe.

Depende de decisão sua: app instalável (PWA) confirmado pela spec, mas o modo offline e a captura de
comprovante têm custo próprio.

### 3. 059 — MDF-e nasce da viagem completa

A emissão já funciona; a spec fecha o laço para a viagem inteira nascer manifesto. Depende da 056
(feita) e conversa com a 057 (o que aconteceu na rua).

### 4. 060 — cliente tem hora e preço

Produz a janela de entrega que a **058 já sabe consumir** (`trip_stops.delivery_window_*` existe e o
solver a penaliza), e a taxa que a 061 precisa. Destrava a 063.

### 5. 061 — a viagem fecha a conta

Margem real por viagem. Precisa do custo que a 057 mede e da taxa que a 060 cadastra.

### 6. 063 — portal do cliente

Superfície para o cliente agendar a entrega (060 D3) e o contratante aprovar repasse (060 D5). Sem a
060 não há o que agendar.

### 7. 062 — WhatsApp

Independente das demais, mas envolve **decisão externa** — provedor, custo por conversa, número
oficial. Fica por último de propósito: é a única cujo bloqueio não é técnico.

### 8. 058 P2 — sugestão multi-veículo

Pool de notas → quais notas em qual veículo, propondo as viagens. O solver **já resolve múltiplos
veículos** e o schema já comporta (`route_suggestions.trip_id` anulável); falta a rota, o caso de uso
que carrega notas não vinculadas, o aceite que **cria** viagens, e a tela.

### Fora do plano original — registrada depois

- **083 — servir `/map-tiles` e `/route-map/area.pmtiles`** (2026-09-03): os dois mapas pedem
  telhas de um caminho que nenhum servidor atende; o frontend degrada com aviso desde a mesma data.
  Spec em `specs/083-servir-map-tiles/spec.md`, com duas decisões abertas antes de implementar.

- **085 — a carga cabe, e em que ordem ela entra** (2026-09-05): baú por fileiras na tela
  Nova viagem, porta lateral na ficha do veículo, e cadastro de caixa que se popula pela
  importação. Medido em 345 NF-e reais: a NF-e **não traz dimensão** (345/345), mas
  `qVol` = Σ `qCom` em 100% e **o fator de cubagem cancela na divisão do baú** — o desenho
  não precisa de calibragem. Spec em `specs/085-a-carga-cabe-e-em-que-ordem/`, evidência em
  `evidence.md`. As duas decisões abertas foram fechadas: a unidade é **a caixa de papelão**
  (não paletizado), e o `catalog-module` **não** é alterado nem consumido — a medida mora em
  `nfe_package_boxes` aqui (ADR-0062). ⚠️ Falta o que só o uso produz: **nenhuma caixa foi medida
  ainda**, e a cobertura real da ocupação continua zero até o conferente descer a fila.

- **088 — onde encostar a carga** (2026-09-06): a 085 respondeu "cabe, e em que ordem"; falta
  "onde encosto". Planta do baú em escala, vista de cima, com a faixa de cada entrega em metros e na
  ordem inversa da descarga. ⚠️ **A descoberta que ordena a spec:** a ficha do veículo nunca pediu as
  três medidas do baú — as colunas existem desde a 075, `resolveVehicleCapacity` as prefere, e o
  formulário só pergunta `Capacidade (m³)`. Por isso estão zeradas em **8 de 8** veículos. A escala
  sai da ficha e **não** da referência de mercado: a dispersão dentro de um tipo chega a 2×, e errar
  2× em metro na tela de quem vai medir com fita é pior que não desenhar. Medido também: 6 de 663
  caixas medidas, o que mantém o empacotamento caixa a caixa fora do escopo. Spec, plano e tasks em
  `specs/088-onde-encostar-a-carga/` — **sem decisão em aberto**.

- **087 — toda rota de 204 falha no navegador quando chamada de outra origem** (2026-09-06):
  medido num experimento controlado durante a 085 — mesma rota, mesmo método, mesmo corpo, só o
  status mudando: `200` passa e `204` faz o `fetch` lançar `TypeError: Failed to fetch`, com a
  escrita **já efetivada** no banco. Construir o 204 no molde das outras rotas daqui (com
  `cache-control: no-store` no construtor) não muda nada. A causa não foi isolada, e o alcance é
  toda rota que responde 204 chamada do painel: `PUT /company-users/:id/password`, os `DELETE` de
  ajuste de combustível, `PUT`/`DELETE` de busca automática, e as duas de `password-resets`. O
  sintoma é traiçoeiro porque **a escrita funciona** — a tela mostra falha sobre um efeito que
  aconteceu, e quem estiver do outro lado repete a ação. `POST /nfe-package-boxes/:id` desviou para
  `200` com corpo vazio, com o motivo escrito na rota, enquanto isso não é resolvido.


## O que este plano não promete

Cada spec deste conjunto tem o porte da 058, que consumiu uma sessão inteira de trabalho. O plano é
sequencial e verificável, não uma entrega única — e cada spec fechada é publicável sozinha.

Duas dependem de decisão que não é minha: a **062** (provedor de WhatsApp e custo) e a parte da
**057** que define até onde vai o offline. Elas serão sinalizadas quando chegarem, não presumidas.
