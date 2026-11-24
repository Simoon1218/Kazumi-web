FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8333 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    DATA_DIR=/app/data/runtime

WORKDIR /app

# Install minimal system dependencies + lxml build/runtime libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    libxml2 \
    libxslt1.1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

COPY app ./app
COPY static ./static
COPY data ./data

# Run as non-root user (compatible with Render, Hugging Face Spaces, and hardened Docker)
RUN useradd -m -u 1000 appuser \
    && mkdir -p /app/data/runtime \
    && chown -R appuser:appuser /app /ms-playwright
USER appuser

EXPOSE 8333

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD curl -fs "http://127.0.0.1:${PORT:-8333}/healthz" || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8333} --proxy-headers"]
