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
        <span>Show edge labels</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as d3 from 'd3'

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
}

const legendTypes = [
  { key: 'owns', label: 'Owns', color: '#3fb950' },
  { key: 'governs', label: 'Governs', color: '#a371f7' },
  { key: 'contains', label: 'Contains', color: '#2f81f7' },
  { key: 'supplies', label: 'Supplies', color: '#f0883e' },
  { key: 'depends_on', label: 'Depends On', color: '#f85149' },
  { key: 'consumes', label: 'Consumes', color: '#db61a2' },
]

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  isCurrent: boolean
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  type: string
  direction: 'parent' | 'child' | 'other'
  // Curvature offset for parallel edges between the same node pair
  curveOffset: number
}

let simulation: d3.Simulation<GraphNode, GraphLink> | null = null

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
    pairMap.get(pairKey)!.push(link)
  }
  for (const group of pairMap.values()) {
    if (group.length <= 1) continue
    const spread = 40
    for (let i = 0; i < group.length; i++) {
      group[i].curveOffset = (i - (group.length - 1) / 2) * spread
    }
  }

  const nodes = Array.from(nodeMap.values())

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

  simulation = d3.forceSimulation<GraphNode>(nodes)
    .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(140))
    .force('charge', d3.forceManyBody().strength(-400))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(50))

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
    .attr('cursor', 'grab')
    .call(d3.drag<SVGGElement, GraphNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation!.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation!.alphaTarget(0)
        d.fx = null
        d.fy = null
      })
    )

  // Click handler for navigation to other entities
  node.on('click', (_event: MouseEvent, d: GraphNode) => {
    if (!d.isCurrent) {
      emit('navigate', d.id)
    }
  })

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
