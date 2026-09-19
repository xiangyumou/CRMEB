# syntax=docker/dockerfile:1.7

ARG PHP_IMAGE=php:7.4.33-fpm-bullseye@sha256:3ac7c8c74b2b047c7cb273469d74fc0d59b857aa44043e6ea6a0084372811d5b
ARG COMPOSER_IMAGE=composer:2.2.30@sha256:bbe26e38edb91faabc542108ffc89614cc51d56c1e7a4f70b4743f0ea177a97b

FROM ${PHP_IMAGE} AS php-base

RUN printf '%s\n' \
        'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian/20221114T000000Z bullseye main' \
        'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian-security/20221114T000000Z bullseye-security main' \
        > /etc/apt/sources.list \
    && printf '%s\n' \
        'Acquire::Retries "5";' \
        'Acquire::http::Timeout "30";' \
        'Acquire::https::Timeout "30";' \
        > /etc/apt/apt.conf.d/80-retries

FROM php-base AS extensions

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libfreetype6-dev \
        libicu-dev \
        libjpeg62-turbo-dev \
        libpng-dev \
        libzip-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" \
        bcmath \
        gd \
        intl \
        mysqli \
        opcache \
        pcntl \
        pdo_mysql \
        sockets \
        zip \
    && pecl install redis-5.3.7 \
    && docker-php-ext-enable redis

FROM ${COMPOSER_IMAGE} AS composer-bin

FROM php-base AS vendor

ENV COMPOSER_ALLOW_SUPERUSER=1
WORKDIR /build/crmeb

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        git \
        libfreetype6 \
        libicu67 \
        libjpeg62-turbo \
        libpng16-16 \
        libzip4 \
        unzip \
    && rm -rf /var/lib/apt/lists/*

COPY --from=extensions /usr/local/lib/php/extensions/ /usr/local/lib/php/extensions/
COPY --from=extensions /usr/local/etc/php/conf.d/ /usr/local/etc/php/conf.d/
COPY --from=composer-bin /usr/bin/composer /usr/local/bin/composer
COPY docker/php/conf.d/crmeb.ini /usr/local/etc/php/conf.d/zz-crmeb.ini
COPY crmeb/composer.json crmeb/composer.lock ./
COPY crmeb/packages/ packages/

RUN --mount=type=cache,target=/root/.composer/cache \
    git config --global http.version HTTP/1.1 \
    && git config --global http.lowSpeedLimit 1000 \
    && git config --global http.lowSpeedTime 60 \
    && for attempt in 1 2 3; do \
        composer install \
            --no-dev \
            --prefer-dist \
            --no-interaction \
            --no-progress \
            --no-scripts \
            --optimize-autoloader \
        && break; \
        if [ "$attempt" -eq 3 ]; then exit 1; fi; \
        rm -rf vendor; \
        sleep $((attempt * 10)); \
    done

COPY crmeb/ ./

RUN mkdir -p runtime/cache runtime/log runtime/session runtime/temp public/uploads \
    && composer run-script --no-interaction post-autoload-dump \
    && composer check-platform-reqs --no-dev \
    && php -r 'require "vendor/autoload.php"; if (!class_exists("Doctrine\\Common\\Cache\\FilesystemCache")) { fwrite(STDERR, "Doctrine FilesystemCache is unavailable\n"); exit(1); } $font = "vendor/fastknife/ajcaptcha/resources/fonts/WenQuanZhengHei.ttf"; if (!is_readable($font) || !is_array(imagettfbbox(12, 0, $font, "CRMEB"))) { fwrite(STDERR, "AJCaptcha font is unavailable\n"); exit(1); }' \
    && rm -rf packages

FROM vendor AS vendor-runtime
RUN rm -rf public

FROM php-base AS runtime

ARG TARGETARCH
ARG VCS_REF=unknown
ENV TZ=Asia/Shanghai
ENV CRMEB_REVISION=${VCS_REF}
LABEL org.opencontainers.image.revision=${VCS_REF}
WORKDIR /var/www/crmeb

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libfreetype6 \
        libicu67 \
        libjpeg62-turbo \
        libpng16-16 \
        libzip4 \
        libpcre2-8-0 \
        libssl1.1 \
        curl \
    && rm -rf /var/lib/apt/lists/*

RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) digest=9dd6cc1705e9095f701814553c3e571f8632bd6f5d9efdd90502967680468c1a ;; \
      arm64) digest=a1ac093a6291d005a5e2cede98c108646e95893398d5852f2a3548cdbda60fbf ;; \
      *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://nginx.org/packages/mainline/debian/pool/nginx/n/nginx/nginx_1.27.5-1~bullseye_${TARGETARCH}.deb" -o /tmp/nginx.deb; \
    echo "$digest  /tmp/nginx.deb" | sha256sum -c -; \
    apt-get update; apt-get install -y --no-install-recommends /tmp/nginx.deb; \
    rm -f /tmp/nginx.deb /etc/nginx/conf.d/default.conf; \
    ln -sf /dev/stdout /var/log/nginx/access.log; \
    ln -sf /dev/stderr /var/log/nginx/error.log; \
    rm -rf /var/lib/apt/lists/*

COPY --from=extensions /usr/local/lib/php/extensions/ /usr/local/lib/php/extensions/
COPY --from=extensions /usr/local/etc/php/conf.d/ /usr/local/etc/php/conf.d/
COPY docker/php/conf.d/crmeb.ini /usr/local/etc/php/conf.d/zz-crmeb.ini
COPY --from=vendor-runtime --chown=www-data:www-data /build/crmeb /var/www/crmeb
COPY --chown=www-data:www-data .build/release/public/ /var/www/crmeb/public/
COPY .build/release/build.json /usr/local/share/crmeb/build.json
COPY deploy/production/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/entrypoint.sh /usr/local/bin/crmeb-entrypoint
COPY docker/cache-assets.sh /usr/local/bin/crmeb-cache-assets
COPY docker/ready.php /opt/crmeb/ready.php
COPY docker/healthcheck.php /opt/crmeb/healthcheck.php

RUN mkdir -p public/uploads /var/cache/crmeb/assets \
    && chown -R www-data:www-data runtime public/uploads \
    && chmod -R ug+rwX runtime public/uploads \
    && chmod +x /usr/local/bin/crmeb-entrypoint /usr/local/bin/crmeb-cache-assets \
    && php -l /opt/crmeb/ready.php >/dev/null \
    && php -l /opt/crmeb/healthcheck.php >/dev/null \
    && test -s public/admin/index.html \
    && test -s public/index.html \
    && test -s public/index.php \
    && test -s public/install.lock \
    && php -r '$m=json_decode(file_get_contents("/usr/local/share/crmeb/build.json"),true); if (($m["gitCommit"] ?? null) !== getenv("CRMEB_REVISION")) exit(1);'

EXPOSE 9000 80
STOPSIGNAL SIGQUIT
ENTRYPOINT ["/usr/local/bin/crmeb-entrypoint"]
CMD ["php"]
