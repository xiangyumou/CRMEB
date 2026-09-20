<?php
declare(strict_types=1);

// Run the real `order:reconcile` console command against the offline gateway.
// The console command itself is production code and knows nothing about tests;
// this wrapper only binds the test transport before handing over, so the
// command's argument parsing, option handling and service calls all run for
// real.
//   php reconcile-cli.php payments:list
//   php reconcile-cli.php payments:refund 12 --confirm-trade-no T --operator me
//
// The binding must happen AFTER App::initialize(): initializing the app
// rebuilds the container and would drop an earlier binding, silently sending
// the command to the real payment driver.

require dirname(__DIR__) . '/bootstrap.php';
require dirname(__DIR__) . '/vendor/autoload.php';

$root = getenv('CRMEB_ROOT') ?: dirname(__DIR__, 3) . '/crmeb';
$app = new think\App($root);
$app->initialize();

\Tests\Regression\Support\StatefulGateway::install();
\Tests\Regression\Support\StatefulGateway::bind();

$console = new think\Console($app);
$console->addCommand(new \crmeb\command\OrderReconcile());
// `order:reconcile` takes the action as its first argument and the rest as
// options, so this wrapper's argv is the command line after the command name.
$input = new think\console\Input(array_merge(['order:reconcile', $argv[1] ?? 'payments:list'], array_slice($argv, 2)));
$output = new think\console\Output();
exit($console->doRun($input, $output));
