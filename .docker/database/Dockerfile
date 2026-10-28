FROM postgres:17-alpine

COPY init/ /docker-entrypoint-initdb.d/
COPY migrations/ /docker-entrypoint-initdb.d/migrations/

RUN chmod -R a+rX /docker-entrypoint-initdb.d && \
    find /docker-entrypoint-initdb.d -name "*.sh" -exec chmod +x {} \;
