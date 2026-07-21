import { WORKSPACE_COLORS } from '../../constants/colors'
import './ColorDots.css'

export default function ColorDots({ value, onChange, colors = WORKSPACE_COLORS }) {
  return (
    <div className="color-dots">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          className={`color-dot${value === c ? ' color-dot--active' : ''}`}
          style={{ backgroundColor: c }}
          onClick={() => onChange(c)}
          aria-label={`Set color to ${c}`}
          aria-pressed={value === c}
        />
      ))}
    </div>
  )
}
