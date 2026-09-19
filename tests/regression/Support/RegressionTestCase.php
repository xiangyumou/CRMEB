<?php
declare(strict_types=1);

namespace Tests\Regression\Support;

use PHPUnit\Framework\TestCase;
use think\Container;

abstract class RegressionTestCase extends TestCase
{
    /** @var array<string, object> */
    private $replacements = [];

    /** @var callable[] */
    private $cleanups = [];

    public function registerCleanup(callable $cleanup): void
    {
        $this->cleanups[] = $cleanup;
    }

    protected function replace(string $abstract, object $replacement): void
    {
        Container::getInstance()->instance($abstract, $replacement);
        $this->replacements[$abstract] = $replacement;
    }

    /**
     * Bind an abstract to a factory for one test, the way `app()->make($abstract, $args)`
     * resolves one on demand. `replace()` cannot cover this: it hands back a fixed
     * object and never sees the requested constructor arguments.
     *
     * `Container::bind()` has no unbind, an already resolved instance wins over the
     * closure, and `delete()` only drops the instance. Cleanup therefore removes both,
     * or the fake would leak into every later test in the same process.
     */
    protected function bindClass(string $abstract, callable $factory): void
    {
        $container = Container::getInstance();
        $container->delete($abstract);
        $container->bind($abstract, \Closure::fromCallable($factory));
        $this->registerCleanup(static function () use ($container, $abstract): void {
            $container->delete($abstract);
            $property = new \ReflectionProperty(Container::class, 'bind');
            $property->setAccessible(true);
            $bound = $property->getValue($container);
            unset($bound[$abstract]);
            $property->setValue($container, $bound);
        });
    }

    protected function tearDown(): void
    {
        $container = Container::getInstance();
        foreach (array_keys($this->replacements) as $abstract) {
            $container->delete($abstract);
        }
        $this->replacements = [];

        $failure = null;
        while ($cleanup = array_pop($this->cleanups)) {
            try {
                $cleanup();
            } catch (\Throwable $throwable) {
                $failure = $failure ?: $throwable;
            }
        }

        try {
            parent::tearDown();
        } catch (\Throwable $throwable) {
            $failure = $failure ?: $throwable;
        }

        if ($failure) {
            throw $failure;
        }
    }
}
