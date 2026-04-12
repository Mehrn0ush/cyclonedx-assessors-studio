<template>
  <div class="relationship-graph" ref="containerRef" :class="{ 'show-edge-labels': showLabels }">
    <div v-if="relationships.length === 0 && (!graphEdges || graphEdges.length === 0)" class="relationship-graph__empty">
      No relationships to visualize
    </div>
    <svg v-else ref="svgRef" class="relationship-graph__svg"></svg>
    <div v-if="relationships.length > 0 || (graphEdges && graphEdges.length > 0)" class="relationship-graph__footer">
      <div class="relationship-graph__legend">
        <div class="legend-item" v-for="type in legendTypes" :key="type.key">
          <span class="legend-line" :style="{ backgroundColor: type.color }"></span>
          <span class="legend-label">{{ type.label }}</span>
        </div>
      </div>
      <div class="relationship-graph__label-toggle">
        <el-switch v-model="showLabels" size="small" />
        <span>{{ t('relationships.showEdgeLabels') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import * as d3 from 'd3'

const { t } = useI18n()

interface RelationshipRow {
  id: string
  relatedEntityId: string
  relatedEntityName: string
  relationshipType: string
  direction: 'parent' | 'child' | 'other'
}

interface GraphEdge {
  id: string
  sourceEntityId: string
  sourceName: string
  targetEntityId: string
  targetName: string
  relationshipType: string
}

interface Props {
  entityId: string
  entityName: string
  relationships: RelationshipRow[]
  /** Full transitive graph edges (used when available, overrides relationships) */
  graphEdges?: GraphEdge[]
  /** All entities in the graph */
  graphEntities?: Array<{ id: string; name: string }>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'navigate': [entityId: string]
}>()

const containerRef = ref<HTMLElement>()
const svgRef = ref<SVGElement>()
const showLabels = ref(false)

const relationshipColors: Record<string, string> = {
  owns: '#3fb950',
  governs: '#a371f7',
  contains: '#2f81f7',
  supplies: '#f0883e',
  depends_on: '#f85149',
  consumes: '#db61a2',
  assesses: '#d2a8ff',
  produces: '#7ee787',
}

const legendTypes = [
  { key: 'owns', label: 'Owns', color: '#3fb950' },
  { key: 'governs', label: 'Governs', color: '#a371f7' },
  { key: 'contains', label: 'Contains', color: '#2f81f7' },
  { key: 'supplies', label: 'Supplies', color: '#f0883e' },
  { key: 'depends_on', label: 'Depends On', color: '#f85149' },
  { key: 'consumes', label: 'Consumes', color: '#db61a2' },
  { key: 'assesses', label: 'Assesses', color: '#d2a8ff' },
  { key: 'produces', label: 'Produces', color: '#7ee787' },
]

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  isCurrent: boolean
  __dragStartX?: number
  __dragStartY?: number
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  type: string
  direction: 'parent' | 'child' | 'other'
  // Curvature offset for parallel edges between the same node pair
  curveOffset: number
}

let simulation: d3.Simulation<GraphNode, GraphLink> | null = null

/**
 * Compute a hierarchical (layered) layout for a directed graph.
 * 1. Find connected components
 * 2. For each component, assign layers via longest-path from roots
 * 3. Order nodes within layers using barycenter heuristic to reduce crossings
 * 4. Position components side by side
 */
function computeHierarchicalLayout(
  nodes: GraphNode[],
  links: GraphLink[],
  width: number,
  height: number,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()

  // Build adjacency lists (using IDs, before simulation resolves refs)
  const childrenOf = new Map<string, string[]>()
  const parentsOf = new Map<string, string[]>()
  const nodeIds = new Set(nodes.map(n => n.id))

  for (const n of nodes) {
    childrenOf.set(n.id, [])
    parentsOf.set(n.id, [])
  }
  for (const l of links) {
    const src = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id
    const tgt = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id
    childrenOf.get(src)?.push(tgt)
    parentsOf.get(tgt)?.push(src)
  }

  // Find connected components (undirected)
  const visited = new Set<string>()
  const components: string[][] = []
  for (const nid of nodeIds) {
    if (visited.has(nid)) continue
    const comp: string[] = []
    const stack = [nid]
    while (stack.length > 0) {
      const cur = stack.pop()!
      if (visited.has(cur)) continue
      visited.add(cur)
      comp.push(cur)
      for (const c of (childrenOf.get(cur) || [])) { if (!visited.has(c)) stack.push(c) }
      for (const p of (parentsOf.get(cur) || [])) { if (!visited.has(p)) stack.push(p) }
    }
    components.push(comp)
  }

  // Sort components by size descending so larger graphs get more space
  components.sort((a, b) => b.length - a.length)

  // Layout each component
  const componentLayouts: Array<{ nodePositions: Map<string, { x: number; y: number }>; w: number; h: number }> = []

  for (const comp of components) {
    const compSet = new Set(comp)

    // Find roots: nodes with no parents within this component
    const roots = comp.filter(id => {
      const parents = parentsOf.get(id) || []
      return parents.filter(p => compSet.has(p)).length === 0
    })

    // Assign layers via BFS from roots (longest path for proper depth)
    const layer = new Map<string, number>()
    // Initialize all to 0
    for (const id of comp) layer.set(id, 0)

    // Topological ordering with longest path
    const inDegree = new Map<string, number>()
    for (const id of comp) {
      inDegree.set(id, (parentsOf.get(id) || []).filter(p => compSet.has(p)).length)
    }
    const queue = roots.slice()
    const topoOrder: string[] = []
    while (queue.length > 0) {
      const cur = queue.shift()!
      topoOrder.push(cur)
      for (const child of (childrenOf.get(cur) || [])) {
        if (!compSet.has(child)) continue
        // Longest path: child layer = max(current, parent + 1)
        layer.set(child, Math.max(layer.get(child)!, layer.get(cur)! + 1))
        const newDeg = inDegree.get(child)! - 1
        inDegree.set(child, newDeg)
        if (newDeg === 0) queue.push(child)
      }
    }

    // Handle any nodes not reached (cycles) by placing them at layer 0
    for (const id of comp) {
      if (!topoOrder.includes(id)) {
        topoOrder.push(id)
      }
    }

    // Group nodes by layer
    const maxLayer = Math.max(...comp.map(id => layer.get(id) ?? 0), 0)
    const layers: string[][] = Array.from({ length: maxLayer + 1 }, () => [])
    for (const id of comp) {
      const layerIdx = layer.get(id)
      if (layerIdx !== undefined) {
        layers[layerIdx].push(id)
      }
    }

    // Insert virtual (dummy) nodes for edges that span more than one layer.
    // This is the standard Sugiyama technique: it lets the barycenter heuristic
    // route long edges around intermediate nodes, preventing overlaps.
    const virtualNodes = new Set<string>()
    const expandedChildren = new Map<string, string[]>()
    const expandedParents = new Map<string, string[]>()
    // Copy original adjacency for this component
    for (const id of comp) {
      expandedChildren.set(id, (childrenOf.get(id) || []).filter(c => compSet.has(c)))
      expandedParents.set(id, (parentsOf.get(id) || []).filter(p => compSet.has(p)))
    }

    // Collect long-span edges and insert dummies
    const longEdges: Array<{ src: string; tgt: string }> = []
    for (const id of comp) {
      for (const child of (childrenOf.get(id) || [])) {
        if (!compSet.has(child)) continue
        const srcLayer = layer.get(id)!
        const tgtLayer = layer.get(child)!
        if (tgtLayer - srcLayer > 1) {
          longEdges.push({ src: id, tgt: child })
        }
      }
    }

    for (const { src, tgt } of longEdges) {
      const srcLayer = layer.get(src)!
      const tgtLayer = layer.get(tgt)!

      // Remove direct edge from expanded adjacency
      const srcKids = expandedChildren.get(src)!
      const idx1 = srcKids.indexOf(tgt)
      if (idx1 >= 0) srcKids.splice(idx1, 1)
      const tgtPars = expandedParents.get(tgt)!
      const idx2 = tgtPars.indexOf(src)
      if (idx2 >= 0) tgtPars.splice(idx2, 1)

      // Create chain: src -> v1 -> v2 -> ... -> tgt
      let prev = src
      for (let li = srcLayer + 1; li < tgtLayer; li++) {
        const vid = `__virtual_${src}_${tgt}_L${li}`
        virtualNodes.add(vid)
        layer.set(vid, li)
        layers[li].push(vid)
        expandedChildren.set(vid, [])
        expandedParents.set(vid, [])
        // Link prev -> vid
        const prevChildren = expandedChildren.get(prev)
        if (prevChildren) prevChildren.push(vid)
        const vidParents = expandedParents.get(vid)
        if (vidParents) vidParents.push(prev)
        prev = vid
      }
      // Link last virtual -> tgt
      const prevChildren = expandedChildren.get(prev)
      if (prevChildren) prevChildren.push(tgt)
      const tgtParents = expandedParents.get(tgt)
      if (tgtParents) tgtParents.push(prev)
    }

    // Barycenter ordering using expanded adjacency (includes virtual nodes)
    const posInLayer = new Map<string, number>()
    for (const lay of layers) {
      lay.forEach((id, i) => posInLayer.set(id, i))
    }

    // Multiple sweep passes for better crossing reduction
    for (let pass = 0; pass < 4; pass++) {
      // Down sweep
      for (let li = 1; li <= maxLayer; li++) {
        const bary = new Map<string, number>()
        for (const id of layers[li]) {
          const pars = (expandedParents.get(id) || []).filter(p => layer.get(p)! < li)
          if (pars.length > 0) {
            const avg = pars.reduce((sum, p) => sum + (posInLayer.get(p) || 0), 0) / pars.length
            bary.set(id, avg)
          } else {
            bary.set(id, posInLayer.get(id) || 0)
          }
        }
        layers[li].sort((a, b) => bary.get(a)! - bary.get(b)!)
        layers[li].forEach((id, i) => posInLayer.set(id, i))
      }
      // Up sweep
      for (let li = maxLayer - 1; li >= 0; li--) {
        const bary = new Map<string, number>()
        for (const id of layers[li]) {
          const kids = (expandedChildren.get(id) || []).filter(c => layer.get(c)! > li)
          if (kids.length > 0) {
            const avg = kids.reduce((sum, c) => sum + (posInLayer.get(c) || 0), 0) / kids.length
            bary.set(id, avg)
          } else {
            bary.set(id, posInLayer.get(id) || 0)
          }
        }
        layers[li].sort((a, b) => bary.get(a)! - bary.get(b)!)
        layers[li].forEach((id, i) => posInLayer.set(id, i))
      }
    }

    // Compute positions within this component (local coordinates)
    // Only position real nodes, skip virtual ones
    const layerSpacingY = 100
    const nodeSpacingX = 120
    const maxNodesInLayer = Math.max(...layers.map(l => l.length), 1)
    const compWidth = maxNodesInLayer * nodeSpacingX
    const compHeight = (maxLayer + 1) * layerSpacingY

    const localPos = new Map<string, { x: number; y: number }>()
    for (let li = 0; li <= maxLayer; li++) {
      const layerWidth = layers[li].length * nodeSpacingX
      const offsetX = (compWidth - layerWidth) / 2
      for (let ni = 0; ni < layers[li].length; ni++) {
        const id = layers[li][ni]
        if (virtualNodes.has(id)) continue // skip virtual nodes
        localPos.set(id, {
          x: offsetX + ni * nodeSpacingX + nodeSpacingX / 2,
          y: li * layerSpacingY + layerSpacingY / 2,
        })
      }
    }

    componentLayouts.push({ nodePositions: localPos, w: compWidth, h: compHeight })
  }

  // Arrange components side by side, centered vertically
  const componentGap = 80
  const totalWidth = componentLayouts.reduce((sum, cl) => sum + cl.w, 0) + componentGap * Math.max(0, componentLayouts.length - 1)
  const maxHeight = Math.max(...componentLayouts.map(cl => cl.h), 100)

  // Center the whole arrangement in the available space
  let cursorX = (width - totalWidth) / 2
  if (cursorX < 40) cursorX = 40

  for (const cl of componentLayouts) {
    const yOffset = (maxHeight - cl.h) / 2 + (height - maxHeight) / 2
    for (const [id, pos] of cl.nodePositions) {
      positions.set(id, { x: cursorX + pos.x, y: yOffset + pos.y })
    }
    cursorX += cl.w + componentGap
  }

  return positions
}

const buildGraph = () => {
  const hasGraphData = props.graphEdges && props.graphEdges.length > 0
  const hasRelData = props.relationships.length > 0
  if (!svgRef.value || !containerRef.value || (!hasGraphData && !hasRelData)) return

  // Clear previous
  d3.select(svgRef.value).selectAll('*').remove()
  if (simulation) simulation.stop()

  const width = containerRef.value.clientWidth
  const edgeCount = hasGraphData ? props.graphEdges!.length : props.relationships.length
  const height = Math.max(300, Math.min(600, edgeCount * 50 + 100))

  const svg = d3.select(svgRef.value)
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)

  // Build nodes and links
  const nodeMap = new Map<string, GraphNode>()
  if (props.entityId) {
    nodeMap.set(props.entityId, { id: props.entityId, label: props.entityName, isCurrent: true })
  }

  const links: GraphLink[] = []

  if (hasGraphData) {
    // Use full transitive graph data
    for (const ent of (props.graphEntities || [])) {
      if (!nodeMap.has(ent.id)) {
        nodeMap.set(ent.id, { id: ent.id, label: ent.name, isCurrent: ent.id === props.entityId })
      }
    }
    for (const edge of props.graphEdges!) {
      if (!nodeMap.has(edge.sourceEntityId)) {
        nodeMap.set(edge.sourceEntityId, { id: edge.sourceEntityId, label: edge.sourceName, isCurrent: false })
      }
      if (!nodeMap.has(edge.targetEntityId)) {
        nodeMap.set(edge.targetEntityId, { id: edge.targetEntityId, label: edge.targetName, isCurrent: false })
      }
      const direction = edge.sourceEntityId === props.entityId ? 'child' as const
        : edge.targetEntityId === props.entityId ? 'parent' as const
        : 'other' as const
      links.push({ source: edge.sourceEntityId, target: edge.targetEntityId, type: edge.relationshipType, direction, curveOffset: 0 })
    }
  } else {
    // Fallback to direct relationships only
    for (const rel of props.relationships) {
      if (!nodeMap.has(rel.relatedEntityId)) {
        nodeMap.set(rel.relatedEntityId, { id: rel.relatedEntityId, label: rel.relatedEntityName, isCurrent: false })
      }
      const source = rel.direction === 'parent' ? rel.relatedEntityId : props.entityId
      const target = rel.direction === 'parent' ? props.entityId : rel.relatedEntityId
      links.push({ source, target, type: rel.relationshipType, direction: rel.direction, curveOffset: 0 })
    }
  }

  // Compute curve offsets for parallel edges between the same node pair.
  // Group links by their undirected node pair, then spread them symmetrically.
  const pairMap = new Map<string, GraphLink[]>()
  for (const link of links) {
    const srcId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id
    const tgtId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id
    const pairKey = [srcId, tgtId].sort().join('|')
    if (!pairMap.has(pairKey)) pairMap.set(pairKey, [])
    const pairLinks = pairMap.get(pairKey)
    if (pairLinks) pairLinks.push(link)
  }
  for (const group of pairMap.values()) {
    if (group.length <= 1) continue
    const spread = 40
    for (let i = 0; i < group.length; i++) {
      group[i].curveOffset = (i - (group.length - 1) / 2) * spread
    }
  }

  const nodes = Array.from(nodeMap.values())

  // Compute hierarchical positions to minimize edge crossings
  const idealPositions = computeHierarchicalLayout(nodes, links, width, height)

  // Initialize node positions from the hierarchical layout
  for (const n of nodes) {
    const pos = idealPositions.get(n.id)
    if (pos) {
      n.x = pos.x
      n.y = pos.y
    }
  }

  // Node radius helper
  const nodeRadius = (d: GraphNode) => d.isCurrent ? 22 : 16

  // Arrow markers for each relationship type
  const defs = svg.append('defs')
  for (const [type, color] of Object.entries(relationshipColors)) {
    defs.append('marker')
      .attr('id', `arrow-${type}`)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 10)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', color)
  }

  // Use force simulation with strong position forces guided by hierarchical layout
  simulation = d3.forceSimulation<GraphNode>(nodes)
    .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(100).strength(0.1))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('collision', d3.forceCollide().radius(50))
    .force('x', d3.forceX<GraphNode>(d => idealPositions.get(d.id)?.x ?? width / 2).strength(0.8))
    .force('y', d3.forceY<GraphNode>(d => idealPositions.get(d.id)?.y ?? height / 2).strength(0.8))

  // Helper: compute the curved path with endpoints clipped to circle edges
  const computeCurve = (d: GraphLink) => {
    const s = d.source as GraphNode
    const t = d.target as GraphNode
    const ox = s.x!, oy = s.y!, ex = t.x!, ey = t.y!
    const dx = ex - ox, dy = ey - oy
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    // Normal perpendicular to the line
    const nx = -dy / len, ny = dx / len
    const offset = d.curveOffset
    // Control point at the midpoint, offset perpendicular to the line
    const cpx = (ox + ex) / 2 + nx * offset
    const cpy = (oy + ey) / 2 + ny * offset

    // Shorten start: move along tangent from source toward control point
    const sr = nodeRadius(s)
    const sdx = cpx - ox, sdy = cpy - oy
    const slen = Math.sqrt(sdx * sdx + sdy * sdy) || 1
    const sx = ox + (sdx / slen) * sr
    const sy = oy + (sdy / slen) * sr

    // Shorten end: move along tangent from target toward control point
    const tr = nodeRadius(t)
    const tdx = cpx - ex, tdy = cpy - ey
    const tlen = Math.sqrt(tdx * tdx + tdy * tdy) || 1
    const tx = ex + (tdx / tlen) * tr
    const ty = ey + (tdy / tlen) * tr

    return { sx, sy, tx, ty, cx: cpx, cy: cpy }
  }

  // Links as curved paths
  const linkGroup = svg.append('g')
  const link = linkGroup.selectAll('path')
    .data(links)
    .join('path')
    .attr('fill', 'none')
    .attr('stroke', d => relationshipColors[d.type] || '#6e7681')
    .attr('stroke-width', 2)
    .attr('stroke-opacity', 0.7)
    .attr('marker-end', d => `url(#arrow-${d.type})`)

  // Link labels (hidden by default, toggled via .show-edge-labels class on container)
  const linkLabel = linkGroup.selectAll('text')
    .data(links)
    .join('text')
    .attr('class', 'edge-label')
    .attr('text-anchor', 'middle')
    .attr('fill', d => relationshipColors[d.type] || '#8b949e')
    .attr('font-size', '10px')
    .attr('dy', -6)
    .text(d => d.type.replace(/_/g, ' '))

  // Node groups
  const nodeGroup = svg.append('g')
  const node = nodeGroup.selectAll('g')
    .data(nodes)
    .join('g')
    .attr('cursor', 'pointer')
    .call((d3.drag<SVGGElement, GraphNode>() as any)
      .clickDistance(4) // movements under 4px count as clicks, not drags
      .on('start', (event: unknown, d: GraphNode) => {
        const eventData = event as { active: boolean; x: number; y: number }
        if (!eventData.active) simulation!.alphaTarget(0.3).restart()
        d.__dragStartX = eventData.x
        d.__dragStartY = eventData.y
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event: unknown, d: GraphNode) => {
        const eventData = event as { x: number; y: number }
        d.fx = eventData.x
        d.fy = eventData.y
      })
      .on('end', (event: unknown, d: GraphNode) => {
        const eventData = event as { active: boolean; x: number; y: number }
        if (!eventData.active) simulation?.alphaTarget(0)
        const dx = eventData.x - (d.__dragStartX ?? eventData.x)
        const dy = eventData.y - (d.__dragStartY ?? eventData.y)
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 4) {
          // This was a click, not a drag: navigate to the entity
          d.fx = null
          d.fy = null
          if (!d.isCurrent) {
            emit('navigate', d.id)
          }
        } else {
          // Real drag: update ideal position so forces keep it here
          idealPositions.set(d.id, { x: eventData.x, y: eventData.y })
          simulation
            ?.force('x', d3.forceX<GraphNode>(n => idealPositions.get(n.id)?.x ?? width / 2).strength(0.8))
            .force('y', d3.forceY<GraphNode>(n => idealPositions.get(n.id)?.y ?? height / 2).strength(0.8))
          d.fx = null
          d.fy = null
        }
      })
    )

  // Node circles
  node.append('circle')
    .attr('r', d => d.isCurrent ? 22 : 16)
    .attr('fill', d => d.isCurrent ? 'rgba(47, 129, 247, 0.15)' : 'rgba(139, 148, 158, 0.1)')
    .attr('stroke', d => d.isCurrent ? '#2f81f7' : '#6e7681')
    .attr('stroke-width', d => d.isCurrent ? 2.5 : 1.5)

  // Node labels
  node.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', d => d.isCurrent ? 36 : 28)
    .attr('fill', d => d.isCurrent ? '#e6edf3' : '#8b949e')
    .attr('font-size', d => d.isCurrent ? '12px' : '11px')
    .attr('font-weight', d => d.isCurrent ? '600' : '400')
    .text(d => d.label.length > 20 ? d.label.substring(0, 18) + '...' : d.label)

  // Node initials
  node.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', 4)
    .attr('fill', d => d.isCurrent ? '#2f81f7' : '#8b949e')
    .attr('font-size', d => d.isCurrent ? '12px' : '10px')
    .attr('font-weight', '600')
    .text(d => d.label.split(' ').map(w => w[0]).join('').substring(0, 3).toUpperCase())

  simulation.on('tick', () => {
    // Keep nodes within bounds
    nodes.forEach(d => {
      d.x = Math.max(40, Math.min(width - 40, d.x!))
      d.y = Math.max(40, Math.min(height - 40, d.y!))
    })

    link
      .attr('d', (d: GraphLink) => {
        const c = computeCurve(d)
        return `M${c.sx},${c.sy} Q${c.cx},${c.cy} ${c.tx},${c.ty}`
      })

    linkLabel
      .attr('x', (d: GraphLink) => {
        const c = computeCurve(d)
        // Position at the quadratic bezier midpoint (t=0.5)
        return c.sx * 0.25 + c.cx * 0.5 + c.tx * 0.25
      })
      .attr('y', (d: GraphLink) => {
        const c = computeCurve(d)
        return c.sy * 0.25 + c.cy * 0.5 + c.ty * 0.25
      })

    node.attr('transform', d => `translate(${d.x},${d.y})`)
  })
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  nextTick(() => buildGraph())
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => buildGraph())
    resizeObserver.observe(containerRef.value)
  }
})

onBeforeUnmount(() => {
  if (simulation) simulation.stop()
  if (resizeObserver) resizeObserver.disconnect()
})

watch(() => props.relationships, () => nextTick(() => buildGraph()), { deep: true })
watch(() => props.graphEdges, () => nextTick(() => buildGraph()), { deep: true })
</script>

<style scoped lang="scss">
.relationship-graph {
  position: relative;
  width: 100%;
  min-height: 300px;

  &__svg {
    width: 100%;
    display: block;
  }

  &__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    color: var(--cat-text-tertiary, #8b949e);
    font-size: var(--cat-font-size-sm, 0.8125rem);
  }

  // Edge labels hidden by default, shown when .show-edge-labels is on the container
  :deep(.edge-label) {
    display: none;
  }

  &.show-edge-labels :deep(.edge-label) {
    display: block;
  }

  &__footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 12px 0 0;
  }

  &__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: center;

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .legend-line {
      width: 16px;
      height: 3px;
      border-radius: 2px;
    }

    .legend-label {
      font-size: var(--cat-font-size-xs, 0.75rem);
      color: var(--cat-text-secondary, #8b949e);
    }
  }

  &__label-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--cat-font-size-xs, 0.75rem);
    color: var(--cat-text-secondary, #8b949e);
    user-select: none;
  }
}
</style>
