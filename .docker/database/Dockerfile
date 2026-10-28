FROM postgres:17-alpine

COPY init/ /docker-entrypoint-initdb.d/
COPY migrations/ /migrations/
COPY migrations/up/ /docker-entrypoint-initdb.d/migrations/up/

RUN chmod -R a+rX /docker-entrypoint-initdb.d /migrations
