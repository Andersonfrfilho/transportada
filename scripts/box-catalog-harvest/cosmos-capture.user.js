// ==UserScript==
// @name         TransportAdA — captura assistida de caixa
// @namespace    transportada
// @version      1.9.0
// @description  Cosmos: lê a caixa na página que VOCÊ abriu. Outros sites: selecione a medida e aperte Alt+C (caixa) ou Alt+U (unidade).
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_openInTab
// @connect      127.0.0.1
// ==/UserScript==

// Copyright (c) 2026 Anderson — Ada Technology. Licença: proprietária.
// Não navega sozinho: todo avanço e toda captura fora do Cosmos é um clique ou atalho seu.

;(function captureCarton() {
  'use strict'

  const SERVER_URL = 'http://127.0.0.1:53999'
  const COSMOS_PRODUCT_PATH = /^https:\/\/cosmos\.bluesoft\.com\.br\/produtos\//
  const FALLBACK_KEY = 'fallbackTarget'
  const MAX_SNIPPET_LENGTH = 4000
  const EDGE_PATTERN = /(comprimento|largura|altura|profundidade)\s*:?\s*([\d.,]+)\s*(mm|cm|m)\b/gi
  const TRIPLE_PATTERN = /([\d.,]+)\s*[x×]\s*([\d.,]+)\s*[x×]\s*([\d.,]+)\s*(mm|cm|m)\b/i
  const WEIGHT_PATTERN = /peso\s*bruto\s*:?\s*([\d.,]+)\s*(kg|g)\b/i
  const UNIT_WEIGHT_PATTERN = /(?:peso(?:\s*(?:bruto|l[ií]quido))?\s*:?\s*)?([\d.,]+)\s*(kg|g)\b/i
  const CAPTURE_KINDS = {
    carton: { key: 'KeyC', label: 'caixa', shortcut: 'Alt+C' },
    unit: { key: 'KeyU', label: 'unidade (o produto na prateleira)', shortcut: 'Alt+U' },
  }
  const QUANTITY_PATTERN = /(?:quantidade|unidades)(?:\s*(?:na|por)\s*caixa)?\s*:?\s*(\d+)/i
  const CARTON_GTIN_PATTERN = /\b([1-8]\d{13})\b/
  const SEARCH_ENGINE_HOST = /(^|\.)(google|bing|duckduckgo)\./

  const isCosmosProductPage = COSMOS_PRODUCT_PATH.test(window.location.href)

  function requestServer(method, path, body) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url: `${SERVER_URL}${path}`,
        headers: {
          'Content-Type': 'application/json',
          'X-Capture-Client': 'transportada-userscript',
        },
        data: body ? JSON.stringify(body) : undefined,
        timeout: 10000,
        onload: (response) => {
          try {
            resolve(JSON.parse(response.responseText))
          } catch {
            reject(new Error(`resposta inválida do servidor (HTTP ${response.status})`))
          }
        },
        onerror: () => reject(new Error('não alcancei o servidor local (127.0.0.1:53999)')),
        ontimeout: () => reject(new Error('servidor local não respondeu em 10 s')),
      })
    })
  }

  /** Etapa no console do navegador e no terminal do servidor, para diagnóstico. */
  function report(stage, detail = {}) {
    console.log('[TransportAdA]', stage, detail)
    GM_xmlhttpRequest({
      method: 'POST',
      url: `${SERVER_URL}/log`,
      headers: {
        'Content-Type': 'application/json',
        'X-Capture-Client': 'transportada-userscript',
      },
      data: JSON.stringify({ stage, url: window.location.href, ...detail }),
      timeout: 5000,
      onerror: () => console.log('[TransportAdA] log não chegou ao servidor'),
    })
  }

  const COSMOS_MISSING_CELL = /^[-–—]?$/

  function toCellNumber(cell) {
    if (COSMOS_MISSING_CELL.test(cell)) return undefined
    const value = Number(
      cell
        .replace(/\s*(?:cm|mm|m|kg|g)\s*$/i, '')
        .replace(/\./g, '')
        .replace(',', '.'),
    )
    return Number.isFinite(value) && value > 0 ? cell : undefined
  }

  /** Tabela de embalagens do Cosmos: GTIN | Tipo | Qtd | Lastro | Camada | Comprimento | Altura | Largura | Bruto | Líquido. */
  function extractCosmosTable() {
    const table = [...document.querySelectorAll('table')].find((candidate) =>
      /lastro/i.test(candidate.innerText),
    )
    if (!table) return undefined
    const headers = [...table.querySelectorAll('th')].map((header) =>
      (
        header.innerText.trim() ||
        header.getAttribute('title') ||
        header.querySelector('[title]')?.getAttribute('title') ||
        ''
      ).trim(),
    )
    const rows = [...table.querySelectorAll('tr')]
      .map((row) => [...row.cells].map((cell) => cell.innerText.trim()))
      .filter((cells) => cells.length >= 10 && /^\d{8,14}$/.test(cells[0]))
    const carton =
      rows.find((cells) => /^[1-8]\d{13}$/.test(cells[0])) ??
      rows.find((cells) => Number(cells[2]) > 1)
    if (!carton) return { headers, rows, edges: {} }
    const dimensionCells = carton.slice(5, 8).map(toCellNumber)
    const cellUnit = (cell) =>
      ((cell || '').match(/(cm|mm|m|kg|g)\s*$/i)?.[1] ?? 'cm').toLowerCase()
    const edges = dimensionCells.every(Boolean)
      ? {
          comprimento: { value: dimensionCells[0], unit: cellUnit(carton[5]) },
          altura: { value: dimensionCells[1], unit: cellUnit(carton[6]) },
          largura: { value: dimensionCells[2], unit: cellUnit(carton[7]) },
        }
      : {}
    return {
      headers,
      rows,
      edges,
      cartonGtin: carton[0],
      packaging: carton[1],
      unitsPerCarton: Number(carton[2]) || undefined,
      palletLayerCount: Number(carton[3]) || undefined,
      layerCount: Number(carton[4]) || undefined,
      grossWeight: toCellNumber(carton[8]) ? { value: carton[8], unit: 'kg' } : undefined,
      netWeight: toCellNumber(carton[9]) ? { value: carton[9], unit: 'kg' } : undefined,
    }
  }

  function findCartonSection(text) {
    const start = text.search(/caixa|embalagem|dados log[ií]sticos/i)
    return start === -1 ? '' : text.slice(start, start + MAX_SNIPPET_LENGTH)
  }

  function extractEdges(text) {
    const edges = {}
    for (const match of text.matchAll(EDGE_PATTERN)) {
      const name = match[1].toLowerCase()
      if (!edges[name]) edges[name] = { value: match[2], unit: match[3].toLowerCase() }
    }
    if (Object.keys(edges).length >= 3) return edges
    const triple = text.match(TRIPLE_PATTERN)
    if (!triple) return edges
    const unit = triple[4].toLowerCase()
    return {
      lado1: { value: triple[1], unit },
      lado2: { value: triple[2], unit },
      lado3: { value: triple[3], unit },
    }
  }

  function extractCarton(text) {
    const weight = text.match(WEIGHT_PATTERN)
    const quantity = text.match(QUANTITY_PATTERN)
    const cartonGtin = text.match(CARTON_GTIN_PATTERN)
    return {
      edges: extractEdges(text),
      grossWeight: weight ? { value: weight[1], unit: weight[2].toLowerCase() } : undefined,
      unitsPerCarton: quantity ? Number(quantity[1]) : undefined,
      cartonGtin: cartonGtin ? cartonGtin[1] : undefined,
    }
  }

  /** Spec 163: a unidade vai em `unitEdges`/`unitGrossWeight` — nunca no lugar da caixa. */
  function extractUnit(text) {
    const weight = text.match(UNIT_WEIGHT_PATTERN)
    return {
      edges: {},
      unitEdges: extractEdges(text),
      unitGrossWeight: weight ? { value: weight[1], unit: weight[2].toLowerCase() } : undefined,
    }
  }

  function createButton(label, onClick) {
    const button = document.createElement('button')
    button.textContent = label
    button.style.cssText = 'margin:8px 6px 0 0;padding:4px 10px;cursor:pointer'
    button.addEventListener('click', onClick)
    return button
  }

  function renderPanel(lines, buttons = []) {
    document.getElementById('transportada-capture-panel')?.remove()
    const panel = document.createElement('div')
    panel.id = 'transportada-capture-panel'
    panel.style.cssText =
      'position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#111;color:#fff;' +
      'padding:12px 14px;border-radius:8px;font:13px/1.4 system-ui;max-width:360px;box-shadow:0 4px 16px #0006'
    const text = document.createElement('div')
    text.innerText = lines.join('\n')
    panel.appendChild(text)
    for (const button of buttons) panel.appendChild(button)
    document.body.appendChild(panel)
  }

  function bindNextShortcut(nextUrl) {
    if (!nextUrl) return
    document.addEventListener('keydown', (event) => {
      if (event.altKey && event.code === 'KeyN') window.location.href = nextUrl
    })
  }

  function openSearch(query) {
    GM_openInTab(`https://www.google.com/search?q=${encodeURIComponent(query)}`, { active: true })
  }

  function describeEdges(edges) {
    return Object.entries(edges).map(([name, edge]) => `${name}: ${edge.value} ${edge.unit}`)
  }

  function renderFallback(captured, next, productName) {
    GM_setValue(FALLBACK_KEY, {
      cartonGtin: captured.cartonGtin,
      unitGtin: captured.unitGtin,
      nextUrl: next.url,
    })
    const nameQuery = productName ? `"${productName}" ` : ''
    renderPanel(
      [
        'Cosmos sem a medida da caixa.',
        'Ache a medida em outro site, selecione o texto e aperte Alt+C lá.',
        'Só achou a medida do produto (unidade)? Selecione e aperte Alt+U.',
        `Restam ${next.remaining ?? 0}`,
      ],
      [
        createButton('Buscar GTIN', () =>
          openSearch(`"${captured.unitGtin}" OR "${captured.cartonGtin}" caixa dimensões`),
        ),
        createButton('Buscar ficha logística', () =>
          openSearch(`${nameQuery}ficha logística caixa lastro camada`),
        ),
        createButton('Buscar PDF', () =>
          openSearch(`"${captured.unitGtin}" OR "${captured.cartonGtin}" filetype:pdf`),
        ),
        ...(next.url
          ? [createButton('Pular (Alt+N)', () => (window.location.href = next.url))]
          : []),
      ],
    )
  }

  async function runCosmosCapture() {
    report('page_loaded', { title: document.title, textLength: document.body.innerText.length })
    if (
      /you are being rate limited|banned you temporarily|error 1015/i.test(document.body.innerText)
    ) {
      report('rate_limited_1015')
      GM_xmlhttpRequest({
        method: 'POST',
        url: `${SERVER_URL}/report-block`,
        headers: {
          'Content-Type': 'application/json',
          'X-Capture-Client': 'transportada-userscript',
        },
        data: JSON.stringify({ reason: '1015', url: window.location.href }),
        timeout: 5000,
        onerror: () => console.log('[TransportAdA] aviso de bloqueio não chegou ao servidor'),
      })
      return renderPanel([
        'TransportAdA: Cloudflare bloqueou este IP por excesso de requisições (Error 1015).',
        'O ensaio parou sozinho — espere alguns minutos antes de continuar.',
      ])
    }
    if (document.title.includes('Just a moment')) {
      report('cloudflare_challenge')
      return renderPanel([
        'TransportAdA: aguardando a verificação do Cloudflare.',
        'Conclua a verificação; a página recarrega sozinha.',
      ])
    }
    renderPanel(['TransportAdA: script ativo, lendo a página…'])
    const unitGtin = window.location.pathname.split('/').filter(Boolean).pop()
    const text = document.body.innerText
    const isNotFound = /produto n[aã]o encontrado|p[aá]gina n[aã]o encontrada/i.test(text)
    const section = findCartonSection(text)
    const extracted = extractCosmosTable() ?? extractCarton(section)
    const edgeCount = Object.keys(extracted.edges).length
    const status = isNotFound ? 'not_found' : edgeCount >= 3 ? 'found' : 'no_dimensions'
    report('extracted', {
      status,
      edgeCount,
      fromTable: Boolean(extracted.rows),
      headers: extracted.headers,
      cartonRow: extracted.rows?.find((cells) => cells[0] === extracted.cartonGtin),
    })

    try {
      const next = await requestServer('POST', '/capture', {
        unitGtin,
        status,
        pageUrl: window.location.href.split('?')[0],
        extracted,
        snippet: section,
      })
      report('server_response', {
        error: next.error,
        ignored: next.ignored,
        remaining: next.remaining,
      })
      if (next.error)
        return renderPanel([
          `Erro do servidor: ${next.error}`,
          'Reinicie o servidor e recarregue a página.',
        ])
      bindNextShortcut(next.url)
      if (next.ignored)
        return renderPanel(
          ['Produto fora da fila (já capturado) — nada gravado.', `Restam ${next.remaining ?? 0}`],
          next.url
            ? [createButton('Próximo da fila (Alt+N)', () => (window.location.href = next.url))]
            : [],
        )
      if (status !== 'found')
        return renderFallback(next.captured, next, document.querySelector('h1')?.innerText?.trim())
      renderPanel(
        [`Gravado: ${status}`, ...describeEdges(extracted.edges), `Restam ${next.remaining ?? 0}`],
        next.url ? [createButton('Próximo (Alt+N)', () => (window.location.href = next.url))] : [],
      )
    } catch (error) {
      report('capture_failed', { message: String(error.message) })
      renderPanel([
        String(error.message),
        'Rode: bun scripts/box-catalog-harvest/assisted-capture-server.ts',
      ])
    }
  }

  let autoDetected

  /** Página alternativa que cita o GTIN: lê as medidas perto da citação e pede confirmação. */
  function detectOnAlternativePage() {
    const target = GM_getValue(FALLBACK_KEY, undefined)
    if (!target || SEARCH_ENGINE_HOST.test(window.location.hostname)) return
    const text = document.body.innerText
    const position = [target.unitGtin, target.cartonGtin]
      .map((gtin) => text.indexOf(gtin))
      .filter((index) => index !== -1)
      .sort((left, right) => left - right)[0]
    if (position === undefined) return
    const snippet = text.slice(Math.max(0, position - 1500), position + 2500)
    const extracted = extractCarton(snippet)
    if (Object.keys(extracted.edges).length < 3) return
    autoDetected = { extracted, snippet }
    renderPanel(
      [
        `Achei medidas nesta página para ${target.cartonGtin}:`,
        ...describeEdges(extracted.edges),
        'Confira se são da CAIXA (não da unidade).',
      ],
      [
        createButton('Confirmar (Alt+C)', () => captureSelection('carton')),
        createButton('Não é isso', () => {
          autoDetected = undefined
          document.getElementById('transportada-capture-panel')?.remove()
        }),
      ],
    )
  }

  async function captureSelection(kind) {
    const { label, shortcut } = CAPTURE_KINDS[kind]
    const target = GM_getValue(FALLBACK_KEY, undefined)
    if (!target)
      return renderPanel(['Nenhum produto aguardando medida. Comece pela fila do Cosmos.'])
    const selection = String(window.getSelection() ?? '').trim()
    // O trecho detectado sozinho é sempre da caixa: a unidade só entra por seleção sua.
    const detected = kind === 'carton' ? autoDetected : undefined
    if (!selection && !detected)
      return renderPanel([
        `Selecione o texto com as medidas da ${label} e aperte ${shortcut} de novo.`,
      ])
    const snippet = selection || detected.snippet
    const extracted = kind === 'unit' ? extractUnit(snippet) : extractCarton(snippet)
    const capturedEdges = kind === 'unit' ? extracted.unitEdges : extracted.edges
    if (Object.keys(capturedEdges).length < 3) {
      return renderPanel([
        'Não achei 3 medidas na seleção.',
        'Ex.: "47,4 x 24,7 x 24,0 cm" ou Comprimento/Largura/Altura.',
      ])
    }
    try {
      const next = await requestServer('POST', '/capture-manual', {
        cartonGtin: target.cartonGtin,
        kind,
        pageUrl: window.location.href,
        extracted,
        snippet,
      })
      if (next.error) return renderPanel([`Erro do servidor: ${next.error}`])
      // A unidade não resolve a caixa: o produto segue aguardando a medida dela (Alt+C).
      if (kind === 'carton') GM_setValue(FALLBACK_KEY, undefined)
      bindNextShortcut(target.nextUrl)
      renderPanel(
        [
          `Gravada a ${label} de ${target.cartonGtin} (fonte: ${window.location.hostname})`,
          ...describeEdges(capturedEdges),
        ],
        target.nextUrl
          ? [
              createButton(
                'Voltar para a fila (Alt+N)',
                () => (window.location.href = target.nextUrl),
              ),
            ]
          : [],
      )
    } catch (error) {
      renderPanel([String(error.message)])
    }
  }

  document.addEventListener('keydown', (event) => {
    if (!event.altKey) return
    if (event.code === CAPTURE_KINDS.carton.key) captureSelection('carton')
    if (event.code === CAPTURE_KINDS.unit.key) captureSelection('unit')
  })

  console.log('[TransportAdA] script carregado', window.location.href)
  if (isCosmosProductPage) runCosmosCapture()
  else detectOnAlternativePage()
})()
