<template>
  <view class="deliver-goods">
    <header class="header">
      <view class="order-num">
        <view class="num line1">订单号：{{ order_id }}</view>
      </view>
      <view class="address">
        <view class="name">
          <text class="iconfont icon-ic_location4"></text>
          {{ delivery.real_name }}
          <text class="phone">{{ delivery.user_phone }}</text>
        </view>
        <view>地址：{{ delivery.user_address }}</view>
      </view>
      <view class="line">
        <image src="@/static/images/line.jpg" />
      </view>
    </header>
    <view class="wrapper">
      <view class="item acea-row row-between-wrapper">
        <view>发货方式</view>
        <view class="mode acea-row row-middle row-right">
          <template v-for="(item, index) in types">
            <view
              v-if="item.show"
              class="goods"
              :class="active === index || productType == 3 ? 'on' : ''"
              :key="index"
              @click="changeType(item, index)"
            >
              <text
                :class="[
                  'iconfont',
                  active === index ? 'icon-ic_Selected' : 'icon-ic_unselect',
                ]"
              ></text>
              {{ item.title }}
            </view>
          </template>
        </view>
      </view>
      <block v-if="logistics.length > 0">
        <view class="list" v-show="active === 0">
          <view class="item acea-row row-middle">
            <view>快递公司</view>
            <view class="select-box">
              <picker
                class="pickerBox"
                @change="bindPickerChange"
                :value="seIndex"
                :range="logistics"
                range-key="name"
              >
                <view class="uni-input">{{ logistics[seIndex].name }}</view>
              </picker>
            </view>
            <text class="iconfont icon-ic_rightarrow"></text>
          </view>
          <view class="item acea-row row-middle">
            <view>快递单号</view>
            <input
              type="text"
              placeholder="请输入"
              v-model="delivery_id"
              class="mode"
            />
            <!-- #ifdef MP -->
            <text class="iconfont icon-xiangji" @click="scanCode"></text>
            <!-- #endif -->
            <!-- #ifdef H5 -->
            <text
              v-if="isWeixin"
              class="iconfont icon-xiangji"
              @click="scanCode"
            ></text>
            <!-- #endif -->
          </view>
          <view class="item">
            <view class="trip">顺丰请输入单号 :收件人或寄件人手机号后四位</view>
            <view class="trip">例如：SF000000000000:3941</view>
          </view>
        </view>
      </block>

      <view class="list" v-show="active === 1">
        <view class="item acea-row row-between-wrapper">
          <view>送货人</view>
          <input
            type="text"
            placeholder="填写送货人姓名"
            v-model="post_name"
            class="mode"
          />
        </view>
        <view class="item acea-row row-between-wrapper">
          <view>手机号</view>
          <input
            type="text"
            placeholder="填写送货人手机号"
            v-model="post_phone"
            class="mode"
          />
        </view>
      </view>
      <textarea
        v-show="active === 2"
        v-model="fictitious_content"
        class="textarea"
        @blur="bindTextAreaBlur"
        placeholder="备注"
        :maxlength="500"
        auto-height
      />
    </view>
    <!-- <view class="split-wrapper" v-if="totalNum > 1">
      <view class="split-switch acea-row row-between-wrapper">
        <view>分单发货</view>
        <view
          class="switch"
          :class="{ on: curGoods }"
          @click="changeGoods"
        ></view>
      </view>
      <splitOrder
        :select_all="false"
        :splitGoods="splitGoods"
        @getList="getList"
        v-if="curGoods"
      ></splitOrder>
    </view> -->
    <view class="height-add"></view>
    <view class="confirm-wrapper">
      <view class="confirm" @click="saveInfo">确认提交</view>
    </view>
  </view>
</template>
<script>
// 不支持电子面单打印，也没有平台配置的「送货人」名单：送货人当场填写姓名和手机号。
import {
  getAdminOrderDelivery,
  setAdminOrderDelivery,
  getLogistics,
} from "@/api/admin";
export default {
  name: "GoodsDeliver",
  props: {},
  data: function () {
    return {
      types: [
        {
          type: "express",
          title: "发货",
          key: 1,
          show: true,
        },
        {
          type: "send",
          title: "送货",
          key: 2,
          show: true,
        },
        {
          type: "fictitious",
          title: "无需物流",
          key: 3,
          show: true,
        },
      ],
      orderGoods: [
        {
          title: "开启",
          key: 1,
        },
        {
          title: "关闭",
          key: 0,
        },
      ],
      active: 0,
      order_id: "",
      delivery: [],
      logistics: [],
      delivery_type: "1",
      delivery_name: "",
      delivery_id: "",
      seIndex: 0,
      post_name: "", // 送货人姓名
      post_phone: "", // 送货人手机号
      fictitious_content: "",
      listId: 0,
      curGoods: 0,
      splitGoods: [],
      cartIds: [],
      totalNum: 0,
      productType: 0,
      // #ifdef H5
      isWeixin: this.$wechat.isWeixin(),
      // #endif
    };
  },
  watch: {
    "$route.params.oid": function (newVal) {
      let that = this;
      if (newVal != undefined) {
        that.order_id = newVal;
        that.getIndex();
      }
    },
  },
  onLoad: function (option) {
    this.order_id = option.id;
    this.listId = option.listId;
    this.totalNum = option.totalNum;
    this.comeType = option.comeType;
    this.productType = option.productType;
    if (this.productType == 3) {
      // this.types.splice(0, 2);
      for (let i = 0; i < this.types.length; i++) {
        if (i == 2) {
          this.types[i].show = true;
        } else {
          this.types[i].show = false;
        }
      }
      this.delivery_type = 3;
      this.active = 2;
    }
    // 拆单发货已下线（合约里没有对应路由），分单开关永远是关的。
    this.getIndex();
    this.getLogistics();
  },
  methods: {
    getList(val) {
      let that = this;
      that.splitGoods = val;
      let cartIds = [];
      val.forEach((item) => {
        if (item.checked) {
          let i = {
            cart_id: item.cart_id,
            cart_num: item.surplus_num,
          };
          cartIds.push(i);
        }
      });
      this.cartIds = cartIds;
    },
    // 点击获取拆单列表
    // 扫描快递单号一维码
    scanCode() {
      // #ifdef MP
      let that = this;
      uni.scanCode({
        scanType: ["barCode"],
        success(res) {
          that.delivery_id = res.result;
        },
      });
      // #endif
      // #ifdef H5
      if (this.$wechat.isWeixin()) {
        this.$wechat
          .wechatEvevt("scanQRCode", {
            needResult: 1,
            scanType: ["barCode"],
          })
          .then((res) => {
            let result = res.resultStr.split(",");
            this.delivery_id = result[1];
          });
      }
      // #endif
    },
    changeType: function (item, index) {
      this.active = index;
      this.delivery_type = item.key;
    },
    getIndex: function () {
      let that = this;
      getAdminOrderDelivery(that.order_id).then(
        (res) => {
          that.delivery = res.data;
        },
        (error) => {
          that.$util.Tips({
            title: error,
          });
        }
      );
    },
    getLogistics(status) {
      let that = this;
      getLogistics({
        status,
      }).then(
        (res) => {
          that.logistics = res.data;
        },
        (error) => {
          that.$util.Tips({
            title: error,
          });
        }
      );
    },
    async saveInfo() {
      let that = this,
        delivery_type = that.delivery_type,
        delivery_name = that.logistics[that.seIndex].name,
        delivery_id = that.delivery_id,
        userName = that.delivery_name,
        save = {};
      save.delivery_type = delivery_type;
      save.delivery_code = that.logistics[that.seIndex].code;
      save.delivery_company_id = that.logistics[that.seIndex].id;
      save.delivery_name = that.logistics[that.seIndex].name;
      save.type = that.active + 1;
      if (delivery_type == 1) {
        if (!delivery_id) {
          return this.$util.Tips({
            title: "请填写快递单号",
          });
        }
        save.delivery_id = delivery_id;
        that.setInfo(save);
      }
      // 送货：路由收的是当场填写的姓名和手机号。
      if (delivery_type == 2) {
        if (!that.post_name) {
          return this.$util.Tips({
            title: "请填写送货人姓名",
          });
        }
        if (!/^1[3456789]\d{9}$/.test(that.post_phone)) {
          return this.$util.Tips({
            title: "请填写送货人手机号",
          });
        }
        that.setInfo({
          type: that.delivery_type,
          sh_delivery_name: that.post_name,
          sh_delivery_id: that.post_phone,
        });
      }
      if (delivery_type == 3) {
        let params = {};
        params.type = that.delivery_type;
        params.fictitious_content = that.fictitious_content;
        that.setInfo(params);
      }
    },
    setInfo: function (item) {
      let that = this;
      setAdminOrderDelivery(that.delivery.id, item).then(
        (res) => {
          that.$util.Tips({
            title: res.msg,
            icon: "success",
            mask: true,
          });
          setTimeout((res) => {
            if (this.comeType == 2) {
              uni.navigateTo({
                url: "/pages/admin/orderDetail/index?id=" + this.order_id,
              });
            } else {
              uni.navigateTo({
                url: "/pages/admin/orderList/index?types=1",
              });
            }
          }, 2000);
        },
        (error) => {
          that.$util.Tips({
            title: error,
          });
        }
      );
    },
    bindPickerChange(e) {
      this.seIndex = e.detail.value;
    },
  },
};
</script>

<style lang="scss">
.picker-add {
  display: flex;
  align-items: center;
}

.height-add {
  height: 120upx;
}

/*发货*/
.deliver-goods {
  padding: 22rpx 20rpx;
}

.deliver-goods .header {
  position: relative;
  padding: 0 32rpx;
  border-radius: 24rpx;
  background: #ffffff;
  overflow: hidden;
}

.deliver-goods .header .order-num {
  padding: 20rpx 0;
  border-bottom: 1px dotted #eeeeee;
}

.deliver-goods .header .order-num .num {
  font-size: 28rpx;
  line-height: 40rpx;
  color: #333333;
  position: relative;
}

.deliver-goods header .order-num .num:after {
}

.deliver-goods header .order-num .name {
  width: 260upx;
  font-size: 26upx;
  color: #282828;
  text-align: center;
}

.deliver-goods header .order-num .name .iconfont {
  font-size: 35upx;
  color: #477ef3;
  vertical-align: middle;
  margin-right: 10upx;
}

.deliver-goods .header .address {
  padding: 20rpx 0 40rpx;
  font-size: 24rpx;
  line-height: 34rpx;
  color: #999999;
}

.deliver-goods .header .address .name {
  font-weight: 500;
  font-size: 30rpx;
  line-height: 42rpx;
  color: #333333;
  margin-bottom: 12rpx;
}

.deliver-goods .header .address .name .iconfont {
  margin-right: 8rpx;
  font-size: 32rpx;
}

.deliver-goods .header .address .name .phone {
  margin-left: 40rpx;
}

.deliver-goods .header .line {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 4rpx;
}

.deliver-goods .header .line image {
  width: 100%;
  height: 100%;
  display: block;
}

.deliver-goods .wrapper {
  padding: 12rpx 0;
  border-radius: 24rpx;
  margin-top: 20rpx;
  background-color: #fff;
}

.deliver-goods .wrapper .item {
  padding: 0 24rpx;
  height: 80rpx;
  font-size: 28rpx;
  color: #333333;
  position: relative;
}

.deliver-goods .wrapper .item .mode {
  flex: 1;
  height: 100%;
  text-align: right;
}

.deliver-goods .wrapper .item .mode .iconfont {
  font-size: 32rpx;
  margin-right: 12rpx;
  color: #cccccc;
}

.deliver-goods .wrapper .item .mode .goods ~ .goods {
  margin-left: 50rpx;
}

.deliver-goods .wrapper .item .mode .goods {
  color: #999999;
}

.deliver-goods .wrapper .item .mode .goods.on {
  color: #333333;
}

.deliver-goods .wrapper .item .mode .goods.on .iconfont {
  color: $primary-admin;
}

.deliver-goods .wrapper .item .icon-up {
  position: absolute;
  font-size: 35upx;
  color: #2c2c2c;
  right: 30upx;
}

.deliver-goods .wrapper .item select {
  direction: rtl;
  padding-right: 60upx;
  position: relative;
  z-index: 2;
}

.deliver-goods .wrapper .item input::placeholder {
  color: #bbb;
}

.deliver-goods .confirm-wrapper {
  background-color: #ffffff;
  position: fixed;
  left: 0;
  bottom: 0;
  bottom: constant(safe-area-inset-bottom);
  bottom: env(safe-area-inset-bottom);
  width: 100%;
  padding: 20rpx;
}

.deliver-goods .confirm {
  font-weight: 500;
  font-size: 28rpx;
  color: #fff;
  height: 80rpx;
  border-radius: 40rpx;
  background: #2a7efb;
  text-align: center;
  line-height: 80rpx;
}

.select-box {
  flex: 1;
  height: 100%;

  .pickerBox {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    width: 100%;
    height: 100%;

    .iconfont {
      margin-left: 8rpx;
      font-size: 24rpx;
      color: #999999;
    }
  }
}

.look {
  margin-left: 20rpx;
  color: $primary-admin;
}

.textarea {
  display: block;
  min-height: 192rpx;
  padding: 24rpx;
  width: 100%;
  // border-bottom: 1px solid #f0f0f0;
  box-sizing: border-box;
}

.icon-xiangji {
  font-size: 35rpx;
  color: $primary-admin;
}

.trip {
  font-size: 22rpx;
  color: #ccc;
  padding: 6rpx 0;
}

.split-wrapper {
  border-radius: 24rpx;
  margin-top: 20rpx;
  background: #ffffff;

  .splitOrder {
    padding: 0 24rpx 46rpx;
    margin: 0;
  }
}

.split-switch {
  padding: 40rpx 24rpx;
  font-size: 28rpx;
  color: #333333;

  .switch {
    position: relative;
    width: 79rpx;
    height: 48rpx;
    padding: 4rpx;
    border-radius: 24rpx;
    background: #dddddd;
    transition: background 0.1s, border 0.1s;

    &::after {
      content: "";
      position: absolute;
      top: 4rpx;
      left: 4rpx;
      width: 40rpx;
      height: 40rpx;
      border-radius: 20rpx;
      background: #ffffff;
      box-shadow: 0 3rpx 6rpx 0 rgba(0, 0, 0, 0.08);
      transition: transform 0.35s cubic-bezier(0.4, 0.4, 0.25, 1.35);
    }

    &.on {
      background: #2a7efb;

      &::after {
        transform: translateX(31rpx);
      }
    }
  }
}
</style>
