// @ts-nocheck — portado de nuestro simulador NASA (JavaScript); el tipado estricto queda pendiente.
// Visor del casco: adaptación sin React del componente `Visor.tsx` del paquete «visor-casco» del equipo.
// Dibuja la escena a una textura con una cámara gran angular y la pasa por el sombreador del casco
// (`sombreador.ts`, sin cambios): vidrio con ojo de pez, canto, destello del Sol, polvo, vaho, carcasa y
// visor solar dorado. Aquí la mirada la lleva el modo astronauta y el HUD es el de la app (el del paquete va apagado).
import * as THREE from 'three';
import { direccionAPantalla, encuadre, pantallaADireccion, POSICIONES_VISOR, THETA_MAX, THETA_V } from './optica.ts';
import { FRAGMENTO, VERTICE } from './sombreador.ts';

export { THETA_V, THETA_MAX, POSICIONES_VISOR, direccionAPantalla, pantallaADireccion };
const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const limite = (x, l) => Math.min(l, Math.max(-l, x));
const MAX_PIXELES = [3.2e6, 1.6e6, 0.8e6]; // tope de la textura de la escena según la calidad (alta, media, baja)

export class VisorCasco {
  constructor() {
    this.camara = new THREE.PerspectiveCamera(90, 1, 0.1, 150000); this.camara.rotation.order = 'YXZ';
    this.destino = null; this.calidad = -1;
    const vacio = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); vacio.needsUpdate = true; // HUD del paquete: apagado
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTICE, fragmentShader: FRAGMENTO, depthTest: false, depthWrite: false,
      uniforms: {
        tEscena: { value: null }, uAspecto: { value: 1 }, uThetaV: { value: THETA_V }, uThetaMax: { value: THETA_MAX }, uTanMitad: { value: new THREE.Vector2(1, 1) },
        uSolPantalla: { value: new THREE.Vector2() }, uSolUv: { value: new THREE.Vector2() }, uSolDelante: { value: 0 }, uSolSinTapar: { value: 0 }, // 0: el destello se apaga si algo de la escena tapa el disco del Sol (la nave, una roca, el relieve)
        uCascoDesp: { value: new THREE.Vector2() }, uCascoGiro: { value: 0 }, uTiempo: { value: 0 }, uExposicion: { value: 0.75 },
        tHud: { value: vacio }, uHud: { value: 0 }, uVisorSol: { value: POSICIONES_VISOR[2].angulo }, uAliento: { value: 0 },
      },
    });
    this.escena = new THREE.Scene();
    const malla = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material); malla.frustumCulled = false; this.escena.add(malla);
    this.orto = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.m = { giro: 0, incl: 0, giroCuerpo: 0, inclCuerpo: 0, iniciada: false };
    this.cuadro = { aspecto: 0, tanAncho: 1, tanAlto: 1 };
    this.t = 0; this.paso = 0; this.bob = 0;
    this.visor = 2;              // índice en POSICIONES_VISOR (0 medio, 1 abajo, 2 arriba)
    this.exposicion = 0.75;      // exposición base (se ajusta a la luz de esta escena)
    this.desp = this.material.uniforms.uCascoDesp.value;
    this.thetaSol = Math.PI;     // ángulo entre la mirada y el Sol (rad)
  }

  reiniciar() { this.m.iniciada = false; }
  /** Libera la textura de la escena y el material (al desmontar el simulador). */
  dispose() { this.destino?.dispose(); this.destino = null; this.material.dispose(); this.escena.children[0]?.geometry?.dispose(); }
  get giroCasco() { return this.material.uniforms.uCascoGiro.value; }
  get visorNombre() { return POSICIONES_VISOR[this.visor].nombre; }
  /** Cuánto ha bajado el visor solar: 0 arriba … 1 abajo. */
  get visorBajado() { const a = POSICIONES_VISOR; return (a[2].angulo - this.material.uniforms.uVisorSol.value) / (a[2].angulo - a[1].angulo); }

  /**
   * @param ojo cámara de la app (da la posición de los ojos) · giro/incl: mirada (rad, orden YXZ)
   * @param dirSol dirección unitaria hacia el Sol en el mundo, o null · solVisible: fracción del disco sobre el relieve (0–1)
   */
  render(renderer, scene, ojo, dtCrudo, { giro, incl, dirSol, solVisible = 1, fase = 0, salto = 0, carrera = 0, aliento = null, calidad = 0 }) {
    const dt = Math.min(dtCrudo, 0.1), u = this.material.uniforms, m = this.m;
    this.t += dt; const t = this.t;
    const tam = renderer.getDrawingBufferSize(new THREE.Vector2()), aspecto = tam.x / tam.y;
    if (this.calidad !== calidad || !this.destino) {
      this.destino?.dispose(); this.calidad = calidad;
      this.destino = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: calidad === 0 ? 4 : 0, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
      u.tEscena.value = this.destino.texture;
    }
    // Encuadre de la escena: lo justo para cubrir lo que muestra el ojo de pez
    if (this.cuadro.aspecto !== aspecto) this.cuadro = { aspecto, ...encuadre(aspecto) };
    const { tanAncho, tanAlto } = this.cuadro;
    let alto = (tanAlto * tam.y) / THETA_V, ancho = (alto * tanAncho) / tanAlto;
    const escala = Math.min(1, Math.sqrt(MAX_PIXELES[calidad] / (ancho * alto)));
    ancho = Math.max(4, Math.round(ancho * escala)); alto = Math.max(4, Math.round(alto * escala));
    if (this.destino.width !== ancho || this.destino.height !== alto) this.destino.setSize(ancho, alto);
    const c = this.camara;
    c.fov = (2 * Math.atan(tanAlto) * 180) / Math.PI; c.aspect = tanAncho / tanAlto; c.near = 0.1; c.far = ojo.far; c.updateProjectionMatrix();
    ojo.updateMatrixWorld(); c.position.setFromMatrixPosition(ojo.matrixWorld);

    // La cabeza va donde dice la app; el casco va con el cuerpo y la sigue con retraso
    const vuelta = 2 * Math.PI;
    const meta = m.giro + ((((giro - m.giro) % vuelta) + vuelta * 1.5) % vuelta) - Math.PI;
    if (!m.iniciada) { m.giro = m.giroCuerpo = meta; m.incl = m.inclCuerpo = incl; m.iniciada = true; }
    m.giro = meta; m.incl = incl;
    const kCuerpo = 1 - Math.exp(-dt * 1.8);
    m.giroCuerpo += (m.giro - m.giroCuerpo) * kCuerpo; m.inclCuerpo += (m.incl - m.inclCuerpo) * kCuerpo;
    const g = m.giro + 0.0015 * Math.sin(t * 0.7), i = m.incl + 0.003 * Math.sin(t * 1.15);
    c.rotation.set(i, g, 0.002 * Math.sin(t * 0.53)); c.updateMatrixWorld();
    this.giro = g; this.incl = i;

    // Balanceo del paso: el casco (y el HUD que va en el vidrio) sube, baja y se ladea al caminar
    // `fase` avanza π por apoyo y `salto` (0–1) es el arco de la zancada: los da la app, así cámara y casco van al mismo compás
    const s = Math.sin(fase), amp = 0.02 + 0.045 * carrera; this.bob = salto;
    u.uCascoDesp.value.set(
      limite((m.giro - m.giroCuerpo) * 0.55, 0.16) + 0.003 * Math.sin(t * 0.9) + s * (0.008 + 0.01 * carrera) * Math.min(1, salto * 3),
      limite(-(m.incl - m.inclCuerpo) * 0.55, 0.12) + 0.004 * Math.sin(t * 1.15 + 1) - salto * amp);
    u.uCascoGiro.value = limite((m.giro - m.giroCuerpo) * 0.06, 0.03) + s * (0.005 + 0.007 * carrera) * Math.min(1, salto * 3);

    // Sol: dónde cae en pantalla y en la textura. Si el relieve lo tapa lo dice el análisis del sitio (solVisible).
    let theta = Math.PI;
    if (dirSol) {
      theta = direccionAPantalla(dirSol, g, i, u.uSolPantalla.value);
      const v = dirSol.clone().multiplyScalar(c.far * 0.5).add(c.position).project(c);
      u.uSolUv.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
      u.uSolDelante.value = Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1 && theta < THETA_MAX ? Math.min(1, solVisible * 1.5) : 0;
    } else u.uSolDelante.value = 0;
    this.thetaSol = theta;

    // Visor solar y adaptación del ojo (curva a ojo del paquete original)
    u.uVisorSol.value += (POSICIONES_VISOR[this.visor].angulo - u.uVisorSol.value) * (1 - Math.exp(-dt * 2.4));
    const adaptacion = (0.72 + 0.46 * suave(10, 75, (theta * 180) / Math.PI)) * (2.2 - 1.2 * suave(-0.5, 0.1, u.uVisorSol.value));
    u.uExposicion.value += (this.exposicion * adaptacion - u.uExposicion.value) * (1 - Math.exp(-dt * 1.2));
    u.uAliento.value = aliento ?? 0.5 + 0.5 * Math.sin(t * 1.15 - 1.2); // vaho: lo marca la respiración de la app si la hay
    u.uAspecto.value = aspecto; u.uTanMitad.value.set(tanAncho, tanAlto); u.uTiempo.value = t;

    const fondo = renderer.getRenderTarget();
    renderer.setRenderTarget(this.destino); renderer.clear(); renderer.render(scene, c);
    renderer.setRenderTarget(fondo); renderer.render(this.escena, this.orto);
  }
}
