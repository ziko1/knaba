# KNABA DE isolated QA only. Not a production image or runtime dependency.
# Python image provides the independent XLSX verifier; Node is copied from the
# existing Node 24 QA base so the repository's Node24 engine contract is kept.
FROM python:3.12-slim

COPY --from=node:24-bookworm-slim /usr/local/bin/node /usr/local/bin/node

RUN python3 -m pip install --no-cache-dir --disable-pip-version-check \
      openpyxl==3.1.5 Pillow==11.3.0 \
    && apt-get update -qq \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      poppler-utils \
    && rm -rf /var/lib/apt/lists/*

RUN node -v && python3 -c "import openpyxl,PIL; print(openpyxl.__version__,PIL.__version__)" \
    && pdftotext -v
