import type { HeatmapDataset } from '../types/dashboard'

type HeatmapGridProps = {
  dataset: HeatmapDataset
  todRange?: [number, number] | null
}

function getLevel(value: number, min: number, max: number): string {
  const ratio = (value - min) / (max - min || 1)
  if (ratio < 0.12) return 'l0'
  if (ratio < 0.28) return 'l1'
  if (ratio < 0.48) return 'l2'
  if (ratio < 0.66) return 'l3'
  if (ratio < 0.84) return 'l4'
  return 'l5'
}

export default function HeatmapGrid({ dataset, todRange }: HeatmapGridProps) {
  const allValues = dataset.values.flat()
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)

  const isInRange = (hourIndex: number): boolean => {
    if (!todRange) return true
    return hourIndex >= todRange[0] && hourIndex <= todRange[1]
  }

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-header-row">
        <span />
        {dataset.xLabels.map((label, i) => (
          <span key={label} className={todRange && !isInRange(i) ? 'muted-hour' : ''}>
            {label}
          </span>
        ))}
      </div>

      <div className="heatmap-grid">
        {dataset.values.map((row, rowIdx) => (
          <div key={dataset.yLabels[rowIdx]} className="heatmap-row">
            <span className="day-tag" title={dataset.yLabels[rowIdx]}>
              {dataset.yLabels[rowIdx]}
            </span>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${dataset.xLabels.length}, minmax(12px, 1fr))`,
                gap: '0.18rem',
              }}
            >
              {row.map((value, colIdx) => {
                const level = getLevel(value, min, max)
                const inRange = isInRange(colIdx)
                return (
                  <span
                    key={colIdx}
                    className={`cell ${level} ${todRange && !inRange ? 'dimmed' : ''}`}
                    title={`${dataset.yLabels[rowIdx]} · ${dataset.xLabels[colIdx]}:00 · ${value.toLocaleString()} ${dataset.valueLabel}`}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
