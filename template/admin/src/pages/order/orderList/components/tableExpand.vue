<template>
  <div class="expand">
    <el-row class="expand-row">
      <el-col :span="6">
        <span class="expand-key">商品总价：</span>
        <span class="expand-value" v-text="row.total_price"></span>
      </el-col>
      <el-col :span="6">
        <span class="expand-key">下单时间：</span>
        <span class="expand-value" v-text="row.add_time"></span>
      </el-col>
    </el-row>
    <el-row>
      <el-col :span="6">
        <span class="expand-key">用户备注：</span>
        <span class="expand-value" v-text="row.mark ? row.mark : '无'"></span>
      </el-col>
      <el-col :span="6">
        <span class="expand-key">商家备注：</span>
        <span class="expand-value" v-text="row.remark ? row.remark : '无'"></span>
      </el-col>
    </el-row>
  </div>
</template>

<script>
export default {
  name: 'table-expand',
  props: {
    row: Object,
  },
};
</script>

<style scoped>
.expand {
  /* padding-left: 50px; */
}
.expand-row {
  margin-bottom: 16px;
}
</style>
