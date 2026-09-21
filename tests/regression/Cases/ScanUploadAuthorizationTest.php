<?php
declare(strict_types=1);
namespace Tests\Regression\Cases;

use app\Request;
use app\adminapi\controller\PublicController;
use app\services\system\attachment\SystemAttachmentServices;
use crmeb\services\CacheService;
use Tests\Regression\Support\RegressionTestCase;

final class ScanUploadAuthorizationTest extends RegressionTestCase
{
    public function testInvalidCredentialsNeverReachUpload(): void
    {
        $previous = CacheService::get('scan_upload');
        $this->registerCleanup(static function () use ($previous): void {
            CacheService::delete('scan_upload');
            if ($previous !== '') CacheService::set('scan_upload', $previous, 600);
        });
        $attachment = $this->getMockBuilder(SystemAttachmentServices::class)
            ->disableOriginalConstructor()->onlyMethods(['upload'])->getMock();
        $attachment->expects(self::never())->method('upload');
        $this->replace(SystemAttachmentServices::class, $attachment);
        foreach ([['', ''], ['', 'token'], ['secret', ''], ['secret', 'wrong'], ['0e123', '0e456'], ['secret', []], [[], 'secret'], ['secret', 0]] as [$cached, $provided]) {
            CacheService::set('scan_upload', $cached, 600);
            $request = $this->getMockBuilder(Request::class)->onlyMethods(['postMore'])->getMock();
            $request->expects(self::once())->method('postMore')->willReturn(['file', $provided, 0]);
            $response = (new PublicController())->scanUpload($request);
            self::assertSame(400, $response->getData()['status']);
        }
    }

    public function testMatchingCredentialAllowsUpload(): void
    {
        $previous = CacheService::get('scan_upload');
        $this->registerCleanup(static function () use ($previous): void {
            CacheService::delete('scan_upload');
            if ($previous !== '') CacheService::set('scan_upload', $previous, 600);
        });
        $token = bin2hex(random_bytes(32));
        CacheService::set('scan_upload', $token, 600);
        $attachment = $this->getMockBuilder(SystemAttachmentServices::class)
            ->disableOriginalConstructor()->onlyMethods(['upload'])->getMock();
        $attachment->expects(self::once())->method('upload')->with(7, 'file', 0, 0, '', $token);
        $this->replace(SystemAttachmentServices::class, $attachment);
        $request = $this->getMockBuilder(Request::class)->onlyMethods(['postMore'])->getMock();
        $request->expects(self::once())->method('postMore')->willReturn(['file', $token, 7]);
        self::assertSame(200, (new PublicController())->scanUpload($request)->getData()['status']);
    }
}
