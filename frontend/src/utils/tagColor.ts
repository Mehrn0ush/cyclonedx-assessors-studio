// Shared helpers for rendering tag pills in a consistent way across
// AdminTagsView, ProjectsView, ProjectDetailView, EntityDetailView, and
// TagInput. The visual pattern mirrors the hollow pill used throughout
// the app: a 10% alpha fill, a 40% alpha border, and the full colour
// for the label text. Keeping this centralised ensures that when a
// user changes a tag's colour in Tag Administration, the change shows
// up everywhere the tag is rendered.
//
// Colours are stored as 6 digit hex strings (#rrggbb) in the backend,
// so the helpers only need to cover that shape. Invalid or missing
// values fall back to the CycloneDX green so the pill still reads as
// a pill and never renders as a bare text run.

const FALLBACK_COLOR = '#3fb950'

export function isValidHexColor(value: string | null | undefined): boolean {
  if (!value) return false
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

export function hexToRgba(hex: string | null | undefined, alpha: number): string {
  const safe = isValidHexColor(hex) ? (hex as string) : FALLBACK_COLOR
  const r = parseInt(safe.slice(1, 3), 16)
  const g = parseInt(safe.slice(3, 5), 16)
  const b = parseInt(safe.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Resolve the three inline CSS values a tag pill needs from a hex
// colour. Consumers spread the result into a :style binding.
export function tagPillStyle(color: string | null | undefined) {
  const safe = isValidHexColor(color) ? (color as string) : FALLBACK_COLOR
  return {
    backgroundColor: hexToRgba(safe, 0.1),
    borderColor: hexToRgba(safe, 0.4),
    color: safe,
  }
}
