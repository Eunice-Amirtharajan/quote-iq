FROM node:26-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --ignore-scripts

COPY . .

RUN ./node_modules/.bin/prisma generate
RUN npm run build

FROM node:26-alpine AS production

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev --ignore-scripts && ./node_modules/.bin/prisma generate

COPY --from=builder /app/dist ./dist

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 4000

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/main"]