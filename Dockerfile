# syntax=docker/dockerfile:1.7

ARG PHP_IMAGE=php:7.4.33-fpm-bullseye@sha256:3ac7c8c74b2b047c7cb273469d74fc0d59b857aa44043e6ea6a0084372811d5b
ARG COMPOSER_IMAGE=composer:2.2.30@sha256:bbe26e38edb91faabc542108ffc89614cc51d56c1e7a4f70b4743f0ea177a97b

FROM ${PHP_IMAGE} AS php-base

RUN printf '%s\n' \
        'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian/20221114T000000Z bullseye main' \
        'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian-security/20221114T000000Z bullseye-security main' \
        > /etc/apt/sources.list

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

FROM php-base AS runtime

ENV TZ=Asia/Shanghai
WORKDIR /var/www/crmeb

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libfreetype6 \
        libicu67 \
        libjpeg62-turbo \
        libpng16-16 \
        libzip4 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=extensions /usr/local/lib/php/extensions/ /usr/local/lib/php/extensions/
COPY --from=extensions /usr/local/etc/php/conf.d/ /usr/local/etc/php/conf.d/
COPY docker/php/conf.d/crmeb.ini /usr/local/etc/php/conf.d/zz-crmeb.ini
COPY --from=vendor --chown=www-data:www-data /build/crmeb /var/www/crmeb

RUN chmod -R ug+rwX runtime public/uploads

EXPOSE 9000
STOPSIGNAL SIGQUIT
CMD ["php-fpm", "-F"]
