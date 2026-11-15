import { Link } from "react-router"
import { product } from "../content"
import { Reveal } from "./Reveal"

export function Product() {
  return (
    <section className="ln-sec" id="product">
      <div className="ln-wrap">
        <Reveal as="h2" className="ln-title" wipe>
          {product.title}
        </Reveal>
        <ol className="ln-steps">
          {product.steps.map((step, i) => (
            <Reveal as="li" key={step.verb} className="ln-step" delay={i * 90}>
              <span className="ln-step__verb">{step.verb}</span>
              <div>
                <p className="ln-step__question">{step.question}</p>
                <p className="ln-step__body">{step.body}</p>
                {step.action && (
                  <Link className="btn" to={step.action.to}>
                    {step.action.label}
                  </Link>
                )}
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}
