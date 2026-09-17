<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use Tests\Regression\Support\RegressionTestCase;

/**
 * Every route target must resolve to a controller method that exists. Deleting
 * whole controllers for the retired features makes stale routes the most likely
 * way to break an unrelated endpoint, so the check is static and exhaustive.
 */
final class RouteIntegrityTest extends RegressionTestCase
{
    public function testEveryRouteTargetResolvesToAnExistingControllerMethod(): void
    {
        $files = array_merge(
            glob(CRMEB_TEST_ROOT . '/app/adminapi/route/*.php') ?: [],
            glob(CRMEB_TEST_ROOT . '/app/api/route/*.php') ?: [],
            glob(CRMEB_TEST_ROOT . '/app/outapi/route/*.php') ?: [],
            glob(CRMEB_TEST_ROOT . '/route/*.php') ?: []
        );
        self::assertNotEmpty($files, 'No route files found');

        $missing = [];
        $checked = 0;
        foreach ($files as $file) {
            $source = (string)file_get_contents($file);
            preg_match_all('/Route::\w+\(\s*\'[^\']*\'\s*,\s*\'([^\']+)\'/', $source, $matches);
            foreach ($matches[1] as $target) {
                if (strpos($target, '/') === false) {
                    continue;
                }
                $checked++;
                [$controller, $method] = explode('/', $target, 2);
                if (!$this->targetExists($controller, $method)) {
                    $missing[] = basename($file) . ': ' . $target;
                }
            }
        }

        self::assertGreaterThan(100, $checked, 'Too few routed targets were discovered');
        self::assertSame([], array_values(array_unique($missing)), "Unresolvable route targets:\n" . implode("\n", $missing));
    }

    /** The same controller name can exist in several layers, so match on the method. */
    private function targetExists(string $controller, string $method): bool
    {
        foreach (['adminapi', 'api', 'outapi'] as $layer) {
            $class = 'app\\' . $layer . '\\controller\\' . str_replace('.', '\\', $controller);
            if (class_exists($class) && method_exists($class, $method)) {
                return true;
            }
        }
        return false;
    }
}
