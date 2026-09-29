/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const RAILWAY = readFileSync(new URL('../../../../.railway/railway.ts', import.meta.url), 'utf8')
const MAKEFILE = readFileSync(new URL('../../../../Makefile', import.meta.url), 'utf8')
const RUNBOOK = readFileSync(
  new URL('../../../../docs/runbooks/osrm-extract.md', import.meta.url),
  'utf8',
)
const MIRROR = readFileSync(
  new URL('../../../../scripts/osm-extract-mirror.ts', import.meta.url),
  'utf8',
)

describe('o extrato do OSM que alimenta mapa e rota (ADR-0044 §2 e §6)', () => {
  /**
   * ⚠️ **`-latest` não quer dizer "se atualiza".** Quer dizer *"seja qual for o arquivo do dia em
   * que alguém reconstruir"* — e reconstruir acontece por motivo alheio: mudar o `PORT`, subir a
   * versão do OSRM, um cache de build que expirou. O mapa trocava por baixo, sem decisão, sem
   * revisão e sem registro de qual mapa está rodando. Rota mudando sem mudança de código é a mesma
   * classe de problema que o adendo da ADR-0044 recusou no provedor pago.
   */
  test('a URL é datada, nunca -latest', () => {
    expect(RUNBOOK).not.toMatch(/curl -O \S*sudeste-latest/u)
    expect(MIRROR).toContain('--observed-on')
  })

  /**
   * ⚠️ **Fixar a URL do Geofabrik era fixar um arquivo que some.** O comentário que saiu daqui
   * dizia que o Geofabrik guarda os datados por uns 90 dias; medido em 28/09/2026, a janela é de 3 a
   * 7 — `260927`/`260926`/`260925` respondiam 200 e `260921`/`260914`/`260907` já davam 404. Foi essa
   * conta errada que deixou `osrm` e `map-tiles` em 404 no build de 25/09. O extrato agora é
   * espelhado no bucket, e a URL assinada vive no painel: assinatura não se versiona.
   */
  test('a IaC não fixa mais a URL de um arquivo que expira', () => {
    expect(RAILWAY).not.toContain('download.geofabrik.de')
    expect(RAILWAY).not.toContain('const OSM_EXTRACT_URL')
    expect(RAILWAY).toContain('OSRM_PBF_URL: preserve()')
    expect(RAILWAY).toContain('MAP_PBF_URL: preserve()')
  })

  /**
   * ⚠️ **A trava que era a constante compartilhada.** Mapa e rota em datas diferentes é a tela e o
   * roteirizador discordando de onde a rua está — e não dá erro nenhum, só produz um traço que passa
   * por onde o caminhão não vai. Tirar a URL do arquivo tirou junto o que mantinha os dois casados,
   * então quem confere passou a ser o alvo: ele lê as duas variáveis e recusa se divergirem.
   */
  test('o alvo recusa reconstruir com os dois em extratos diferentes', () => {
    const alvo = MAKEFILE.slice(MAKEFILE.indexOf('map-refresh:'))
    expect(alvo).toContain('OSRM_PBF_URL')
    expect(alvo).toContain('MAP_PBF_URL')
    expect(alvo).toMatch(/if \[ "\$\$osrm_key" != "\$\$tiles_key" \]/u)
    expect(alvo.slice(alvo.indexOf('tiles_key"'))).toContain('exit 2')
  })

  /**
   * ⚠️ **O objeto é permanente; só a assinatura vence.** É isso que torna a renovação barata: antes,
   * um 404 obrigava a bumpar a data, e a data arrasta o extrato de pedágio junto, que precisa
   * descrever o mesmo `.pbf`. Com `--presign-only` re-assina-se o mesmo objeto, e nada mais se move.
   */
  test('o espelho é create-only e sabe só re-assinar', () => {
    expect(MIRROR).toContain('--presign-only')
    expect(MIRROR).toContain('90 * 24 * 60 * 60')
    expect(MIRROR).toMatch(/já existe.*--presign-only/u)
  })

  /**
   * ⚠️ **`make` exporta variável de linha de comando para o ambiente da receita.** Medido em
   * 29/09/2026: com `RAILWAY_ENV` no ambiente, o CLI troca para modo token e responde
   * `Unauthorized. Please login` — mesmo com `-e staging` correto na linha, e sem dizer que a culpa
   * é do ambiente. O nome do override é o defeito; por isso ele fica fora do prefixo `RAILWAY_`.
   */
  test('o override de escopo fica fora do namespace que o CLI lê', () => {
    expect(MAKEFILE).toContain('$(if $(PROJECT_ID),-p $(PROJECT_ID))')
    expect(MAKEFILE).toContain('$(if $(ENVIRONMENT), -e $(ENVIRONMENT))')
    const alvo = MAKEFILE.slice(MAKEFILE.indexOf('map-refresh:'))
    expect(alvo).not.toMatch(/\$\(RAILWAY_(ENV|PROJECT)\)/u)
  })

  /**
   * ⚠️ **O `railway ... --json` escreve o mesmo JSON no stdout e no stderr.** Capturar com `2>&1`
   * devolve o documento duas vezes coladas, o `jq` recusa, e o alvo conclui "não está definida no
   * painel" sobre uma variável que está lá. É um diagnóstico errado apontando para o lugar errado —
   * o mesmo defeito de forma que o `staging-refresh` tinha.
   */
  test('o alvo lê o json sem colar o stderr nele', () => {
    const alvo = MAKEFILE.slice(MAKEFILE.indexOf('map-refresh:'))
    /** Só as leituras que alimentam o `jq`; o descarte do diagnóstico pode juntar os dois fluxos. */
    const leituras = alvo.match(/railway variables[^\n]*--json[^\n]*\|\s*jq/gu) ?? []
    expect(leituras.length).toBeGreaterThan(0)
    for (const leitura of leituras) expect(leitura).not.toContain('2>&1')
  })

  /** Reconstruir um sozinho é o defeito; o alvo existe para não haver caminho curto para ele. */
  test('o alvo reconstrói os dois, e não faz nada sem confirmação', () => {
    const alvo = MAKEFILE.slice(MAKEFILE.indexOf('map-refresh:'))
    expect(alvo).toContain('--service osrm')
    expect(alvo).toContain('--service map-tiles')
    expect(alvo).toContain('CONFIRM')
  })

  /**
   * ⚠️ **`redeploy` sem `--from-source` reimplanta a imagem existente, não reconstrói.** A data do
   * extrato é ARG de **build**: sem a bandeira, o comando fecha com sucesso, o serviço reinicia, e o
   * mapa continua exatamente o mesmo. É a pior forma de defeito — a que parece ter funcionado.
   */
  test('o alvo reconstrói de verdade, e não apenas reinicia', () => {
    const alvo = MAKEFILE.slice(MAKEFILE.indexOf('map-refresh:'))
    /** Por serviço, não por contagem: o texto de aviso do alvo também cita a bandeira. */
    expect(alvo).toMatch(/--service osrm --from-source/u)
    expect(alvo).toMatch(/--service map-tiles --from-source/u)
  })

  /**
   * ⚠️ `bunx railway` resolve o pacote npm, e o motor de IaC migrou para a CLI do sistema — o npm
   * responde "requires Railway CLI 5.42.1 or newer" mesmo com a CLI nova instalada.
   */
  test('usa a CLI do sistema, não o pacote npm', () => {
    const alvo = MAKEFILE.slice(MAKEFILE.indexOf('map-refresh:'))
    expect(alvo).not.toContain('bunx railway')
  })
})
