# syntax=docker/dockerfile:1.7
#
# The `edge` image: nginx, the H5 storefront build, and nothing else.
#
#   # with the storefront (what CI builds):
#   docker build -f docker/edge/Dockerfile \
#     --build-arg H5_DIST=apps/uni-app/dist/build/h5 -t crmeb-next-edge .
#
#   # without it, for a stack that only exercises /admin and the APIs:
#   docker build -f docker/edge/Dockerfile -t crmeb-next-edge .
#
# The build context is the repository root, because the H5 build output lives
# under `apps/uni-app/`, outside the web app. The adjacent
# `Dockerfile.dockerignore` replaces the root `.dockerignore`, so the edge
# build sees exactly its own config and the H5 build output.
#
# `H5_DIST` defaults to a placeholder so the image is buildable from a clean
# checkout: the uni-app is a separate npm project, and its H5 build is not a
# prerequisite for proving the deployment. A placeholder that says so out loud
# is better than an image that 404s at `/` with no explanation.

ARG NGINX_IMAGE=nginx:1.29-alpine
ARG H5_DIST=docker/edge/h5-placeholder

FROM ${NGINX_IMAGE} AS edge
ARG H5_DIST

RUN rm -f /etc/nginx/conf.d/default.conf
COPY docker/edge/nginx.conf /etc/nginx/conf.d/edge.conf
# The trusted-proxy list for the realip module, rendered from
# NEXT_EDGE_TRUSTED_PROXIES at every start by the image's own entrypoint hook
# mechanism. Empty by default: nothing is trusted, and the TCP peer is the
# client. `compose.traefik.yml` requires it once Traefik fronts the edge.
COPY --chmod=0755 docker/edge/40-edge-real-ip.sh /docker-entrypoint.d/40-edge-real-ip.sh
ENV NEXT_EDGE_TRUSTED_PROXIES=''
COPY ${H5_DIST}/ /srv/h5/

# The uploads volume is mounted read-only here, and the directory has to exist
# for nginx to start when no volume is attached at all (a config test, say).
#
# It is owned by uid 1000 even though nginx never writes to it, because Docker
# seeds a new named volume from *whichever* container mounts it first — read-only
# mounts included, and the edge usually wins that race. A root-owned
# `/data/uploads` then makes every upload fail with EACCES in containers that
# are deliberately not root. A manual `chown` on the host would paper over it
# until the next fresh volume; the fix is for every image that declares this
# path to agree about who owns it.
#
# The config test runs against the list the entrypoint would write for the
# default (empty) value and for a representative one, so a directive that the
# realip module would refuse fails the build rather than the first start.
RUN mkdir -p /data/uploads /etc/nginx/edge \
    && chown -R 1000:1000 /data \
    && NEXT_EDGE_TRUSTED_PROXIES='172.18.0.0/16 fd00::/8' /docker-entrypoint.d/40-edge-real-ip.sh \
    && nginx -t \
    && /docker-entrypoint.d/40-edge-real-ip.sh \
    && nginx -t

# nginx:alpine already drops to the `nginx` user for its workers, and the
# master needs to bind :80 — inside the container, with no host port mapped
# below 1024 by compose, so the root master never faces the network directly.
EXPOSE 80
