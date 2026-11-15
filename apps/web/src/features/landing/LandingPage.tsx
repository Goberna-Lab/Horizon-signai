import { FlightStage } from "./flight/FlightStage"
import { Audience } from "./sections/Audience"
import { Closing } from "./sections/Closing"
import { Footer } from "./sections/Footer"
import { Header } from "./sections/Header"
import { Product } from "./sections/Product"
import { ProductWindow } from "./sections/product/ProductWindow"
import { Sources } from "./sections/Sources"
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
      <ProductWindow />
      <Product />
      <Audience />
      <Validation />
      <Sources />
      <Closing />
      <Footer />
    </div>
  )
}
