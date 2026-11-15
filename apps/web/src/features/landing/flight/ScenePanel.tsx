import { useState } from "react"
import { comparison, guess, type Scene } from "../content"

/**
 * El contenido del panel de una escena del vuelo. Si la escena trae una pregunta, primero se adivina: el panel
 * enseña la pregunta con sus respuestas y, al elegir una (o pedir la respuesta), revela el dato de la escena, que
 * es lo que la lámina de detrás está dibujando. Con `open` el dato sale directamente (modo de lectura, sin vuelo).
 */
export function ScenePanel({ scene, open }: { scene: Scene; open: boolean }) {
  const [picked, setPicked] = useState<number | null>(null)
  const [shown, setShown] = useState(open)
  const quiz = scene.quiz

  if (quiz && !shown && picked === null) {
    return (
      <div className="fl-quiz">
        <p className="fl-quiz__label">{guess.label}</p>
        <h2 className="fl-scene__title">{quiz.ask}</h2>
        <div className="fl-quiz__options" role="group" aria-label={quiz.ask}>
          {quiz.options.map((option, i) => (
            <button key={option} type="button" onClick={() => setPicked(i)}>
              {option}
            </button>
          ))}
        </div>
        <button type="button" className="fl-quiz__show" onClick={() => setShown(true)}>
          {guess.show}
        </button>
      </div>
    )
  }

  return (
    <>
      {quiz && picked !== null && (
        <p className="fl-quiz__result" data-right={picked === quiz.right} aria-live="polite">
          <strong>{picked === quiz.right ? guess.right : guess.wrong}</strong> {quiz.options[quiz.right]}
        </p>
      )}
      <div className="fl-scene__text">
        <h2 className="fl-scene__title">{scene.title}</h2>
        <p className="fl-scene__body">{scene.body}</p>
        {scene.note && <p className="fl-scene__note">{scene.note}</p>}
      </div>
      {scene.facts && (
        <dl className="fl-facts">
          {scene.facts.map((fact) => (
            <div key={fact.label} className="fl-facts__item">
              <dt>{fact.label}</dt>
              <dd>
                <data value={fact.value}>{fact.value}</data>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {scene.id === "compare" && (
        <table className="fl-table">
          <caption>{comparison.caption}</caption>
          <thead>
            <tr>
              {comparison.columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  {row.name}
                  {row.approximate ? " *" : ""}
                </th>
                <td>{row.sun}</td>
                <td>{row.earth}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>* {comparison.footnote}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </>
  )
}
