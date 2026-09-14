# Local Composer package snapshots

These packages are committed because their locked releases do not provide Composer
dist archives and their upstream Git hosts have proven unreliable during container
builds. `composer.json` installs these snapshots through path repositories with
symlinks disabled, so the resulting `vendor/` tree is self-contained.

| Package | Version | Upstream repository | Upstream commit |
| --- | --- | --- | --- |
| `fastknife/ajcaptcha` | `1.1.5` | <https://gitee.com/fastknife/aj-captcha.git> | `9e8eb95c444d2ff4d78d1d1d4d5cb1d29c084609` |
| `xin/container` | `2.0.1` | <https://gitee.com/liuxiaojinla/php-container> | `97bb67f87dd851545938a1f2fe0ffbd379e3ff81` |
| `xin/helper` | `1.0.0` | <https://gitee.com/liuxiaojinla/php-helper> | `02a58132dae2aea2d1c0b8e66f55125969224747` |

To update a snapshot, replace its directory with the contents of a reviewed
upstream commit, update this table, and regenerate `composer.lock` with the same
Composer version used by the Docker build.

The AJCaptcha snapshot adds only the explicit `version` field to its upstream
`composer.json`; Composer path repositories require that metadata to resolve the
locked `1.1.5` release deterministically.
