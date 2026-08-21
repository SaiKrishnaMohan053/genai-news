FROM node:24-bookworm-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable \
  && corepack prepare pnpm@11.22.0 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @genai-news/web build


FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable \
  && corepack prepare pnpm@11.22.0 --activate

WORKDIR /app

COPY --from=build /app /app

EXPOSE 3000

CMD ["pnpm", "--filter", "@genai-news/web", "exec", "next", "start", "-H", "0.0.0.0", "-p", "3000"]