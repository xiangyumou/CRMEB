<template>
  <view v-if="qrcode" class="core-customer" @click="preview">客服</view>
</template>
<script>
import { getCustomerType } from '@/api/api.js';
export default {
  props: { dataConfig: { type: Object, default: () => ({}) }, isSortType: { type: [String, Number], default: 0 } },
  data() { return { qrcode: '' }; },
  computed: { logo() { return (this.dataConfig.logoConfig || {}).url || ''; } },
  mounted() { getCustomerType().then(res => { this.qrcode = res.data.customer_qrcode || ''; }).catch(() => { this.qrcode = ''; }); },
  methods: { preview() { if (this.qrcode) uni.previewImage({ urls: [this.qrcode], current: this.qrcode }); } }
};
</script>
<style scoped>
.core-customer { position: fixed; right: 20rpx; bottom: 220rpx; z-index: 40; width: 88rpx; height: 88rpx; border-radius: 50%; background: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 2rpx 12rpx #ddd; }
.core-customer image { width: 88rpx; height: 88rpx; }
</style>
