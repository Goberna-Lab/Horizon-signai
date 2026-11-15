import { brand, footer } from "../content"

export function Footer() {
  return (
    <footer className="ln-foot">
      <div className="ln-foot__grid">
        <p>{footer.disclaimer}</p>
        <p>{footer.plate}</p>
        <p>{footer.ai}</p>
        <div className="ln-foot__links ln-mono">
          <a href={brand.repository} target="_blank" rel="noreferrer">
            Source code
          </a>
          <a href={brand.challengeUrl} target="_blank" rel="noreferrer">
            {brand.challenge}, {brand.event}
          </a>
        </div>
      </div>
      <span className="ln-foot__mark" aria-hidden="true">
        {brand.name}
      </span>
    </footer>
  )
}
