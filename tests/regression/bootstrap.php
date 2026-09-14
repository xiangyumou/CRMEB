<?php
declare(strict_types=1);

$root = getenv('CRMEB_ROOT') ?: dirname(__DIR__, 2) . '/crmeb';
define('CRMEB_TEST_ROOT', rtrim($root, '/'));
defined('DS') || define('DS', DIRECTORY_SEPARATOR);

require CRMEB_TEST_ROOT . '/vendor/autoload.php';

$app = new think\App(CRMEB_TEST_ROOT);
$app->initialize();

if (!is_dir(__DIR__ . '/artifacts')) {
    mkdir(__DIR__ . '/artifacts', 0777, true);
}
