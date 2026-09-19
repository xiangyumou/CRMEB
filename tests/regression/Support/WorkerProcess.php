<?php
declare(strict_types=1);

namespace Tests\Regression\Support;

/**
 * Launch race-worker.php processes and collect their structured results.
 * Workers are released together by touching the shared start file, so two
 * entries really run at the same moment instead of by sleeps.
 *
 * The child command deliberately contains no shell metacharacters beyond the
 * single quotes of escapeshellarg: this runner's container executes children
 * without a shell, and a `VAR=1 …` prefix or `2>` redirect would make proc_open
 * hand the command to a shell that exits 255 here. Extra environment therefore
 * travels through proc_open's env argument and stderr through its own pipe.
 */
final class WorkerProcess
{
    /**
     * @param array<string, string> $actions map of name => "<action> <id> <value>"
     * @param array<string, string> $extraEnv additional environment for every worker
     * @return array<string, array{ok:bool, value:mixed, error:string}>
     */
    public static function run(array $actions, array $extraEnv = [], float $releaseDelaySeconds = 0.0): array
    {
        $start = tempnam(sys_get_temp_dir(), 'crmeb-race-start-');
        unlink($start);
        $processes = [];
        $outputs = [];

        foreach ($actions as $name => $arguments) {
            $output = tempnam(sys_get_temp_dir(), 'crmeb-race-out-');
            $outputs[$name] = $output;
            $command = sprintf(
                '%s %s %s %s %s',
                escapeshellarg(self::phpBinary()),
                escapeshellarg(dirname(__DIR__) . '/Support/race-worker.php'),
                $arguments,
                escapeshellarg($start),
                escapeshellarg($output)
            );
            $processes[$name] = proc_open($command, self::descriptors(), $pipes, null, self::environment($extraEnv));
            self::assertProcess($processes[$name], $name);
        }

        if ($releaseDelaySeconds > 0) {
            usleep((int)($releaseDelaySeconds * 1000000));
        }
        touch($start);

        $results = [];
        foreach ($processes as $name => $process) {
            $results[$name] = self::collect($name, $process, $outputs[$name]);
        }
        unlink($start);

        return $results;
    }

    /**
     * Start one worker without waiting for it; the caller controls the start
     * file itself (e.g. to hold the worker at a barrier mid-entry).
     *
     * @return array{process:resource, pipes:array, start:string, output:string, name:string}
     */
    public static function startHeld(string $name, string $arguments, array $extraEnv = []): array
    {
        $start = tempnam(sys_get_temp_dir(), 'crmeb-hold-start-');
        unlink($start);
        $output = tempnam(sys_get_temp_dir(), 'crmeb-hold-out-');
        $command = sprintf(
            '%s %s %s %s %s',
            escapeshellarg(self::phpBinary()),
            escapeshellarg(dirname(__DIR__) . '/Support/race-worker.php'),
            $arguments,
            escapeshellarg($start),
            escapeshellarg($output)
        );
        $process = proc_open($command, self::descriptors(), $pipes, null, self::environment($extraEnv));
        self::assertProcess($process, $name);

        return ['process' => $process, 'pipes' => $pipes, 'start' => $start, 'output' => $output, 'name' => $name];
    }

    /**
     * Release a held worker and wait for its result.
     * @param array{process:resource, pipes:array, start:string, output:string, name:string} $held
     * @return array{ok:bool, value:mixed, error:string}
     */
    public static function releaseHeld(array $held, bool $release = true): array
    {
        if ($release) {
            touch($held['start']);
        }

        return self::collect($held['name'], $held['process'], $held['output'], $held['pipes']);
    }

    private static function collect(string $name, $process, string $output, ?array $pipes = null): array
    {
        $stderr = '';
        if ($pipes !== null) {
            if (is_resource($pipes[0])) {
                fclose($pipes[0]);
            }
            $stderr = (string)stream_get_contents($pipes[2]);
            fclose($pipes[2]);
            fclose($pipes[1]);
        }
        $exit = proc_close($process);
        $raw = (string)file_get_contents($output);
        unlink($output);
        $decoded = json_decode($raw, true);
        if ($exit !== 0) {
            throw new \RuntimeException(sprintf('worker %s exited with %d: %s | stderr: %s', $name, $exit, $raw, $stderr));
        }
        if (!is_array($decoded)) {
            throw new \RuntimeException(sprintf('worker %s reported no result: %s | stderr: %s', $name, $raw, $stderr));
        }

        return ['ok' => (bool)$decoded['ok'], 'value' => $decoded['value'] ?? null, 'error' => (string)($decoded['error'] ?? '')];
    }

    private static function descriptors(): array
    {
        return [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']];
    }

    /**
     * proc_open's env argument replaces the environment wholesale, so the
     * current one is carried over and only the extras are layered on top.
     *
     * @param array<string, string> $extraEnv
     * @return array<string, string>
     */
    private static function environment(array $extraEnv): array
    {
        return array_merge(getenv(), $extraEnv);
    }

    private static function phpBinary(): string
    {
        $binary = (string)PHP_BINARY;

        return $binary !== '' ? $binary : 'php';
    }

    private static function assertProcess($process, string $name): void
    {
        if (!is_resource($process)) {
            throw new \RuntimeException(sprintf('could not start worker %s', $name));
        }
    }
}
