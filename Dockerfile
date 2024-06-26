FROM node:20-alpine

ARG PORT
ARG DATABASE_HOST
ARG DATABASE_PORT
ARG DATABASE_USER
ARG DATABASE_PASS
ARG DATABASE_NAME_TYPEORM
ARG PRISMA_DATABASE_URL
ARG MINIO_ENDPOINT
ARG MINIO_PORT
ARG MINIO_USE_SSL
ARG MINIO_ACCESS_KEY
ARG MINIO_SECRET_KEY
ARG KMS_SECRET
ARG DID_ALIAS

ENV PORT $PORT
ENV DATABASE_HOST $DATABASE_HOST
ENV DATABASE_PORT $DATABASE_PORT
ENV DATABASE_USER $DATABASE_USER
ENV DATABASE_PASS $DATABASE_PASS
ENV DATABASE_NAME_TYPEORM $DATABASE_NAME_TYPEORM
ENV PRISMA_DATABASE_URL $PRISMA_DATABASE_URL
ENV MINIO_ENDPOINT $MINIO_ENDPOINT
ENV MINIO_PORT $MINIO_PORT
ENV MINIO_USE_SSL $MINIO_USE_SSL
ENV MINIO_ACCESS_KEY $MINIO_ACCESS_KEY
ENV MINIO_SECRET_KEY $MINIO_SECRET_KEY
ENV KMS_SECRET $KMS_SECRET
ENV DID_ALIAS $DID_ALIAS

WORKDIR /usr/src/app

COPY package.json ./
COPY yarn.lock ./

RUN yarn

## following 3 lines are for installing ffmepg
RUN apk update
RUN apk add
RUN apk add ffmpeg

COPY . .

EXPOSE 9092

# RUN yarn prisma generate
RUN yarn prisma migrate deploy
RUN yarn build

CMD [ "node", "dist/main.mjs" ]