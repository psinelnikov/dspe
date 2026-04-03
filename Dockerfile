FROM node:20-alpine AS builder

RUN apk add --no-cache git go

RUN git clone https://github.com/flare-foundation/tee-node.git /tee-node
WORKDIR /tee-node
RUN go build -o /server ./cmd/server

WORKDIR /extension
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache gosu ca-certificates

COPY --from=builder /server /server
COPY --from=builder /extension/dist /extension/dist
COPY --from=builder /extension/node_modules /extension/node_modules
COPY --from=builder /extension/package.json /extension/package.json

WORKDIR /extension

ENV CONFIG_PORT=6660
ENV SIGN_PORT=6661
ENV EXTENSION_PORT=6662
ENV MODE=1

CMD ["sh", "-c", "./server & gosu node node dist/base/index.js"]
