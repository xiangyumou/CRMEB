<template>
  <div>
    <el-card :bordered="false" shadow="never" class="ivu-mt" :body-style="{ padding: 0 }">
      <div class="padding-add">
        <el-form
          ref="userFrom"
          :model="userFrom"
          label-width="80px"
          label-position="right"
          @submit.native.prevent
          inline
        >
          <div class="acea-row search-form" v-if="!collapse">
            <div>
              <el-form-item label="用户搜索：" label-for="nickname">
                <el-input v-model="userFrom.nickname" placeholder="请输入用户" clearable class="form_content_width">
                  <el-select v-model="field_key" slot="prepend" style="width: 100px">
                    <el-option value="all" label="全部"></el-option>
                    <el-option value="uid" label="UID"></el-option>
                    <el-option value="phone" label="手机号"></el-option>
                    <el-option value="nickname" label="用户昵称"></el-option>
                  </el-select>
                </el-input>
              </el-form-item>
              <el-form-item label="用户分组：">
                <el-select v-model="group_id" placeholder="请选择用户分组" clearable class="form_content_width">
                  <el-option value="all" label="全部"></el-option>
                  <el-option
                    :value="item.id"
                    v-for="(item, index) in groupList"
                    :key="index"
                    :label="item.group_name"
                  ></el-option>
                </el-select>
              </el-form-item>
            </div>
            <el-form-item class="search-form-sub">
              <el-button type="primary" v-db-click @click="userSearchs">查询</el-button>
              <el-button class="ResetSearch" v-db-click @click="reset('userFrom')">重置</el-button>
              <a class="ivu-ml-8 font12 ml10" v-db-click @click="collapse = !collapse">
                <template v-if="!collapse"> 展开 <i class="el-icon-arrow-down" /> </template>
                <template v-else> 收起 <i class="el-icon-arrow-up" /> </template>
              </a>
            </el-form-item>
          </div>
          <div v-if="collapse" class="acea-row search-form">
            <div class="search-form-box">
              <el-form-item label="用户搜索：" label-for="nickname">
                <el-input v-model="userFrom.nickname" placeholder="请输入用户" clearable class="form_content_width">
                  <el-select v-model="field_key" slot="prepend" style="width: 100px">
                    <el-option value="all" label="全部"></el-option>
                    <el-option value="uid" label="UID"></el-option>
                    <el-option value="phone" label="手机号"></el-option>
                    <el-option value="nickname" label="用户昵称"></el-option>
                  </el-select>
                </el-input>
              </el-form-item>
              <el-form-item label="用户分组：">
                <el-select v-model="group_id" placeholder="请选择用户分组" clearable class="form_content_width">
                  <el-option value="all" label="全部"></el-option>
                  <el-option
                    :value="item.id"
                    v-for="(item, index) in groupList"
                    :key="index"
                    :label="item.group_name"
                  ></el-option>
                </el-select>
              </el-form-item>
              <el-form-item label="用户标签：" label-for="label_id">
                <div class="labelInput acea-row row-between-wrapper" v-db-click @click="openSelectLabel">
                  <div style="width: 222px">
                    <div v-if="selectDataLabel.length">
                      <el-tag :closable="false" v-for="(item, index) in selectDataLabel" :key="index" class="mr10">{{
                        item.label_name
                      }}</el-tag>
                    </div>
                    <span class="span" v-else>选择用户关联标签</span>
                  </div>
                  <div class="ivu-icon ivu-icon-ios-arrow-down"></div>
                </div>
              </el-form-item>
              <el-form-item label="上次消费：" label-for="before_pay_time">
                <el-date-picker
                  clearable
                  v-model="before_pay_time"
                  type="daterange"
                  :editable="false"
                  @change="(e) => onchangeTime(e, 'before_pay_time')"
                  format="yyyy/MM/dd"
                  value-format="yyyy/MM/dd"
                  start-placeholder="开始日期"
                  end-placeholder="结束日期"
                  :picker-options="pickerOptions"
                  style="width: 250px"
                ></el-date-picker>
              </el-form-item>
              <el-form-item label="下单次数：" label-for="pay_count">
                <el-input
                  clearable
                  placeholder="最小值"
                  v-model="userFrom.pay_count_num[0]"
                  class="form_range_content_width"
                />
                ~
                <el-input
                  clearable
                  placeholder="最大值"
                  v-model="userFrom.pay_count_num[1]"
                  class="form_range_content_width"
                />
              </el-form-item>
              <el-form-item label="消费金额：" label-for="store_name">
                <el-input
                  clearable
                  placeholder="最小值"
                  v-model="userFrom.pay_count_money[0]"
                  class="form_range_content_width"
                />
                ~
                <el-input
                  clearable
                  placeholder="最大值"
                  v-model="userFrom.pay_count_money[1]"
                  class="form_range_content_width"
                />
              </el-form-item>
              <el-form-item label="访问情况：" label-for="user_time_type">
                <el-select v-model="user_time_type" placeholder="请选择访问情况" clearable class="form_content_width">
                  <el-option value="" label="全部"></el-option>
                  <el-option value="visitno" label="时间段未访问"></el-option>
                  <el-option value="visit" label="时间段访问过"></el-option>
                  <el-option value="add_time" label="首次访问"></el-option>
                </el-select>
              </el-form-item>
              <el-form-item label="访问时间：" label-for="user_time" v-if="user_time_type">
                <el-date-picker
                  clearable
                  v-model="timeVal"
                  type="daterange"
                  :editable="false"
                  @change="(e) => onchangeTime(e, 'user_time')"
                  format="yyyy/MM/dd"
                  value-format="yyyy/MM/dd"
                  start-placeholder="开始日期"
                  end-placeholder="结束日期"
                  :picker-options="pickerOptions"
                  style="width: 250px"
                ></el-date-picker>
              </el-form-item>
              <!-- <el-form-item label="地区：" label-for="country">
                <el-select
                  v-model="userFrom.country"
                  placeholder="请选择国家"
                  clearable
                  @change="changeCountry"
                  class="form_content_width"
                >
                  <el-option value="domestic" label="中国"></el-option>
                  <el-option value="abroad" label="外国"></el-option>
                </el-select>
              </el-form-item>
              <el-form-item label="省份：" v-if="userFrom.country === 'domestic'">
                <el-cascader
                  :options="addresData"
                  :value="address"
                  v-model="address"
                  @change="handleChange"
                  clearable
                  style="width: 250px"
                ></el-cascader>
              </el-form-item> -->
            </div>

            <el-form-item class="search-form-sub">
              <el-button type="primary" label="default" v-db-click @click="userSearchs">搜索</el-button>
              <el-button class="ResetSearch" v-db-click @click="reset('userFrom')">重置</el-button>
              <a class="ivu-ml-8 font12 ml10" v-db-click @click="collapse = !collapse">
                <template v-if="!collapse"> 展开 <i class="el-icon-arrow-down" /> </template>
                <template v-else> 收起 <i class="el-icon-arrow-up" /> </template>
              </a>
            </el-form-item>
          </div>
        </el-form>
      </div>
    </el-card>
    <el-card :bordered="false" shadow="never" class="ivu-mt mt16" :body-style="{ padding: '0 20px 20px' }">
      <el-tabs v-model="userFrom.user_type" @tab-click="onClickTab">
        <el-tab-pane :label="item.name" :name="item.type" v-for="(item, index) in headeNum" :key="index" />
      </el-tabs>
      <el-row :gutter="24" justify="space-between">
        <el-col :span="24">
          <el-button v-auth="['admin-user-save']" type="primary" v-db-click @click="edit({ uid: 0 })"
            >添加用户</el-button
          >
          <el-button v-auth="['admin-user-coupon']" v-db-click @click="onSend">发送优惠券</el-button>
          <el-button
            v-auth="['admin-wechat-news']"
            class="greens mr10"
            v-db-click
            @click="onSendPic"
            v-if="userFrom.user_type === 'wechat'"
          >
            发送图文消息
          </el-button>
          <el-button v-auth="['admin-user-group_set']" v-db-click @click="setGroup">批量设置分组</el-button>
          <el-button v-auth="['admin-user-set_label']" v-db-click @click="setLabel">批量设置标签</el-button>
          <el-button class="mr10" v-db-click @click="exportList">导出</el-button>

          <!-- <el-button v-auth="['admin-user-synchro']" class="mr20" v-db-click @click="synchro">同步公众号用户</el-button> -->
        </el-col>
        <el-col :span="24" class="userAlert" v-if="selectionList.length">
          <el-alert show-icon>
            <template slot="title">
              已选择<i class="userI"> {{ selectionList.length }} </i>项
            </template>
          </el-alert>
        </el-col>
      </el-row>
      <el-table
        :data="userLists"
        class="mt16"
        ref="table"
        highlight-current-row
        v-loading="loading"
        empty-text="暂无数据"
        no-filtered-userFrom-text="暂无筛选结果"
        @sort-change="sortChanged"
        @select="handleSelectRow"
        @select-all="handleSelectAll"
      >
        <el-table-column type="expand">
          <template slot-scope="scope">
            <expandRow :row="scope.row"></expandRow>
          </template>
        </el-table-column>
        <el-table-column type="selection" :selectable="isSel" width="55"> </el-table-column>
        <el-table-column label="用户ID" min-width="80">
          <template slot-scope="scope">
            <span>{{ scope.row.uid }}</span>
          </template>
        </el-table-column>
        <el-table-column label="头像" min-width="60">
          <template slot-scope="scope">
            <div class="tabBox_img" v-viewer>
              <img v-lazy="scope.row.avatar" />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="姓名" min-width="150">
          <template slot-scope="scope">
            <div class="acea-row">
              <i class="el-icon-male" v-show="scope.row.sex === '男'" style="color: #2db7f5; font-size: 15px"></i>
              <i class="el-icon-female" v-show="scope.row.sex === '女'" style="color: #ed4014; font-size: 15px"></i>
              <div v-text="scope.row.nickname" class=""></div>
            </div>
            <div v-if="scope.row.is_del == 1" style="color: red">用户已注销</div>
          </template>
        </el-table-column>
        <el-table-column label="分组" min-width="100">
          <template slot-scope="scope">
            <div>{{ scope.row.group_id }}</div>
          </template>
        </el-table-column>
        <el-table-column label="手机号" min-width="100">
          <template slot-scope="scope">
            <div>{{ scope.row.phone }}</div>
          </template>
        </el-table-column>
        <el-table-column label="用户类型" min-width="100">
          <template slot-scope="scope">
            <div>{{ scope.row.user_type }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="120">
          <template slot-scope="scope">
            <template v-if="scope.row.is_del != 1">
              <a v-db-click @click="userDetail(scope.row)">详情</a>

              <el-divider direction="vertical"></el-divider>
              <el-dropdown size="small" @command="changeMenu(scope.row, $event, scope.$index)" :transfer="true">
                <span class="el-dropdown-link">更多<i class="el-icon-arrow-down el-icon--right"></i> </span>
                <el-dropdown-menu slot="dropdown">
                  <!-- <el-dropdown-item command="1">编辑</el-dropdown-item> -->
                  <el-dropdown-item command="5">设置分组</el-dropdown-item>
                  <el-dropdown-item command="6">设置标签</el-dropdown-item>
                </el-dropdown-menu>
              </el-dropdown>
            </template>
            <template v-else>
              <a v-db-click @click="userDetail(scope.row)">详情</a>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <div class="acea-row row-right page">
        <pagination
          v-if="total"
          :total="total"
          :page.sync="userFrom.page"
          :limit.sync="userFrom.limit"
          @pagination="pageChange"
        />
      </div>
    </el-card>
    <!-- 发送优惠券-->
    <send-from ref="sends" :userIds="ids.toString()"></send-from>
    <!-- 会员详情-->
    <user-details ref="userDetails"></user-details>
    <!--发送图文消息 -->
    <el-dialog :visible.sync="modal13" title="发送消息" width="1200px" class="modelBox">
      <news-category
        v-if="modal13"
        :isShowSend="isShowSend"
        :userIds="ids.toString()"
        :scrollerHeight="scrollerHeight"
        :contentTop="contentTop"
        :contentWidth="contentWidth"
        :maxCols="maxCols"
      ></news-category>
    </el-dialog>
    <el-dialog :visible.sync="labelShow" append-to-body title="请选择用户标签" width="540px" :show-close="true">
      <userLabel
        v-if="labelShow"
        :uid="labelActive.uid"
        :only_get="!labelActive.uid"
        :is_batch="is_batch"
        @close="labelClose"
        @activeData="activeData"
        @onceGetList="onceGetList"
      ></userLabel>
    </el-dialog>
    <el-drawer
      custom-class="demo-drawer"
      :visible.sync="modals"
      :wrapperClosable="false"
      size="720"
      title="用户信息填写"
    >
      <div class="demo-drawer__content">
        <userEdit ref="userEdit" v-if="modals" :userData="userData"></userEdit>
        <div class="fix_footer acea-row row-center">
          <el-button v-db-click @click="modals = false">取消</el-button>
          <el-button type="primary" v-db-click @click="setUser">提交</el-button>
        </div>
      </div>
    </el-drawer>
    <!-- 用户标签 -->
    <el-dialog
      :visible.sync="selectLabelShow"
      append-to-body
      title="请选择用户标签"
      width="540px"
      :show-close="true"
      :close-on-click-modal="false"
    >
      <userLabel
        v-if="selectLabelShow"
        :uid="0"
        ref="userLabel"
        :only_get="true"
        :selectDataLabel="selectDataLabel"
        @activeData="activeSelectData"
        @close="labelClose"
      ></userLabel>
    </el-dialog>
  </div>
</template>

<script>
import userLabel from '@/components/userLabel';
import { mapState } from 'vuex';
import expandRow from './tableExpand.vue';
import userEdit from './handle/userEdit.vue';
import {
  userList,
  isShowApi,
  userSetGroup,
  userGroupApi,
  getUserInfo,
  setUser,
  editUser,
  saveSetLabel,
} from '@/api/user';
import { exportUserList } from '@/api/export';
import sendFrom from '@/components/sendCoupons/index';
import userDetails from './handle/userDetails';
import newsCategory from '@/components/newsCategory/index';

export default {
  name: 'user_list',
  components: {
    expandRow,
    sendFrom,
    userDetails,
    newsCategory,
    userLabel,
    userEdit,
  },
  data() {
    return {
      dataLabel: [],
      selectDataLabel: [],
      userData: {},
      modals: false,
      selectLabelShow: false,
      labelShow: false,
      is_batch: false,
      labelActive: {
        uid: 0,
      },
      pickerOptions: this.$timeOptions,
      collapse: false,
      headeNum: [
        { type: '', name: '全部' },
        { type: 'wechat', name: '微信公众号' },
        { type: 'routine', name: '微信小程序' },
        { type: 'h5', name: 'H5' },
        { type: 'pc', name: 'PC' },
      ],
      address: [],
      isShowSend: true,
      modal13: false,
      maxCols: 4,
      scrollerHeight: '600',
      contentTop: '130',
      contentWidth: '98%',
      grid: {
        xl: 6,
        lg: 6,
        md: 8,
        sm: 12,
        xs: 24,
      },
      grid2: {
        xl: 8,
        lg: 8,
        md: 8,
        sm: 12,
        xs: 24,
      },
      loading: false,
      listRequestId: 0,
      total: 0,
      userFrom: {
        label_id: '',
        user_type: '',
        status: '',
        sex: '',
        country: '',
        pay_count_num: ['', ''],
        pay_count_money: ['', ''],
        user_time_type: '',
        user_time: '',
        before_pay_time: '',
        nickname: '',
        province: '',
        city: '',
        page: 1,
        limit: 15,
        group_id: '',
        field_key: '',
      },
      before_pay_time: '',
      field_key: '',
      group_id: '',
      label_id: '',
      user_time_type: '',
      pay_count: '',
      userLists: [],
      selectionList: [],
      user_ids: '',
      selectedData: [],
      timeVal: [],
      groupList: [],
      selectedIds: [], //选中合并项的id
      ids: [],
    };
  },
  computed: {
    ...mapState('media', ['isMobile']),
  },
  created() {
    this.getList();
  },
  mounted() {
    this.userGroup();
  },
  methods: {
    showUserError(error, fallback = '请求失败，请稍后重试') {
      if (!error || !error._messageShown) this.$message.error((error && error.msg) || fallback);
    },
    setUser() {
      let data = this.$refs.userEdit.formItem;
      let ids = [];
      this.$refs.userEdit.dataLabel.map((i) => {
        ids.push(i.id);
      });
      data.label_id = ids;
      // if (!data.real_name) return this.$message.warning("请输入真实姓名");
      // if (!data.phone) return this.$message.warning("请输入手机号");
      // if (!data.pwd) return this.$message.warning("请输入密码");
      // if (!data.true_pwd) return this.$message.warning("请输入确认密码");
      if (data.uid) {
        editUser(data)
          .then((res) => {
            this.modals = false;
            this.$message.success(res.msg);
            this.getList();
          })
          .catch((err) => {
            this.showUserError(err);
          });
      } else {
        setUser(data)
          .then((res) => {
            this.modals = false;
            this.$message.success(res.msg);
            this.getList();
          })
          .catch((err) => {
            this.showUserError(err);
          });
      }
    },
    onceGetList() {
      this.labelActive.uid = 0;
      this.getList();
    },
    // 标签弹窗关闭
    labelClose() {
      this.labelActive.uid = 0;
      this.labelShow = false;
      this.selectLabelShow = false;
    },
    // 提交

    isSel(row) {
      return !!!row.is_del;
    },
    onClickTab() {
      this.userFrom.page = 1;
      this.getList();
    },
    userGroup() {
      let data = {
        page: 1,
        limit: '',
      };
      userGroupApi(data).then((res) => {
        this.groupList = res.data.list;
      });
    },
    // 批量设置分组；
    setGroup() {
      if (this.ids.length === 0) {
        this.$message.warning('请选择要设置分组的用户');
      } else {
        let uids = { uids: this.ids };
        this.$modalForm(userSetGroup(uids)).then(() => {
          this.ids = [];
          this.selectedIds = [];
          this.getList();
        });
      }
    },
    // 批量设置标签；
    setLabel() {
      if (this.ids.length === 0) {
        this.$message.warning('请选择要设置标签的用户');
      } else {
        this.is_batch = true;
        this.labelActive.uid = 0;
        this.labelShow = true;
      }
    },
    activeSelectData(data) {
      this.selectLabelShow = false;
      this.selectDataLabel = data || [];
      if (this.selectDataLabel.length) {
        let activeIds = [];
        this.selectDataLabel.map((item) => {
          activeIds.push(item.id);
        });
        this.userFrom.label_id = activeIds.join(',');
        this.getList();
      } else {
        this.userFrom.label_id = '';
      }
    },
    handleClose(tag) {
      let i = this.selectDataLabel.findIndex((item) => item.id === tag.id);
      if (i !== -1) {
        this.selectDataLabel.splice(i, 1);
      }
      this.$nextTick(() => {
        if (this.selectDataLabel.length) {
          let activeIds = [];
          this.selectDataLabel.map((item) => {
            activeIds.push(item.id);
          });
          this.userFrom.label_id = activeIds.join(',');
        } else {
          this.userFrom.label_id = '';
        }
      });
      // this.userSearchs();
    },
    // 批量设置标签
    activeData(data, type) {
      let labels = [];
      if (!data.length) return;
      data.map((i) => {
        labels.push(i.id);
      });
      saveSetLabel({
        uids: this.ids.join(','),
        label_id: labels,
        label_type: type,
      }).then((res) => {
        this.labelShow = false;
        this.selectedIds = new Set();
        this.getList();
        this.$message.success(res.msg);
      });
    },
    // 选择国家
    changeCountry() {
      if (this.userFrom.country === 'abroad' || !this.userFrom.country) {
        this.selectedData = [];
        this.userFrom.province = '';
        this.userFrom.city = '';
        this.address = [];
      }
    },
    // 选择地址
    handleChange(selectedData) {
      this.selectedData = selectedData.map((o) => o.label);
      this.userFrom.province = this.selectedData[0];
      this.userFrom.city = this.selectedData[1];
    },
    // 具体日期
    onchangeTime(e, type) {
      this.userFrom[type] = e ? e.join('-') : '';
    },
    userDetail(row) {
      this.$refs.userDetails.modals = true;
      this.$refs.userDetails.getDetails(row.uid);
    },
    // 操作
    changeMenu(row, name) {
      let uid = [];
      uid.push(row.uid);
      let uids = { uids: uid };
      switch (name) {
        case '5':
          this.$modalForm(userSetGroup(uids)).then(() => this.getList());
          break;
        case '6':
          this.openLabel(row);
          break;
      }
    },
    openLabel(row) {
      this.is_batch = false;
      this.labelShow = true;
      this.labelActive.uid = row.uid;
    },
    openSelectLabel() {
      this.selectLabelShow = true;
    },
    // 会员列表
    getList() {
      // if (this.selectDataLabel.length) {
      //   let activeIds = [];
      //   this.selectDataLabel.forEach((item) => {
      //     activeIds.push(item.id);
      //   });
      //   this.userFrom.label_id = activeIds.join(',');
      // }
      this.userFrom.user_type = this.userFrom.user_type || '';
      this.userFrom.status = this.userFrom.status || '';
      this.userFrom.sex = this.userFrom.sex || '';
      this.userFrom.country = this.userFrom.country || '';
      this.userFrom.pay_count = this.pay_count === 'all' ? '' : this.pay_count;
      this.userFrom.user_time_type = this.user_time_type === 'all' ? '' : this.user_time_type;
      this.userFrom.field_key = this.field_key === 'all' ? '' : this.field_key;
      this.userFrom.group_id = this.group_id === 'all' ? '' : this.group_id;
      const requestId = ++this.listRequestId;
      this.loading = true;
      userList(this.userFrom)
        .then(async (res) => {
          if (requestId !== this.listRequestId) return;
          let data = res.data;
          this.userLists = data.list;

          this.total = data.count;
          this.loading = false;
          this.$nextTick(() => {
            this.setChecked();
          });
        })
        .catch((res) => {
          if (requestId !== this.listRequestId) return;
          this.loading = false;
          this.userLists = [];
          this.total = 0;
          this.showUserError(res, '获取用户列表失败');
        });
    },
    // 用户导出
    async exportList() {
      if (this.ids.length) {
        this.userFrom.ids = this.ids;
      }
      this.userFrom.user_type = this.userFrom.user_type || '';
      this.userFrom.status = this.userFrom.status || '';
      this.userFrom.sex = this.userFrom.sex || '';
      this.userFrom.country = this.userFrom.country || '';
      this.userFrom.pay_count = this.pay_count === 'all' ? '' : this.pay_count;
      this.userFrom.user_time_type = this.user_time_type === 'all' ? '' : this.user_time_type;
      this.userFrom.field_key = this.field_key === 'all' ? '' : this.field_key;
      this.userFrom.group_id = this.group_id === 'all' ? '' : this.group_id;
      let [th, filekey, data, fileName] = [[], [], [], ''];
      //   let fileName = "";
      let excelData = JSON.parse(JSON.stringify(this.userFrom));
      excelData.page = 1;
      for (let i = 0; i < excelData.page + 1; i++) {
        let lebData = await this.getExcelData(excelData);
        if (!fileName) fileName = lebData.filename;
        if (!filekey.length) {
          filekey = lebData.fileKey;
        }
        if (!th.length) th = lebData.header;
        if (lebData.export.length) {
          data = data.concat(lebData.export);
          excelData.page++;
        } else {
          this.$exportExcel(th, filekey, fileName, data);
          return;
        }
      }
    },
    getExcelData(excelData) {
      return new Promise((resolve, reject) => {
        exportUserList(excelData).then((res) => {
          resolve(res.data);
        });
      });
    },
    pageChange() {
      this.selectionList = [];
      this.getList();
    },

    // 搜索
    userSearchs() {
      // 清除已选用户
      this.ids = [];
      this.selectedIds = [];
      this.selectionList = [];
      this.userFrom.page = 1;
      this.getList();
    },
    // 重置
    reset(name) {
      this.userFrom = {
        label_id: '',
        status: '',
        sex: '',
        country: '',
        pay_count_num: ['', ''],
        pay_count_money: ['', ''],
        user_time_type: '',
        user_time: '',
        before_pay_time: '',
        nickname: '',
        province: '',
        city: '',
        page: 1,
        limit: 15,
        group_id: '',
        field_key: '',
        page: 1, // 当前页
        limit: 20, // 每页显示条数
      };
      this.field_key = '';
      this.group_id = '';
      this.dataLabel = [];
      this.selectDataLabel = [];
      this.user_time_type = '';
      this.pay_count = '';
      this.timeVal = [];
      this.selectedIds = new Set();
      this.getList();
    },
    // 获取编辑表单数据
    getUserFrom(id) {
      getUserInfo(id)
        .then(async (res) => {
          this.modals = true;
          this.userData = res.data;
        })
        .catch((res) => {
          this.showUserError(res);
        });
    },
    // 修改状态
    onchangeIsShow(row) {
      let data = {
        id: row.uid,
        status: row.status,
      };
      isShowApi(data)
        .then(async (res) => {
          this.$message.success(res.msg);
        })
        .catch((res) => {
          this.showUserError(res);
        });
    },
    // 点击发送优惠券
    onSend() {
      if (this.ids.length === 0) {
        this.$message.warning('请选择要发送优惠券的用户');
      } else {
        this.$refs.sends.modals = true;
        this.$refs.sends.getList();
      }
    },
    // 发送图文消息
    onSendPic() {
      if (this.ids.length === 0) {
        this.$message.warning('请选择要发送图文消息的用户');
      } else {
        this.modal13 = true;
      }
    },
    // 编辑
    edit(row) {
      this.getUserFrom(row.uid);
    },
    // 修改成功
    submitFail() {
      // this.getList();
    },
    // 排序
    sortChanged(e, props, order) {
      this.userFrom[e.prop] = e.order;
      this.getList();
    },
    //全选和取消全选时触发
    handleSelectAll(selection) {
      let ids = [];
      selection.map((e) => {
        ids.push(e.uid);
      });
      this.selectedIds = ids;
      this.$nextTick(() => {
        //确保dom加载完毕
        this.setChecked();
      });
    },
    //  选中某一行
    handleSelectRow(selection, row) {
      let ids = [];
      selection.map((e) => {
        ids.push(e.uid);
      });
      this.selectedIds = ids;
      this.$nextTick(() => {
        //确保dom加载完毕
        this.setChecked();
      });
    },
    setChecked() {
      //将new Set()转化为数组
      this.ids = [...this.selectedIds];
      // 找到绑定的table的ref对应的dom，找到table的objData对象，objData保存的是当前页的数据
      let objData = this.$refs.table?.objData;
      if (!objData) return;
      for (let index in objData) {
        if (this.selectedIds.has(objData[index].uid)) {
          objData[index]._isChecked = true;
        }
      }
    },
  },
};
</script>

<style scoped lang="scss">
::v-deep .el-tabs__item {
  height: 54px !important;
  line-height: 54px !important;
}

.picBox {
  display: inline-block;
  cursor: pointer;

  .upLoad {
    width: 58px;
    height: 58px;
    line-height: 58px;
    border: 1px dotted rgba(0, 0, 0, 0.1);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.02);
    font-size: 24px;
    font-weight: 500;
  }

  .pictrue {
    width: 60px;
    height: 60px;
    border: 1px dotted rgba(0, 0, 0, 0.1);
    margin-right: 10px;

    img {
      width: 100%;
      height: 100%;
    }
  }
}
.fix_footer {
  position: fixed;
  bottom: 0;
  width: -webkit-fill-available;
  background: #fff;
  padding: 20px 0px;
  box-sizing: border-box;
  z-index: 100;
}
.userFrom {
  ::v-deep .ivu-form-item-content {
    margin-left: 0px !important;
  }
}

.userAlert {
  margin-top: 20px;
}

.userI {
  color: var(--prev-color-primary);
  font-style: normal;
}

img {
  height: 36px;
  display: block;
}

.tabBox_img {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  cursor: pointer;

  img {
    width: 100%;
    height: 100%;
  }
}

.tabBox_tit {
  width: 60%;
  font-size: 12px !important;
  margin: 0 2px 0 10px;
  letter-spacing: 1px;
  padding: 5px 0;
  box-sizing: border-box;
}

.modelBox {
  ::v-deep .ivu-modal-body {
    padding: 0 16px 16px 16px !important;
  }
}

.vipName {
  color: #dab176;
}

.listbox {
  ::v-deep .ivu-divider-horizontal {
    margin: 0 !important;
  }
}

.labelInput {
  width: 250px;
  border: 1px solid #dcdee2;
  padding: 0 15px;
  border-radius: 5px;
  min-height: 30px;
  cursor: pointer;
  font-size: 12px;

  .span {
    color: #c5c8ce;
  }

  .ivu-icon-ios-arrow-down {
    font-size: 14px;
    color: #808695;
  }
}

.demo-drawer-footer {
  width: 100%;
  position: absolute;
  bottom: 0;
  left: 0;
  border-top: 1px solid #e8e8e8;
  padding: 10px 16px;
  text-align: right;
  background: #fff;
}

.search-form {
  display: flex;
  justify-content: space-between;

  .search-form-box {
    display: flex;
    flex-wrap: wrap;
    flex: 1;
  }
}

.search-form-sub {
  display: flex;
}
</style>
