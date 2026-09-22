# syntax=docker/dockerfile:1.7
#
# The `edge` image: nginx, the H5 storefront build, and nothing else.
#
#   # with the storefront (what CI builds):
#   docker build -f next/docker/edge/Dockerfile \
#     --build-arg H5_DIST=template/uni-app/dist/build/h5 -t crmeb-next-edge .
#
#   # without it, for a stack that only exercises /admin and the APIs:
#   docker build -f next/docker/edge/Dockerfile -t crmeb-next-edge .
#
# The build context is the repository root, because the H5 build output lives
# under `template/uni-app/`, outside `next/`. The adjacent
# `Dockerfile.dockerignore` replaces the root `.dockerignore`, which excludes
# `template/` for the legacy PHP image's benefit.
#
# `H5_DIST` defaults to a placeholder so the image is buildable from a clean
# checkout: stream H owns `template/uni-app`, and its H5 build is not a
# prerequisite for proving the deployment. A placeholder that says so out loud
# is better than an image that 404s at `/` with no explanation.

ARG NGINX_IMAGE=nginx:1.29-alpine
ARG H5_DIST=next/docker/edge/h5-placeholder

FROM ${NGINX_IMAGE} AS edge
ARG H5_DIST

RUN rm -f /etc/nginx/conf.d/default.conf
COPY next/docker/edge/nginx.conf /etc/nginx/conf.d/edge.conf
COPY ${H5_DIST}/ /srv/h5/

# The uploads volume is mounted read-only here, and the directory has to exist
# for nginx to start when no volume is attached at all (a config test, say).
#
# It is owned by uid 1000 even though nginx never writes to it, because Docker
# seeds a new named volume from *whichever* container mounts it first — read-only
# mounts included, and the edge usually wins that race. A root-owned
# `/data/uploads` then makes every upload fail with EACCES in containers that
# are deliberately not root. The old stack hit exactly this and papered over it
# with a manual `chown -R 33:33` on the host (deploy/production/README.md); the
# fix is for every image that declares this path to agree about who owns it.
RUN mkdir -p /data/uploads \
    && chown -R 1000:1000 /data \
    && nginx -t

# nginx:alpine already drops to the `nginx` user for its workers, and the
# master needs to bind :80 — inside the container, with no host port mapped
# below 1024 by compose, so this is not the root the old stack ran.
EXPOSE 80
