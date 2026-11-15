import { missionLog, type Scene } from "../content"

/**
 * La bitácora de misiones del vuelo: la campaña de ejemplo del planificador, una fila por misión (código, nombre,
 * fecha, sitio y estado). Cada misión está marcada en su sitio sobre el terreno; al pasar por encima de una fila se
 * resalta su marca (`data-mission`, ver FlightStage.tsx). Las misiones con puntos se eligen con un clic: el vuelo
 * baja a sus tres puntos.
 */
export function MissionLog({
  scene,
  selected,
  onFocus,
  onSelect,
}: {
  scene: Scene
  selected: string
  onFocus: (id: string | null) => void
  onSelect: (id: string) => void
}) {
  return (
    <div className="fl-log">
      <p className="fl-quiz__label">{missionLog.label}</p>
      <h2 className="fl-scene__title">{scene.title}</h2>
      <p className="fl-log__intro">{scene.body}</p>
      <ol className="fl-log__list">
        {missionLog.missions.map((mission) => {
          const content = (
            <>
              <span className="fl-log__id">{mission.id}</span>
              <span className="fl-log__main">
                <strong>{mission.name}</strong>
                <span>
                  {mission.when} · {mission.place}
                </span>
                {mission.points.length > 0 && <span className="fl-log__choose">{missionLog.choose} →</span>}
              </span>
              <span className="fl-log__status">{missionLog.status[mission.status]}</span>
            </>
          )
          return (
            <li
              key={mission.id}
              className="fl-log__item"
              data-status={mission.status}
              data-selected={mission.id === selected || undefined}
              onPointerEnter={() => onFocus(mission.id)}
              onPointerLeave={() => onFocus(null)}
            >
              {mission.points.length > 0 ? (
                <button type="button" className="fl-log__row" onClick={() => onSelect(mission.id)}>
                  {content}
                </button>
              ) : (
                <div className="fl-log__row">{content}</div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
