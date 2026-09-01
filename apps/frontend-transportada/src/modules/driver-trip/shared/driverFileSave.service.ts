/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * O DAMDFE chega como bytes, e o celular precisa abri-lo em algum lugar. O `blob:` vive o tempo de
 * um toque e é revogado logo em seguida: deixá-lo pendurado guardaria documento fiscal na memória
 * do navegador pelo resto da sessão.
 */
export function saveDriverFile(file: Readonly<{ blob: Blob; fileName: string }>): void {
  const url = URL.createObjectURL(file.blob)
  const anchor = document.createElement('a')
  anchor.download = file.fileName
  anchor.href = url
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
