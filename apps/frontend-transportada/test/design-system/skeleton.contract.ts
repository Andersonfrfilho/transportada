import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const SKELETON_COMPONENT_PATH = 'src/components/ui/skeleton.tsx'
const SKELETON_STYLES_PATH = 'src/components/ui/skeleton.module.css'
const LOADING_TEXT_ONLY_PATTERN = /<p[^>]*>\{t\(['"][^'"]*loading[^'"]*['"]\)\}<\/p>/i

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function listModuleComponents(): Promise<readonly string[]> {
  const entries = await readdir(new URL('src/modules', APPLICATION_ROOT), { recursive: true })
  return entries.filter((entry) => entry.endsWith('.tsx')).map((entry) => `src/modules/${entry}`)
}

describe('design system skeleton contract', () => {
  test('publishes a single skeleton primitive and group wrapper in the design system', async () => {
    const component = await readApplicationFile(SKELETON_COMPONENT_PATH)

    expect(component).toContain('export function Skeleton(')
    expect(component).toContain('export function SkeletonGroup(')
    expect(component).toContain('variant')
    expect(component).toContain("aria-hidden=\"true\"")
    expect(component).toContain('role="status"')
  })

  test('forbids a lone translated loading paragraph as the entire loading state', async () => {
    const components = await listModuleComponents()
    const offenders: string[] = []

    for (const filePath of components) {
      const source = await readApplicationFile(filePath)
      if (LOADING_TEXT_ONLY_PATTERN.test(source)) offenders.push(filePath)
    }

    expect(offenders).toEqual([])
    expect(components.length).toBeGreaterThan(20)
  })

  test('animates with a shimmer that respects reduced motion and only tokens', async () => {
    const styles = await readApplicationFile(SKELETON_STYLES_PATH)

    expect(styles).toContain('@keyframes skeletonShimmer')
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(styles).toContain('animation: none')
    expect(styles).toContain('var(--color-')
    expect(styles).toContain('var(--space-')
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(styles).not.toMatch(/\brgba?\(/)
  })

  test('states the rule for every future loading state', async () => {
    const [rule, projectContext] = await Promise.all([
      readApplicationFile('../../docs/frontend/loading.md'),
      readApplicationFile('../../CLAUDE.md'),
    ])

    expect(rule).toContain('components/ui/skeleton')
    expect(rule).toContain('mesma forma do conteúdo real')
    expect(projectContext).toContain('docs/frontend/loading.md')
  })
})
