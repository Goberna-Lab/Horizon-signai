import { FlightStage } from "./flight/FlightStage"
import { Benefits } from "./sections/Benefits"
import { Closing } from "./sections/Closing"
import { FirstMission } from "./sections/FirstMission"
import { Footer } from "./sections/Footer"
import { Header } from "./sections/Header"
import { Problem } from "./sections/Problem"
import { Product } from "./sections/Product"
import { Sources } from "./sections/Sources"
import "./landing.css"

/**
 * Landing: el vuelo sobre el polo sur y, debajo, el software funcionando en una ventana (con datos reales), el
 * recorrido guiado con EVA, el producto y los datos.
 */
export function LandingPage() {
  return (
    <div className="ln">
      <Header />
      <FlightStage />
      <FirstMission />
      <Problem />
      <Benefits />
      <Product />
      <Sources />
      <Closing />
      <Footer />
    </div>
  )
}
