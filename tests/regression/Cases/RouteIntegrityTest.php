<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use Tests\Regression\Support\RegressionTestCase;

/**
 * Every route target must resolve to a controller method that exists. Deleting
 * whole controllers for the retired features makes stale routes the most likely
 * way to break an unrelated endpoint, so the check is static and exhaustive.
 *
 * Resolution is scoped to the layer that owns the route file: a route declared in
 * `app/adminapi/route` is served by the adminapi application, so an `api` class
 * with the same name must not satisfy it. Matching across layers used to hide
 * exactly the stale routes a controller deletion leaves behind.
 *
 * `Route::resource()` is skipped here: it names a controller rather than a
 * method. The admin-api contract check in `tests/static` covers the generated
 * resource paths the frontend calls.
 */
final class RouteIntegrityTest extends RegressionTestCase
{
    /** Route directory => application layer that serves that directory. */
    private const LAYERS = [
        'app/adminapi/route' => 'adminapi',
        'app/api/route' => 'api',
        'app/outapi/route' => 'outapi',
    ];

    public function testEveryRouteTargetResolvesToAnExistingControllerMethod(): void
    {
        $missing = [];
        $checked = 0;
        $files = [];
        foreach (array_keys(self::LAYERS) as $directory) {
            foreach (glob(CRMEB_TEST_ROOT . '/' . $directory . '/*.php') ?: [] as $file) {
                $files[] = [$file, self::LAYERS[$directory]];
            }
        }
        foreach (glob(CRMEB_TEST_ROOT . '/route/*.php') ?: [] as $file) {
            $files[] = [$file, 'api'];
        }
        self::assertNotEmpty($files, 'No route files found');

        foreach ($files as [$file, $layer]) {
            $source = $this->stripComments((string)file_get_contents($file));
            // Both quoting styles appear in these files.
            preg_match_all(
                '/Route::(\w+)\(\s*[\'"]([^\'"]*)[\'"]\s*,\s*[\'"]([^\'"]+)[\'"]/',
                $source,
                $matches,
                PREG_SET_ORDER
            );
            foreach ($matches as $match) {
                if (strtolower($match[1]) === 'resource') {
                    continue;
                }
                $target = $match[3];
                // A target without a slash is a controller closure or a single
                // class name, never a `Controller/method` pair.
                if (strpos($target, '/') === false) {
                    continue;
                }
                $checked++;
                [$controller, $method] = explode('/', $target, 2);
                if (!$this->targetExists($layer, $controller, $method)) {
                    $missing[] = basename($file) . ': ' . $layer . '/' . $target;
                }
            }
        }

        self::assertGreaterThan(100, $checked, 'Too few routed targets were discovered');
        self::assertSame([], array_values(array_unique($missing)), "Unresolvable route targets:\n" . implode("\n", $missing));
    }

    /** Remove comments so commented-out routes are not treated as live ones. */
    private function stripComments(string $source): string
    {
        return (string)preg_replace(['/\/\*[\s\S]*?\*\//', '/(^|[^:])\/\/[^\n]*/'], ['', '$1'], $source);
    }

    /** A target must resolve inside the layer that registered the route. */
    private function targetExists(string $layer, string $controller, string $method): bool
    {
        $class = 'app\\' . $layer . '\\controller\\' . str_replace('.', '\\', $controller);
        if (class_exists($class) && method_exists($class, $method)) {
            return true;
        }
        // The dispatcher applies StudlyCase to the controller segment, so a route
        // may name `wechat.menus` while the file on disk is `Menus.php`.
        $parts = explode('.', $controller);
        $parts[count($parts) - 1] = str_replace(' ', '', ucwords(str_replace(['-', '_'], ' ', (string)end($parts))));
        $file = CRMEB_TEST_ROOT . '/app/' . $layer . '/controller/' . implode('/', $parts) . '.php';
        if (!is_file($file)) {
            return false;
        }
        return (bool)preg_match('/\bfunction\s+' . preg_quote($method, '/') . '\s*\(/i', (string)file_get_contents($file));
    }
}
