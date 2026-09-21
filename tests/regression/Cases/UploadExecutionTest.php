<?php
declare(strict_types=1);
namespace Tests\Regression\Cases;

use Tests\Regression\Support\HttpTestClient;
use Tests\Regression\Support\RegressionTestCase;

/**
 * 上传目录里的文件绝不能被当成代码执行。
 *
 * 改之前 nginx 配置里没有任何 `/uploads` 规则，上传目录下的 `.php` 会命中通用的
 * `location ~ \.php$` 直接交给 php-fpm 解释。也就是说，`config/upload.php` 的扩展名
 * 白名单是"上传"与"代码执行"之间**唯一**的一道防线，没有任何纵深防御——白名单
 * 一旦有疏漏（新增格式、大小写、解析差异），就是直接的远程代码执行。
 *
 * 实测过：同一个文件在改之前的配置下返回 200 并执行了 PHP，改之后返回 403。
 *
 * 这条用例把纵深防御钉住：文件直接写进 nginx 真正伺服的那个上传目录（回归栈里
 * regression、php-fpm、nginx 共享同一个 uploads 卷），所以它验的是真实的
 * nginx 配置，而不是某个替身。
 */
final class UploadExecutionTest extends RegressionTestCase
{
    /**
     * nginx 伺服的上传目录在本容器里的挂载点。
     *
     * 刻意不是 /build/crmeb/public/uploads：见 docker/regression/compose.yml 的说明，
     * 挂在 regression 镜像已有的路径上会让 Docker 用 root 属主的内容填充这个共享卷。
     */
    const UPLOAD_DIR = '/uploads/attach';

    /** @var HttpTestClient */
    private $http;

    protected function setUp(): void
    {
        parent::setUp();
        $this->http = new HttpTestClient();
        if (!is_dir(self::UPLOAD_DIR) && !@mkdir(self::UPLOAD_DIR, 0755, true) && !is_dir(self::UPLOAD_DIR)) {
            self::markTestSkipped('上传目录不可写，回归栈的 uploads 卷没有共享进来');
        }
        // 这个卷是和 php-fpm、nginx 共享的，而本进程是 root、php-fpm 是 www-data。
        // 留下 root 属主的目录会让应用后续在同一棵树下建子目录时 Permission denied，
        // 于是别的用例（例如拼团海报）会莫名其妙地失败。建出来的目录一律交还 www-data。
        self::chownToWebServer(self::UPLOAD_DIR);
    }

    /** php-fpm 在镜像里是 www-data(33)。 */
    private static function chownToWebServer(string $path): void
    {
        @chown($path, 33);
        @chgrp($path, 33);
    }

    /**
     * @dataProvider executableExtensions
     */
    public function testAFileWithAnExecutableExtensionIsNotServedAsCode(string $extension): void
    {
        $name = 'exec-probe-' . getmypid() . '-' . uniqid() . '.' . $extension;
        $marker = 'MARKER-' . strtoupper(uniqid());
        $this->writeUpload($name, '<?php echo "' . $marker . '"; ?>');

        $response = $this->http->requestRaw('GET', '/uploads/attach/' . $name, null);

        self::assertNotSame(200, $response['http_status'], ".{$extension} 仍然可以被取到");
        self::assertStringNotContainsString(
            $marker,
            $response['raw'],
            ".{$extension} 被当成代码执行了，这是远程代码执行"
        );
        self::assertStringNotContainsString(
            '<?php',
            $response['raw'],
            ".{$extension} 的源码被原样回显，同样不可接受"
        );
    }

    /**
     * 对照组：正常的上传文件必须照常能取到，否则上面那条断言可能只是因为整个
     * 上传目录都取不到而空转通过。
     */
    public function testAnOrdinaryUploadIsStillServed(): void
    {
        $name = 'plain-probe-' . getmypid() . '-' . uniqid() . '.txt';
        $this->writeUpload($name, 'plain-content');

        $response = $this->http->requestRaw('GET', '/uploads/attach/' . $name, null);

        self::assertSame(200, $response['http_status'], '正常上传文件应当照常伺服');
        self::assertSame('plain-content', trim($response['raw']));
    }

    /**
     * 点文件同样不能被取到。
     *
     * 这一条是为 `^~` 补的：那个前缀修饰符会让 nginx 在匹配成功后**完全跳过**后面
     * 所有的正则 location，其中就包括全局那条 `location ~ /\.`。也就是说，只加一个
     * `^~ /uploads/` 在堵住 PHP 执行的同时会把点文件重新放出来——修掉一个洞顺手开
     * 另一个。上传目录的块里必须自己再写一遍这条拒绝。
     */
    public function testADotFileUnderUploadsIsNotServed(): void
    {
        $name = '.secret-probe-' . getmypid() . '-' . uniqid();
        $marker = 'DOTFILE-' . strtoupper(uniqid());
        $this->writeUpload($name, $marker);

        $response = $this->http->requestRaw('GET', '/uploads/attach/' . $name, null);

        self::assertNotSame(200, $response['http_status'], '上传目录下的点文件仍然可以被取到');
        self::assertStringNotContainsString($marker, $response['raw'], '点文件的内容被回显了');
    }

    /**
     * 正常上传文件的缓存语义不能因为这次修改而变化。
     *
     * 改之前 `/uploads/**.jpg` 命中的是通用静态资源的那条正则 location，带着
     * `Cache-Control: no-cache, must-revalidate`。`^~` 会跳过它，如果不在新块里补回
     * 这个头，上传文件就变成"没有缓存头"，浏览器改用启发式缓存——同一个 URL 上换了
     * 内容会取到旧的。这属于安全修复顺手改掉了无关行为，不该悄悄发生。
     */
    public function testAnOrdinaryUploadKeepsItsRevalidationHeader(): void
    {
        $name = 'cache-probe-' . getmypid() . '-' . uniqid() . '.jpg';
        $this->writeUpload($name, 'not-really-an-image');

        $response = $this->http->requestRaw('GET', '/uploads/attach/' . $name, null);

        self::assertSame(200, $response['http_status']);
        self::assertStringContainsString(
            'no-cache',
            strtolower($response['headers']['cache-control'] ?? ''),
            '上传文件丢掉了原本的重新校验缓存头'
        );
    }

    /**
     * @return array<string, array{0:string}>
     */
    public function executableExtensions(): array
    {
        $cases = [];
        foreach (['php', 'php5', 'php7', 'phtml', 'phar'] as $extension) {
            $cases[$extension] = [$extension];
        }
        return $cases;
    }

    private function writeUpload(string $name, string $contents): void
    {
        $path = self::UPLOAD_DIR . '/' . $name;
        self::assertNotFalse(file_put_contents($path, $contents), '无法写入上传目录');
        self::chownToWebServer($path);
        $this->registerCleanup(static function () use ($path): void {
            @unlink($path);
        });
    }
}
