<?php
declare(strict_types=1);
namespace Tests\Regression\Cases;

use Tests\Regression\Support\HttpTestClient;
use Tests\Regression\Support\RegressionTestCase;

/**
 * `/api/crontab/*` 曾经把定时任务挂在公网上，任何人都能匿名触发。
 *
 * 整个 `/api` 路由组挂的是 `AuthTokenMiddleware::class, false`——第二个参数为假时
 * 中间件会吞掉鉴权异常继续放行，而 `CrontabController` 又不继承任何鉴权基类，
 * 于是八个 GET 全部是匿名可达的。其中 `take_delivery` 会强制确认收货，压缩买家的
 * 售后窗口；`clear_poster` 删附件；`order_cancel` 取消订单并释放库存与优惠券；
 * 其余几个都是无界开销的数据库操作，反复 GET 即可当作放大型 DoS。
 *
 * 本部署的定时任务由独立的 timer 容器运行（deploy/production/compose.yml 的
 * `command: ["timer"]`，并有自己的健康检查），这组 HTTP 接口是另一套冗余机制，
 * 因此整组删除。下面的用例把"已经不在了"钉住：路由回流会让它们失败。
 *
 * 断言用 requestRaw()：路由删掉之后落到 `Route::miss`，返回的是空 body 的 404，
 * 不是 JSON。
 */
final class StorefrontCronEndpointTest extends RegressionTestCase
{
    /** @var HttpTestClient */
    private $http;

    protected function setUp(): void
    {
        parent::setUp();
        $this->http = new HttpTestClient();
    }

    /**
     * @dataProvider retiredCronPaths
     */
    public function testTheCronEndpointIsNotReachableAnonymously(string $path): void
    {
        $response = $this->http->requestRaw('GET', $path, null);
        self::assertSame(404, $response['http_status'], $path . ' 仍然可以被匿名调用');
    }

    /**
     * 对照组：证明上面那一组 404 是"这些路由没了"，而不是整个 /api 都挂了。
     * 少了这一条，栈起不来时上面的断言会全部空转通过。
     */
    public function testAnOrdinaryPublicStorefrontRouteStillAnswers(): void
    {
        $response = $this->http->requestRaw('GET', '/api/user_agreement', null);
        self::assertSame(200, $response['http_status'], '公开接口也不通，说明栈本身有问题');
    }

    /**
     * @return array<string, array{0:string}>
     */
    public function retiredCronPaths(): array
    {
        $paths = [
            '/api/crontab/run',
            '/api/crontab/check',
            '/api/crontab/order_cancel',
            '/api/crontab/pink_expiration',
            '/api/crontab/take_delivery',
            '/api/crontab/advance_off',
            '/api/crontab/product_replay',
            '/api/crontab/clear_poster',
        ];
        $cases = [];
        foreach ($paths as $path) {
            $cases[$path] = [$path];
        }
        return $cases;
    }
}
