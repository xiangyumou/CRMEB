<?php
declare(strict_types=1);
namespace Tests\Regression\Cases;
use app\services\activity\coupon\StoreCouponIssueServices;
use app\services\user\UserServices;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;
final class NewUserCouponTest extends RegressionTestCase
{
    public function testRegistrationRetryIssuesCouponOnceAndNeverCreditsMoneyOrPoints(): void
    {
        $user = (new FixtureFactory($this, $this->getName()))->createUser();
        $id = (int)Db::name('store_coupon_issue')->insertGetId(['title'=>'Core newcomer','coupon_price'=>'5.00','coupon_time'=>7,'is_permanent'=>1,'status'=>1]);
        $this->registerCleanup(function () use ($id, $user) {
            Db::name('store_coupon_issue_user')->where('uid',$user['uid'])->delete();
            Db::name('store_coupon_user')->where('uid',$user['uid'])->delete();
            Db::name('store_coupon_issue')->where('id',$id)->delete();
        });
        $this->replace('sysConfig', new class($id) {
            private $id;
            public function __construct($id) { $this->id=$id; }
            public function get($key) { return $key==='reward_coupon' ? [['id'=>$this->id]] : '100'; }
        });
        $before = Db::name('user')->where('uid',$user['uid'])->find();
        $coupons=app()->make(StoreCouponIssueServices::class);
        self::assertTrue($coupons->userFirstSubGiveCoupon($user['uid']));
        self::assertTrue($coupons->userFirstSubGiveCoupon($user['uid']));
        app()->make(UserServices::class)->rewardNewUser($user['uid']);
        self::assertSame(1,Db::name('store_coupon_user')->where('uid',$user['uid'])->where('cid',$id)->count());
        self::assertSame(1,Db::name('store_coupon_issue_user')->where('uid',$user['uid'])->where('issue_coupon_id',$id)->count());
        self::assertSame($before,Db::name('user')->where('uid',$user['uid'])->find());
    }
}
