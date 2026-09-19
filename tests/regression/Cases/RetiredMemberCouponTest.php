<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\dao\activity\coupon\StoreCouponIssueDao;
use app\services\activity\coupon\StoreCouponIssueServices;
use crmeb\exceptions\ApiException;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

/**
 * Member-exclusive coupons (receive_type = 4) belonged to the retired member
 * feature. A shop imported from an older release can still hold the rows, so the
 * storefront must not list them and nobody may be handed one.
 */
final class RetiredMemberCouponTest extends RegressionTestCase
{
    public function testRetiredMemberCouponsAreHiddenFromEveryStorefrontQuery(): void
    {
        $factory = new FixtureFactory($this, $this->getName());
        $user = $factory->createUser();
        $dao = app()->make(StoreCouponIssueDao::class);

        // Baseline on the shipped data plus one ordinary coupon we control.
        $normalId = $this->seedCoupon(1, 'ordinary');
        $before = $dao->getIssueCouponCount(0, []);

        $memberId = $this->seedCoupon(4, 'member');
        $after = $dao->getIssueCouponCount(0, []);

        self::assertSame($before, $after, 'a retired member coupon must not change any storefront count');
        self::assertSame(3, array_sum($after), 'the shipped member coupon must already be excluded from the counts');

        $listed = static fn (array $rows): array => array_map('intval', array_column($rows, 'id'));
        $issueList = $listed($dao->getIssueCouponList((int)$user['uid'], 0, 0, 0, 0));
        $pcList = $listed($dao->getPcIssueCouponList((int)$user['uid']));
        $todayList = $listed($dao->getTodayCoupon((int)$user['uid']));
        $searchIds = array_map('intval', $dao->search(['receive_types' => 1])->column('id'));

        foreach (['issue' => $issueList, 'pc' => $pcList, 'today' => $todayList, 'search' => $searchIds] as $name => $ids) {
            self::assertContains($normalId, $ids, $name . ' query must still return an ordinary coupon');
            self::assertNotContains($memberId, $ids, $name . ' query must not return a retired member coupon');
            self::assertNotContains(2, $ids, $name . ' query must not return the shipped member coupon');
        }
    }

    public function testClaimingARetiredMemberCouponIsRefusedBeforeAnyWrite(): void
    {
        $factory = new FixtureFactory($this, $this->getName());
        $user = $factory->createUser();
        $memberId = $this->seedCoupon(4, 'member');
        $before = Db::name('store_coupon_issue')->where('id', $memberId)->find();

        $coupons = app()->make(StoreCouponIssueServices::class);
        try {
            $coupons->issueUserCoupon($memberId, (object)['uid' => $user['uid']], true);
            self::fail('a retired member coupon must not be issued');
        } catch (ApiException $exception) {
            self::assertSame('该优惠券所属业务已下线', $exception->getMessage());
        }

        self::assertSame(0, Db::name('store_coupon_issue_user')->where('issue_coupon_id', $memberId)->count());
        self::assertSame(0, Db::name('store_coupon_user')->where('cid', $memberId)->count());
        self::assertSame($before, Db::name('store_coupon_issue')->where('id', $memberId)->find());
    }

    public function testAnOrdinaryCouponIsStillIssued(): void
    {
        $factory = new FixtureFactory($this, $this->getName());
        $user = $factory->createUser();
        $normalId = $this->seedCoupon(1, 'ordinary');

        app()->make(StoreCouponIssueServices::class)->issueUserCoupon($normalId, (object)['uid' => $user['uid']], true);

        self::assertSame(1, Db::name('store_coupon_issue_user')->where('issue_coupon_id', $normalId)->where('uid', $user['uid'])->count());
        self::assertSame(1, Db::name('store_coupon_user')->where('cid', $normalId)->where('uid', $user['uid'])->count());
        self::assertSame(4, (int)Db::name('store_coupon_issue')->where('id', $normalId)->value('remain_count'), 'a manual claim still consumes one');
    }

    /**
     * The DIY "coupon" component (PublicController::themeCoupon and the admin
     * picker) must not surface a coupon that nobody can claim any more.
     */
    public function testTheDiyCouponComponentDoesNotOfferRetiredMemberCoupons(): void
    {
        $factory = new FixtureFactory($this, $this->getName());
        $normalId = $this->seedCoupon(1, 'ordinary');
        $memberId = $this->seedCoupon(4, 'member');
        $coupons = app()->make(StoreCouponIssueServices::class);

        $base = [
            'ids' => '',
            'type' => '',
            'user_type' => '',
            'send_type' => '',
            'is_min_price' => 0,
            'min_price' => 0,
            'start_time' => '',
            'end_time' => '',
            'order' => 0,
            'sort' => 0,
            'limit' => 10,
        ];
        $ids = static fn (array $rows): array => array_map('intval', array_column($rows, 'id'));

        // A DIY block that offers every user must still offer the ordinary coupon.
        $listed = $ids($coupons->getThemeCoupon($base));
        self::assertContains($normalId, $listed, 'the DIY component must still offer an ordinary coupon');
        self::assertNotContains($memberId, $listed, 'the DIY component must not offer a retired member coupon');
        self::assertNotContains(2, $listed, 'the DIY component must not offer the shipped member coupon');

        // The retired member audience has nothing left to show.
        self::assertSame([], $coupons->getThemeCoupon(array_merge($base, ['user_type' => '2'])), 'the DIY member component must be empty');

        // A saved DIY block that pins coupon ids must not resurrect the retired one either.
        $byId = $ids($coupons->getThemeCoupon(array_merge($base, ['ids' => $normalId . ',' . $memberId])));
        self::assertContains($normalId, $byId, 'a pinned ordinary coupon must still resolve');
        self::assertNotContains($memberId, $byId, 'a pinned retired member coupon must not resolve');
    }

    /**
     * Insert a claimable coupon row shaped like the admin form writes one. The
     * shipped install keeps its own 会员专享 row (id 2) as receive_type 4, which
     * is exactly the leftover this suite guards against.
     */
    private function seedCoupon(int $receiveType, string $title): int
    {
        $id = (int)Db::name('store_coupon_issue')->insertGetId([
            'title' => $title,
            'coupon_title' => $title,
            'coupon_price' => '5.00',
            'coupon_time' => 7,
            'type' => 0,
            'receive_type' => $receiveType,
            'receive_limit' => 5,
            'total_count' => 5,
            'remain_count' => 5,
            'is_permanent' => 0,
            'status' => 1,
            'is_del' => 0,
            'start_time' => 0,
            'end_time' => 0,
            'add_time' => time(),
        ]);
        $this->registerCleanup(static function () use ($id): void {
            Db::name('store_coupon_issue_user')->where('issue_coupon_id', $id)->delete();
            Db::name('store_coupon_user')->where('cid', $id)->delete();
            Db::name('store_coupon_issue')->where('id', $id)->delete();
        });
        return $id;
    }
}
