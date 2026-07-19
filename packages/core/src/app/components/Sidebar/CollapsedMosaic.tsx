import BotIcon from '../BotIcon'

function CollapsedMosaic({ icons }: { icons: string[] }) {
  const shown = icons.slice(0, 6)
  // Use a 40x40 canvas and 22px circles with slight overlap
  const patterns: Record<number, { top: number; left: number }[]> = {
    1: [{ top: 20, left: 20 }],
    2: [
      { top: 13, left: 13 },
      { top: 27, left: 27 }
    ],
    3: [
      { top: 12, left: 20 },
      { top: 28, left: 12 },
      { top: 28, left: 28 }
    ],
    4: [
      { top: 13, left: 13 },
      { top: 13, left: 27 },
      { top: 27, left: 13 },
      { top: 27, left: 27 }
    ],
    5: [
      { top: 12, left: 12 },
      { top: 12, left: 28 },
      { top: 20, left: 20 },
      { top: 28, left: 12 },
      { top: 28, left: 28 }
    ],
    6: [
      { top: 14, left: 12 },
      { top: 14, left: 20 },
      { top: 14, left: 28 },
      { top: 26, left: 12 },
      { top: 26, left: 20 },
      { top: 26, left: 28 }
    ]
  }
  const pos = patterns[shown.length] || patterns[6]
  const count = shown.length
  const isMulti = count >= 2
  const circleSizeClass = isMulti ? 'w-5 h-5' : 'w-6 h-6'
  const botSize = isMulti ? 20 : 24
  return (
    <div className="relative w-10 h-10">
      {shown.map((icon, i) => (
        <div
          key={i}
          className={`absolute ${circleSizeClass} rounded-full border border-white overflow-hidden`}
          style={{ top: pos[i].top, left: pos[i].left, transform: 'translate(-50%, -50%)' }}
        >
          <BotIcon iconName={icon} size={botSize} />
        </div>
      ))}
      {icons.length > shown.length && (
        <div
          className="absolute w-4 h-4 text-[10px] flex items-center justify-center rounded-full bg-secondary border border-white"
          style={{ top: 34, left: 34, transform: 'translate(-50%, -50%)' }}
        >
          +{icons.length - shown.length}
        </div>
      )}
    </div>
  )
}

export default CollapsedMosaic
