import { FlightStage } from "./flight/FlightStage"
import { Audience } from "./sections/Audience"
import { Closing } from "./sections/Closing"
import { FirstMission } from "./sections/FirstMission"
import { Footer } from "./sections/Footer"
import { Header } from "./sections/Header"
import { PlannerDemo } from "./sections/PlannerDemo"
import { Problem } from "./sections/Problem"
import { Product } from "./sections/Product"
import { ProductWindow } from "./sections/product/ProductWindow"
import { Sources } from "./sections/Sources"
import { Team } from "./sections/Team"
import { Validation } from "./sections/Validation"
import "./landing.css"

/**
 * Landing: el vuelo sobre el polo sur y, debajo, el software funcionando en una ventana (con datos reales), el
 * recorrido del producto, la validación y los datos.
 */
export function LandingPage() {
  return (
    <div className="ln">
      <Header />
      <FlightStage />
      <FirstMission />
      <Problem />
      <ProductWindow />
      <PlannerDemo />
      <Product />
      <Audience />
      <Validation />
      <Sources />
      <Team />
      <Closing />
      <Footer />
    </div>
  )
}
