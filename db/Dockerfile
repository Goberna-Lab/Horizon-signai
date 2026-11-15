# Loader image: migrates + loads the 3D map database, then exits (run by docker-compose.prod.yml as `db-loader`).
# Build context = repo root. Only the files the ETL reads are copied (see db/Dockerfile.dockerignore).
FROM python:3.12-slim
WORKDIR /app
COPY db/requirements.txt db/requirements.txt
RUN pip install --no-cache-dir -r db/requirements.txt
COPY db/ db/
COPY luna-recursos/datos/ luna-recursos/datos/
COPY apps/web/scripts/mapa-3d/sitios.json apps/web/scripts/mapa-3d/iau-nombres.json \
     apps/web/scripts/mapa-3d/gradiente16.webp apps/web/scripts/mapa-3d/tierra-bluemarble.jpg \
     apps/web/scripts/mapa-3d/mapa.src.html apps/web/scripts/mapa-3d/
COPY prototipos/lunar-map/data/zonas.js prototipos/lunar-map/data/zonas.js
ENV PYTHONUNBUFFERED=1
CMD ["python", "-I", "db/entrypoint.py"]
