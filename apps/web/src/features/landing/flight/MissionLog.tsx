import { missionLog, type Scene } from "../content"

/**
 * La bitácora de misiones del vuelo: la campaña de ejemplo del planificador, una fila por misión (código, nombre,
 * fecha, sitio y estado). Cada misión está marcada en su sitio sobre el terreno; al pasar por encima de una fila se
 * resalta su marca (`data-mission`, ver FlightStage.tsx).
 */
export function MissionLog({ scene, onFocus }: { scene: Scene; onFocus: (id: string | null) => void }) {
  return (
    <div className="fl-log">
      <p className="fl-quiz__label">{missionLog.label}</p>
      <h2 className="fl-scene__title">{scene.title}</h2>
      <p className="fl-log__intro">{scene.body}</p>
      <ol className="fl-log__list">
        {missionLog.missions.map((mission) => (
          <li
            key={mission.id}
            className="fl-log__item"
            data-status={mission.status}
            onPointerEnter={() => onFocus(mission.id)}
            onPointerLeave={() => onFocus(null)}
          >
            <span className="fl-log__id">{mission.id}</span>
            <span className="fl-log__main">
              <strong>{mission.name}</strong>
              <span>
                {mission.when} · {mission.place}
              </span>
            </span>
            <span className="fl-log__status">{missionLog.status[mission.status]}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
