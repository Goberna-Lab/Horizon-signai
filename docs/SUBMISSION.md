# Space Apps 2026 submission text

Paste-ready English text for each field of the project form. Field names and rules come from the official Project Submission Guide 2026 (copied in `luna-recursos/reto-space-apps/`) and from [09-entrega.md](09-entrega.md).

Before pasting, resolve every `TODO`:

- **Link to Project Demo** points to the 7-slide deck served by the site (`/demo.html`); it works once the site is deployed.
- **Team names** go on the team page and on the demo slides, not in this file.
- **Incomplete citations** are marked `TODO` in the last field. They are the ones listed as incomplete in [08-datos-y-fuentes.md](08-datos-y-fuentes.md), section 7.
- The Canadian Space Agency page from the challenge resources is not listed because the project does not use it (08, section 6).

---

## Project Name

Horizon Signai

## High-Level Project Summary

Horizon Signai is a web application for comparing landing sites and dates at the Moon's south pole. For a chosen site, date and length of stay, it draws the Sun and Earth against the real terrain horizon, shows how long each one stays in view, and gives a GO, REVIEW or NO GO verdict against the mission's own requirements: Sun and Earth in view at landing, a night no longer than the battery lasts, and a minimum share of Earth contact. When a plan fails, for example because the launch date slipped, the tool proposes how to comply: another date, another zone, or taller equipment. Up to six scenarios can be compared side by side.

It addresses the challenge by turning JPL Horizons ephemerides and LOLA terrain data into an answer a non-specialist can read quickly, with the exact figures available for engineers. A 3D Moon with 62 landing sites and a voice guide also make it useful for teaching.

It matters because at the pole a small change of site or date changes power and communication, and mission schedules rarely hold.

## Link to Project Demo

Pick one of the two (the form takes one link):

- **Video, 30 seconds:** https://signal-horizon.goberna.us/horizon-signai-spot.mp4 (exactly 30.0 s, English narration with burned-in English subtitles). Problem first (a launch slips; today the answer means specialist tools and raw data; at the pole a hill hides the Sun for days), then the solution in the app (what fails and why, fixed in one click, compare), proof (the 3D descent, the walk, EVA by voice, real NASA data) and the call to action.
- **Slides, 7:** https://signal-horizon.goberna.us/demo.html, also as PDF: https://signal-horizon.goberna.us/demo.pdf

Both name the team, the members and the challenge, and open without login; check them in a private window before pasting.

## Link to Final Project

- Live application: https://signal-horizon.goberna.us
- Source code: https://github.com/Goberna-Lab/Horizon-signai

## Detailed Project Description

**What it does**

Horizon Signai answers one question for a mission planner: with this landing site and this date, does the lander have sunlight for power and a direct line of sight to Earth, for how long, and if not, what should change?

- **Planner.** Choose a candidate zone at the south pole (regions of interest from Barker et al. 2021) or your own point within 190 km of the pole. Set the landing date and time (UTC), length of stay, solar panel height, antenna height, battery hours and minimum Earth contact. The tool returns GO, REVIEW or NO GO against four requirements, draws the Sun and Earth against the real terrain horizon with the time left until each sets, and shows a timeline from 30 days before to 60 days after landing. If the plan fails it proposes another date, another zone or taller equipment. Up to 6 scenarios can be saved and compared.
- **Mission workspace.** Several missions on a LOLA map of the south pole. When a schedule change makes a mission fail, an alert says why. In the built-in example, a landing moved from 8 to 29 March 2027 loses Earth at landing and faces a 105 h night with a 50 h battery; the tool proposes 6 April 2027. The stay timeline exports to CSV.
- **3D Moon.** A globe with LOLA relief, 62 landing sites with their sources, 8,876 IAU place names, and the real Sun and Earth for any date from 2026 to 2030, with each site's Sun and Earth elevation against its horizon.
- **Landing page and EVA.** A scroll-driven flight over the south pole explains the low Sun, power and the Earth link. EVA, a 3D guide robot, explains each screen and answers questions in English or Spanish.

**How it works**

Sun and Earth positions come from one table built from NASA/JPL Horizons (DE441): the sub-solar and sub-Earth points in Moon-fixed axes every 3 hours from 2026 to 2030, valid for any latitude and longitude. The terrain horizon of each zone comes from NASA's LOLA 5 m terrain models up close and LOLA polar grids out to 150 km. The engine samples the stay every 10 minutes. The Moon has no atmosphere, so the horizon is terrain plus curvature, with no refraction.

The engine is validated against independent sources: JPL Horizons queried per site (worst difference 0.0065°), the illumination maps of Mazarico et al. (2011) (within 5 points at ground level at Connecting Ridge), and the conclusions of Barker et al. (2021) about the best regions of that site.

Simplifications are stated openly: the solar panel is assumed vertical and Sun-tracking; Earth is counted by its centre; custom-point horizons use a 240 m grid and are flagged as approximate; the descent simulation uses the Apollo 11 profile as an example vehicle, not a CLPS lander. The tool evaluates sunlight and Earth visibility only, not landing hazards.

**Benefits**

One screen gives the first answer that today takes several specialist tools. A verdict in plain words lets science and engineering teams discuss the same numbers. Proposals turn a failed plan into a next step.

**What we hope to achieve**

A planner a team can open when the schedule changes to get a quick, traceable answer, and a clear way to show students why the lunar south pole is hard. Next steps: a full 3D descent and landing simulator, and finer terrain for custom points.

**Tools and languages**

TypeScript, React 19, Vite, three.js, Hono on Node 22, PostgreSQL 17 with PostGIS, Python for data loading, Docker and GitHub Actions. Hardware: the open language and speech models run on the team's own servers with workstation GPUs.

## Use of Super Intelligence (SI)

Yes.

- **Code and documentation.** The project's code and documentation were developed with an SI coding assistant (Claude Code, by Anthropic). This is acknowledged in the repository README ("Use of AI") and most commits carry a `Co-Authored-By` line naming the assistant. The submission text on this page was drafted with the same assistant from the team's documentation.
- **EVA, the guide inside the application.** Her answers are generated by open large language models that run on the team's own servers through Ollama (Qwen models: `qwen3.6:27b` for answers and `qwen3:8b` to classify interruptions during voice conversation). Her voice is synthesized with Kokoro-82M, and speech is transcribed with faster-whisper `large-v3-turbo`. The README states that her answers are generated and her voice is synthesized.
- **Limit we set.** The language model never computes a figure. Sun, Earth, power and verdicts are computed by the project's engine from NASA data; the model only explains them.
- **Review.** In the earlier prototype, an independent SI agent reviewed the interface design against a design reference book.

- **Demo video.** The video is a screen recording of the application, not generated imagery. Its narration is synthetic speech (Kokoro-82M on the team's server, the same voice as EVA); the closing card of the video says so, and so does the file's metadata. The raw-data shot shows real ephemeris rows computed by the project's engine; the sound effects were synthesized by the team (no music). The script of the narration was written with the SI coding assistant and reviewed by the team.
- **Images.** The application and the slides contain no SI-generated images: screenshots, NASA data renders and the team's own logo.

## NASA Data

Used in the application:

1. **NASA/JPL Horizons On-Line Ephemeris System** (J. D. Giorgini and JPL Solar System Dynamics Group), DE441 ephemeris, retrieved 6 and 7 November 2026. Sub-solar and sub-Earth points in Moon-fixed axes with distances, every 3 hours from 2026-01-01 to 2031-01-01. Used to place the Sun and Earth from any site and date on every screen. Also per-site tables and an 18.6-year series at Connecting Ridge used for validation. https://ssd.jpl.nasa.gov/horizons/ and https://ssd-api.jpl.nasa.gov/doc/horizons.html
2. **LRO LOLA 5 m terrain models of lunar south pole sites, with regions of interest** (NASA GSFC Planetary Geodesy Data Archive; Barker et al. 2021). Used for the candidate zones and their detailed terrain horizon. https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/ and https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/README
3. **LRO LOLA polar gridded data `LDEM_75S_240M` and `LDEM_75S_120M`** (PDS Geosciences Node). Used for the horizon of custom points within 190 km of the pole, the far horizon of catalogue sites, the polar maps, the landing-page terrain and the south pole in 3D. https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/
4. **LRO LOLA global gridded data `LDEM_4` (elevation), `LDAM_4` (albedo at 1064 nm) and `LDEM_16`** (PDS Geosciences Node). Used for the relief, albedo and slope shading of the 3D globe. https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/float_img/
5. **LOLA average visibility maps `AVGVISIB_85S_060M_201608` (Sun) and `_EARTH`** (Mazarico et al. 2011; PDS LOLA EXTRAS and PGDA product 69). Used as the reference to validate sunlight and Earth visibility. http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/ and https://pgda.gsfc.nasa.gov/products/69
6. **NASA NSSDCA, "Lunar Artifact Impacts and Landings"** (D. R. Williams) and NSSDCA spacecraft records. Used for the coordinates and dates of the landing sites on the 3D Moon. https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html
7. **NASA Artemis III candidate landing regions** (update of 28 October 2024), with LROC NAC region mosaics for approximate centres. Shown on the 3D Moon and marked as approximate. https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
8. **NASA Blue Marble** (Scientific Visualization Studio, item 2915). Earth's texture on the 3D Moon. https://svs.gsfc.nasa.gov/vis/a000000/a002900/a002915/bluemarble-2048.png
9. **NASA technical reports.** Bennett, F. V., *Apollo Experience Report: Mission Planning for Lunar Module Descent and Ascent*, NASA TN D-6846, June 1972 (NTRS 19720018205). Hammock, W. R., Jr., Currie, E. C. and others, *Apollo Experience Report: Descent Propulsion System*, NASA TN D-7143, March 1973 (NTRS 19730011150). Used for the Apollo 11 descent profile, propellant and engine limits of the descent simulation.

Used to build and validate the calculation engine (earlier prototype, kept in `luna-recursos/`):

10. **LROC NAC terrain model `NAC_DTM_APOLLO17_2M`** (2 m) and **orthoimage `NAC_DTM_APOLLO17_1_M134991788_60CM`** (LROC, Arizona State University, for NASA; PDS). Terrain and albedo variations of the Apollo 17 site. https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/APOLLO17_2M/ and https://data.lroc.im-ldi.com/lroc/view_rdr_product/NAC_DTM_APOLLO17_1_M134991788_60CM
11. **LROC WAC Hapke parameter maps `WAC_HAPKEPARAMMAP`** (PDS). Measured photometric parameters at the Apollo 17 site. https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/WAC_HAPKEPARAMMAP/
12. **SLDEM2015** tile `SLDEM2015_512_00N_30N_000_045_FLOAT` (LRO LOLA with SELENE Terrain Camera; PDS Geosciences Node). Horizon of the Apollo 17 site. https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/sldem2015/
13. **LROC Science Operations Team, "Coordinates of Lunar Anthropogenic Targets"** (28 July 2016). Positions of Apollo hardware. https://www.lroc.asu.edu/data/support/downloads/2016_LROC_Coordinates_of_Human_Features.pdf
14. **NASA NSSDCA records** for Apollo 17 (https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo17info.html), the Apollo 17 Lunar Module (https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1972-096C) and the Apollo 11 Lunar Module / EASEP (https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1969-059C). Dimensions, masses and landing time.
15. **NASA 3D Resources, "Apollo Lunar Module" model** (NASA Ames Research Center). https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Apollo%20Lunar%20Module

Challenge resources: JPL Horizons is the source of all ephemerides. LROC Quickmap and Moon Trek were consulted but are not data sources of the project.

## Space Agency Partner Data and Other References

**Prior work**

- "luna", an earlier prototype (commits dated 6 and 7 November 2026, snapshot at commit `72f890f`, Apache License 2.0). It is the origin of the calculation engine, its tests, its data scripts and the processed data. A copy is kept in the repository under `luna-recursos/`, and the engine is reused by the application.

**Space agency partner data**

- JAXA: SELENE (Kaguya) Terrain Camera data, as part of SLDEM2015. Used for the horizon of the Apollo 17 site in the engine's validation, through the merged SLDEM2015 product (Barker et al. 2016, below).

**Papers**

- Barker et al. (2021), "Improved LOLA Elevation Maps for South Pole Landing Sites: Error Estimates and Their Impact on Illumination Conditions", Planetary and Space Science 203, 105119, https://doi.org/10.1016/j.pss.2020.105119
- Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Torrence, M. H. (2011), "Illumination conditions of the lunar polar regions using LOLA topography", Icarus 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030
- Wagner, R. V., et al. (2017), "Coordinates of anthropogenic features on the Moon", Icarus 283, 92–103 (coordinates of Apollo hardware, with the LROC table above).
- Sato, H., Robinson, M. S., Hapke, B., Denevi, B. W., Boyd, A. K. (2014), "Resolved Hapke parameter maps of the Moon", JGR Planets 119, 1775–1805 (LROC WAC Hapke parameters).
- Schröder et al. (2017), "Resolved spectrophotometric properties of the Ceres surface from Dawn Framing Camera images", arXiv:1701.08550 (Hapke model equations).
- Lemelin, M., et al. (2016), "Improved calibration of reflectance data from the LRO Lunar Orbiter Laser Altimeter (LOLA) and implications for space weathering", Icarus 273, 315–328 (LOLA albedo `LDAM_4`).
- Henriksen, M. R., et al. (2017), "Extracting accurate and precise topography from LROC narrow angle camera stereo observations", Icarus 283, 122–137 (cited with the LROC NAC orthoimage).
- Barker, M. K., et al. (2016), "A new lunar digital elevation model from the Lunar Orbiter Laser Altimeter and SELENE Terrain Camera", Icarus 273, 346–355 (SLDEM2015).

**Reports and books (cited, not redistributed)**

- Klumpp, A. R. (1971), *Apollo Lunar-Descent Guidance*, MIT Charles Stark Draper Laboratory, R-695. https://www.ibiblio.org/apollo/Documents/Apollo%20Lunar%20Descent%20Guidance.pdf
- Wakker, K. F. (2015), *Fundamentals of Astrodynamics*, TU Delft, ISBN 978-94-6186-419-2 (open access).
- Heiken, Vaniman and French (eds.) (1991), *Lunar Sourcebook: A User's Guide to the Moon*, Cambridge University Press.
- Akenine-Möller, Haines, Hoffman, Pesce, Iwanicki and Hillaire (2018), *Real-Time Rendering*, 4th ed., CRC Press.
- Pharr, M., Humphreys, G., *Physically Based Rendering: From Theory to Implementation* (2003 draft consulted).
- Tidwell, Brewer and Valencia (2020), *Designing Interfaces*, 3rd ed., O'Reilly.
- Fielder, G., *Secrets of the Moon*, CRC Press, DOI 10.1201/9781003181279 (chapters 1 to 5 only).
- *Planetary Surficial Processes*, conference session abstracts (limited use).

**Other data**

- IAU/USGS Gazetteer of Planetary Nomenclature, Moon nomenclature centre points, retrieved 14 November 2026 (8,876 approved names). https://planetarynames.wr.usgs.gov/
- LROC NAC region mosaics used for the approximate centre of three Artemis III regions: https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_ROI_MTMOUTONLOB, https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_ROI_MOUTNPLTLO1, https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_ROI_CABEUSPKLO1
- Landing coordinate of IM-2 Athena (Intuitive Machines, 6 March 2025): Wikipedia, "IM-2", and LROC, https://www.lroc.asu.edu/images/1401. TODO: replace Wikipedia with a primary source.
- Each landing site on the 3D Moon links to its own source on screen. The full list is in `apps/web/scripts/mapa-3d/sitios.json`.

**3D models, images and fonts**

- "Astronaut" 3D model by Javi_DaviYT (Sketchfab), CC BY 4.0, reduced in size for the landing page.
- NASA 3D Resources "Apollo Lunar Module" model (listed under NASA Data; its record states "free and without copyright").
- Fonts: Archivo and IBM Plex Mono (self-hosted through Fontsource); Jost (Google Fonts) for body text on the 3D Moon and Inter, Space Grotesk and IBM Plex Mono (Google Fonts) on the planner pages.
- EVA's 3D body is drawn in code with three.js; it is not an external model.

**Open-source software**

- Web: React, React DOM, React Router, three.js, React Three Fiber, drei, GSAP, Lenis, react-markdown, remark-gfm, Silero VAD through `@ricky0123/vad-web`, ONNX Runtime Web.
- API: Hono, `@hono/node-server`, postgres.js, undici, Node.js.
- Build and test: TypeScript, Vite, `@vitejs/plugin-react`, tsx, Playwright, concurrently, Bun (data scripts and the earlier prototype's tests), oxlint (earlier prototype).
- Database and data loading: PostgreSQL, PostGIS, Python, psycopg, NumPy, Pillow.
- Language and speech models, run on the team's servers: Ollama; Qwen models `qwen3.6:27b` and `qwen3:8b`; Kokoro-82M (Apache 2.0) with misaki, spaCy `en_core_web_sm` and espeak-ng; faster-whisper `large-v3-turbo` (MIT); FastAPI and uvicorn.
- Infrastructure: Docker, GitHub Actions.
- The Draco decoder shipped with three.js was copied into the earlier prototype.
- Working method: the step template of the earlier prototype's specification was adapted from craftzdog.

**Development assistant**

- Claude Code (Anthropic). See "Use of Super Intelligence (SI)".

Horizon Signai is an independent project by participants of the NASA Space Apps Challenge 2026. It is not endorsed by, affiliated with or sponsored by NASA.

---

## Pre-submit checklist

Adapted from [09-entrega.md](09-entrega.md).

- [ ] Project name and summary pasted, in English.
- [ ] Demo within the limit (30 seconds, or 7 slides including title and intro), in English or with English subtitles, with a public link. Slides name the team, its members and the challenge.
- [ ] Link to the final project opens without login. Test the site, the repository and the demo in a private window.
- [ ] "NASA Data" field lists each product with its link.
- [ ] "References" field lists every external resource, including the "luna" prototype. All `TODO` marks resolved or removed.
- [ ] "Use of Super Intelligence (SI)" answered. Any SI-generated image or video carries a visible watermark.
- [ ] Team has six members or fewer, all registered in the same local event and visible in the Members tab.
- [ ] Prior-work question (risk 1 in 09-entrega.md) raised with the Local Lead.
- [ ] No image, video or voice of anyone under 18 in the demo or the project.
- [ ] Both boxes checked (Terms and Conditions, original work) and "Submit for Judging" pressed before Sunday 15 November 2026, 11:59 p.m. local event time.
