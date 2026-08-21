FROM node:24-bookworm-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable \
  && corepack prepare pnpm@11.22.0 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    pnpm --filter @genai-news/database db:generate

RUN pnpm --filter @genai-news/api... build


FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
  && corepack prepare pnpm@11.22.0 --activate

WORKDIR /app

COPY --from=build /app /app

EXPOSE 3001

CMD ["pnpm", "--filter", "@genai-news/api", "start"]