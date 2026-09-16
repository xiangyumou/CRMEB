<?php
declare(strict_types=1);
namespace Tests\Regression\Cases;
use app\services\CoreStore;
use app\services\activity\combination\StorePinkServices;
use app\services\system\crontab\CrontabRunServices;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;
final class RetainedActivityTest extends RegressionTestCase
{
    public function testDiyKeepsRetainedActivitiesAndRemovesWholeDeadNavigationEntry(): void
    {
        $keep=[['name'=>'combination'],['name'=>'presale'],['name'=>'newVip'],['name'=>'coupon']];
        $data=array_merge($keep,[['name'=>'seckill'],['name'=>'bargain'],['info'=>[['value'=>'余额'],['value'=>'/pages/users/user_money/index']]]]);
        self::assertSame($keep, CoreStore::cleanDiy($data));
    }
    public function testPresaleExpirationOnlyUnlistsExpiredPresaleProducts(): void
    {
        $factory=new FixtureFactory($this,$this->getName());
        $expired=$factory->createProduct(['presale'=>1,'presale_end_time'=>time()-60]);
        $future=$factory->createProduct(['presale'=>1,'presale_end_time'=>time()+3600]);
        $ordinary=$factory->createProduct(['presale'=>0,'presale_end_time'=>0]);
        Db::startTrans();
        try {
            $cron=new CrontabRunServices();
            $cron->advanceOff(); $cron->advanceOff();
            self::assertSame(0,(int)Db::name('store_product')->where('id',$expired['id'])->value('is_show'));
            self::assertSame(1,(int)Db::name('store_product')->where('id',$future['id'])->value('is_show'));
            self::assertSame(1,(int)Db::name('store_product')->where('id',$ordinary['id'])->value('is_show'));
        } finally { Db::rollback(); }
    }
    public function testSuccessfulGroupUpdatesLeaderAndMembersWithoutRepeatedNotification(): void
    {
        Db::startTrans();
        try {
            $leader=Db::name('store_pink')->insertGetId(['uid'=>999999,'status'=>1,'is_tpl'=>1]);
            $member=Db::name('store_pink')->insertGetId(['uid'=>999998,'status'=>1,'is_tpl'=>1,'k_id'=>$leader]);
            $service=app()->make(StorePinkServices::class);
            self::assertTrue($service->successPinkEdit([$leader]));
            self::assertTrue($service->successPinkEdit([$leader]));
            self::assertSame([2,2],array_map('intval',Db::name('store_pink')->whereIn('id',[$leader,$member])->order('id')->column('status')));
        } finally { Db::rollback(); }
    }
}
