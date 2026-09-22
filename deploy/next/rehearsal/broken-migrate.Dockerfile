# syntax=docker/dockerfile:1.7
#
# A candidate whose migration fails. Never published, never deployed.
#
#   docker build -f deploy/next/rehearsal/broken-migrate.Dockerfile \
#     --build-arg BASE=<a real worker image> -t crmeb-next-worker:broken-migrate .
#
# The worker itself is untouched, so this isolates one question: when the
# migration step fails, does the release end on the previous images with the
# verified dump still in hand? A candidate that was broken in several ways at
# once could pass that check for the wrong reason.
#
# The exit code is 1 and the message goes to stderr, which is what a real
# migration failure looks like — a failed DDL, not a crash.

ARG BASE
FROM ${BASE}

USER root
RUN printf '%s\n' \
    'process.stderr.write("rehearsal: this migration is meant to fail\\n");' \
    'process.exit(1);' \
    > /app/db/src/migrate.mjs \
    && chown node:node /app/db/src/migrate.mjs
USER node
