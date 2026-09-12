# OpenCode server image for the AI Command Center.
#
# Runs a headless `opencode serve` on a managed host (Railway / Render / Fly).
# The web client (Admin Creator AI Command Center) talks to it via the
# ai-command Edge Function proxy; this server only ever runs NowOpen's
# business tools through the custom bridge tool (.opencode/tools/nowopen.ts),
# never the user's shell or filesystem.
#
# Build context = REPO ROOT (so opencode.json and .opencode/ are available):
#   docker build -f opencode/Dockerfile -t nowopen-opencode .

FROM node:22-slim AS runtime

RUN npm install -g opencode-ai@latest @opencode-ai/plugin@latest && npm cache clean --force

WORKDIR /app

COPY . .

EXPOSE 4096

ENV OPENCODE_SERVER_USERNAME=opencode

CMD ["sh", "-c", "opencode serve --hostname 0.0.0.0 --port ${PORT:-4096}"]