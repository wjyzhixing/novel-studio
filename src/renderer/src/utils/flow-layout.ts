type LayoutNode = { id: string; position: { x: number; y: number } }
type LayoutEdge = { source: string; target: string }

const GRAPH_COLUMNS = 3
const NODE_WIDTH = 220
const NODE_HEIGHT = 132
const COLUMN_GAP = 42
const ROW_GAP = 38

function positionNodes<T extends LayoutNode>(nodes: T[], positions: Map<string, { x: number; y: number }>): T[] {
  return nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position }))
}

export function formatGraphLayout<T extends LayoutNode>(nodes: T[], edges: LayoutEdge[]): T[] {
  const neighbors = new Map(nodes.map((node) => [node.id, new Set<string>()]))
  edges.forEach(({ source, target }) => {
    neighbors.get(source)?.add(target)
    neighbors.get(target)?.add(source)
  })

  const unvisited = new Set(nodes.map((node) => node.id))
  const components: string[][] = []
  while (unvisited.size > 0) {
    const start = [...unvisited].sort((left, right) => (neighbors.get(right)?.size ?? 0) - (neighbors.get(left)?.size ?? 0))[0]
    const queue = [start]
    const component: string[] = []
    unvisited.delete(start)
    while (queue.length > 0) {
      const current = queue.shift()!
      component.push(current)
      for (const neighbor of neighbors.get(current) ?? []) {
        if (!unvisited.has(neighbor)) continue
        unvisited.delete(neighbor)
        queue.push(neighbor)
      }
    }
    components.push(component)
  }

  const positions = new Map<string, { x: number; y: number }>()
  let componentY = 48
  components.forEach((component) => {
    const ordered = component.sort((left, right) => (neighbors.get(right)?.size ?? 0) - (neighbors.get(left)?.size ?? 0))
    const rows = Math.ceil(ordered.length / GRAPH_COLUMNS)
    ordered.forEach((id, index) => positions.set(id, {
      x: 56 + (index % GRAPH_COLUMNS) * (NODE_WIDTH + COLUMN_GAP),
      y: componentY + Math.floor(index / GRAPH_COLUMNS) * (NODE_HEIGHT + ROW_GAP)
    }))
    componentY += rows * (NODE_HEIGHT + ROW_GAP) + 64
  })
  return positionNodes(nodes, positions)
}

export function formatWorkflowLayout<T extends LayoutNode>(nodes: T[], edges: LayoutEdge[]): T[] {
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]))
  const indegree = new Map(nodes.map((node) => [node.id, 0]))
  edges.forEach(({ source, target }) => {
    if (!outgoing.has(source) || !indegree.has(target)) return
    outgoing.get(source)!.push(target)
    indegree.set(target, (indegree.get(target) ?? 0) + 1)
  })

  const levels = new Map<string, number>()
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id)
  queue.forEach((id) => levels.set(id, 0))
  for (let index = 0; index < queue.length; index += 1) {
    const source = queue[index]
    for (const target of outgoing.get(source) ?? []) {
      levels.set(target, Math.max(levels.get(target) ?? 0, (levels.get(source) ?? 0) + 1))
      indegree.set(target, (indegree.get(target) ?? 1) - 1)
      if (indegree.get(target) === 0) queue.push(target)
    }
  }

  // Keep cyclic or disconnected nodes visible in a deterministic fallback row.
  nodes.forEach((node, index) => { if (!levels.has(node.id)) levels.set(node.id, Math.floor(index / 4)) })
  const columns = [...new Set(levels.values())].sort((left, right) => left - right)
  const positions = new Map<string, { x: number; y: number }>()
  columns.forEach((level) => {
    const levelNodes = nodes.filter((node) => levels.get(node.id) === level)
    const totalHeight = (levelNodes.length - 1) * (NODE_HEIGHT + ROW_GAP)
    levelNodes.forEach((node, index) => positions.set(node.id, {
      x: 72 + level * (NODE_WIDTH + 92),
      y: Math.max(48, 280 - totalHeight / 2 + index * (NODE_HEIGHT + ROW_GAP))
    }))
  })
  return positionNodes(nodes, positions)
}
