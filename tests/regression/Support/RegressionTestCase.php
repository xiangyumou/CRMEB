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
