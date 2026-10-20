FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

# Claude Code CLI (pinned) for the "Ask Claude" panel; runs text-only, see ktma/assistant.py
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates bash \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://claude.ai/install.sh | bash -s 2.1.290
ENV PATH="/root/.local/bin:${PATH}" DISABLE_AUTOUPDATER=1
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY ktma ./ktma
COPY docs ./docs
COPY label_app.py config.yaml ./
COPY .streamlit ./.streamlit

CMD ["python", "-m", "ktma", "scan"]
