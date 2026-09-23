-- legacy-mini.sql — a synthetic CRMEB 4.x database, for the ETL integration test.
--
-- EVERY ROW IN THIS FILE IS INVENTED. No production dump, no real shop's
-- configuration, no real customer and no real credential has ever been near it,
-- and none may ever be added: this file is committed, it is read in CI logs, and
-- a fixture is the easiest place in a repository to leak a merchant key without
-- anyone noticing. Names are 示例/测试; keys are obviously fake.
--
-- The DDL is the real CRMEB schema, copied from the installer script in
-- `crmeb/` (structure only). That matters: a fixture with a hand-simplified
-- schema would not reproduce the encodings the ETL exists to handle —
-- `int(10) UNSIGNED` unix seconds where 0 means NULL, `decimal(8,2)` arriving
-- as a string, tinyint enums, and `eb_system_config.value` holding
-- JSON-encoded text rather than the bare value.
--
-- What the data is chosen to exercise, beyond "it loads":
--
--  * a deleted admin (is_del = 1) that must NOT arrive, and two that must;
--  * `add_time = 0`, which is CRMEB's NULL and must not become 1970-01-01;
--  * a soft-deleted product that MUST arrive anyway — order items point at it,
--    so dropping it would dangle a foreign key after the order streams land;
--  * a 会员券 (receive_type = 4) and a deleted coupon, both dropped by rule;
--  * coupons and favourites belonging to users, which the `user` group has not
--    landed yet — so they are dropped with a count rather than silently;
--  * config values that are JSON-encoded (`"2"`, not `2`), including
--    `order_cancel_time`, whose hours→minutes conversion is wrong if the
--    decoding is skipped;
--  * a config key on the explicit dropped list, which must be reported as
--    dropped and not as unmapped;
--  * attachment rows whose files the test writes to a temporary uploads tree,
--    so the sha256 that `run` computes can be compared against known bytes;
--  * for every group after R7 (shipping, cms, wechat-oa, notification,
--    groupbuy, presale): a few ordinary rows, and at least one row the mapper
--    must drop and count — a city the dictionary lacks, an orphaned article
--    body, a QR code with no ticket, a message to a user who does not exist,
--    a one-person team, a presale for a product that does not exist. The
--    integration test asserts the per-group counts over `run --require-complete`.

--
-- 会员相关的表（E1 的 user mapper）。注意 `eb_user_label_cate` 在官方安装脚本里
-- 根本没有 CREATE TABLE，尽管 eb_user_label.label_cate 引用它——所以这份 fixture
-- 也不建它，正好用来验证 sources 里 optional: true 那条路径：mapper 会按标签实际
-- 用到的 id 把分类补出来，并且把补了几个记在报告里。

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `eb_user` (
  `uid` int(10) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户id',
  `account` varchar(32) NOT NULL DEFAULT '' COMMENT '用户账号',
  `pwd` varchar(255) NOT NULL DEFAULT '' COMMENT '用户密码（bcrypt；历史值为无盐 MD5，登录成功时就地升级）',
  `real_name` varchar(25) NOT NULL DEFAULT '' COMMENT '真实姓名',
  `birthday` int(11) NOT NULL DEFAULT '0' COMMENT '生日',
  `card_id` varchar(20) NOT NULL DEFAULT '' COMMENT '身份证号码',
  `mark` varchar(255) NOT NULL DEFAULT '' COMMENT '用户备注',
  `partner_id` int(11) NOT NULL DEFAULT '0' COMMENT '合伙人id',
  `group_id` int(11) NOT NULL DEFAULT '0' COMMENT '用户分组id',
  `nickname` varchar(60) NOT NULL DEFAULT '' COMMENT '用户昵称',
  `avatar` varchar(256) NOT NULL DEFAULT '' COMMENT '用户头像',
  `phone` char(15) NOT NULL DEFAULT '' COMMENT '手机号码',
  `add_time` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '添加时间',
  `add_ip` varchar(16) NOT NULL DEFAULT '' COMMENT '添加ip',
  `last_time` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '最后一次登录时间',
  `last_ip` varchar(16) NOT NULL DEFAULT '' COMMENT '最后一次登录ip',
  `now_money` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '用户余额',
  `brokerage_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '佣金金额',
  `integral` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '用户剩余积分',
  `exp` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '会员经验',
  `sign_num` int(11) NOT NULL DEFAULT '0' COMMENT '连续签到天数',
  `sign_remind` tinyint(1) NOT NULL DEFAULT '0' COMMENT '签到提醒状态',
  `status` tinyint(1) NOT NULL DEFAULT '1' COMMENT '1为正常，0为禁止',
  `level` tinyint(2) UNSIGNED NOT NULL DEFAULT '0' COMMENT '等级',
  `agent_level` int(10) NOT NULL DEFAULT '0' COMMENT '分销等级',
  `spread_open` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否有推广资格',
  `spread_uid` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '推广元id',
  `spread_time` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '推广员关联时间',
  `user_type` varchar(32) NOT NULL DEFAULT '' COMMENT '用户类型',
  `is_promoter` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否为推广员',
  `pay_count` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '用户购买次数',
  `spread_count` int(11) NOT NULL DEFAULT '0' COMMENT '下级人数',
  `clean_time` int(11) NOT NULL DEFAULT '0' COMMENT '清理会员时间',
  `addres` varchar(255) NOT NULL DEFAULT '' COMMENT '详细地址',
  `adminid` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '管理员编号 ',
  `login_type` varchar(36) NOT NULL DEFAULT '' COMMENT '用户登陆类型，h5,wechat,routine',
  `record_phone` varchar(11) NOT NULL DEFAULT '0' COMMENT '记录临时电话',
  `is_money_level` tinyint(1) NOT NULL DEFAULT '0' COMMENT '会员来源  0: 购买商品升级   1：花钱购买的会员2: 会员卡领取',
  `is_ever_level` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否永久性会员  0: 非永久会员  1：永久会员',
  `overdue_time` bigint(20) NOT NULL DEFAULT '0' COMMENT '会员到期时间',
  `uniqid` varchar(32) NOT NULL DEFAULT '' COMMENT '用户唯一值',
  `division_name` varchar(255) NOT NULL DEFAULT '' COMMENT '事业部/代理商名称',
  `division_type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '代理类型：0普通，1事业部，2代理，3员工',
  `division_status` tinyint(1) NOT NULL DEFAULT '0' COMMENT '代理状态',
  `is_division` tinyint(1) NOT NULL DEFAULT '0' COMMENT '事业部状态',
  `is_agent` tinyint(1) NOT NULL DEFAULT '0' COMMENT '代理状态',
  `is_staff` tinyint(1) NOT NULL DEFAULT '0' COMMENT '员工状态',
  `division_id` int(11) NOT NULL DEFAULT '0' COMMENT '事业部id',
  `agent_id` int(11) NOT NULL DEFAULT '0' COMMENT '代理商id',
  `staff_id` int(11) NOT NULL DEFAULT '0' COMMENT '员工id',
  `division_percent` int(11) NOT NULL DEFAULT '0' COMMENT '分佣比例',
  `division_change_time` int(11) NOT NULL DEFAULT '0' COMMENT '事业部/代理/员工修改时间',
  `division_end_time` int(11) NOT NULL DEFAULT '0' COMMENT '事业部/代理/员工结束时间',
  `division_invite` int(11) NOT NULL DEFAULT '0' COMMENT '代理商邀请码',
  `is_del` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否注销',
  PRIMARY KEY (`uid`) USING BTREE,
  KEY `account` (`account`) USING BTREE,
  KEY `spreaduid` (`spread_uid`) USING BTREE,
  KEY `level` (`level`) USING BTREE,
  KEY `status` (`status`) USING BTREE,
  KEY `is_promoter` (`is_promoter`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

CREATE TABLE IF NOT EXISTS `eb_user_address` (
  `id` mediumint(8) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户地址id',
  `uid` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '用户id',
  `real_name` varchar(32) NOT NULL DEFAULT '' COMMENT '收货人姓名',
  `phone` varchar(16) NOT NULL DEFAULT '' COMMENT '收货人电话',
  `province` varchar(64) NOT NULL DEFAULT '' COMMENT '收货人所在省',
  `city` varchar(64) NOT NULL DEFAULT '' COMMENT '收货人所在市',
  `city_id` int(11) NOT NULL DEFAULT '0' COMMENT '城市id',
  `district` varchar(64) NOT NULL DEFAULT '' COMMENT '收货人所在区',
  `detail` varchar(256) NOT NULL DEFAULT '' COMMENT '收货人详细地址',
  `post_code` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '邮编',
  `longitude` varchar(16) NOT NULL DEFAULT '0' COMMENT '经度',
  `latitude` varchar(16) NOT NULL DEFAULT '0' COMMENT '纬度',
  `is_default` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否默认',
  `is_del` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否删除',
  `add_time` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '添加时间',
  PRIMARY KEY (`id`) USING BTREE,
  KEY `uid` (`uid`) USING BTREE,
  KEY `is_default` (`is_default`) USING BTREE,
  KEY `is_del` (`is_del`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户地址表';

CREATE TABLE IF NOT EXISTS `eb_user_group` (
  `id` smallint(5) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `group_name` varchar(64) NOT NULL DEFAULT '' COMMENT '用户分组名称',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COMMENT='用户分组表';

CREATE TABLE IF NOT EXISTS `eb_user_label` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `label_cate` int(10) NOT NULL DEFAULT '0' COMMENT '标签分类',
  `label_name` varchar(255) NOT NULL DEFAULT '' COMMENT '标签名称',
  PRIMARY KEY (`id`),
  KEY `label_cate` (`label_cate`)
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COMMENT='用户标签表';

CREATE TABLE IF NOT EXISTS `eb_user_label_relation` (
  `uid` int(11) NOT NULL DEFAULT '0' COMMENT '用户ID',
  `label_id` int(11) NOT NULL DEFAULT '0' COMMENT '标签ID'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户标签关联表';

CREATE TABLE IF NOT EXISTS `eb_user_cancel` (
  `id` int(10) NOT NULL AUTO_INCREMENT COMMENT '主键id',
  `uid` int(10) NOT NULL DEFAULT '0' COMMENT '用户uid',
  `name` varchar(255) NOT NULL DEFAULT '' COMMENT '用户昵称',
  `phone` varchar(20) NOT NULL DEFAULT '' COMMENT '手机号',
  `add_time` int(11) NOT NULL DEFAULT '0' COMMENT '用户提交申请时间',
  `status` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1通过，2拒绝',
  `up_time` int(11) NOT NULL DEFAULT '0' COMMENT '操作时间',
  `remark` varchar(255) NOT NULL DEFAULT '' COMMENT '备注',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户注销表';

CREATE TABLE IF NOT EXISTS `eb_wechat_user` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `uid` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '微信用户id',
  `unionid` varchar(30) NOT NULL DEFAULT '' COMMENT '只有在用户将公众号绑定到微信开放平台帐号后，才会出现该字段',
  `openid` varchar(255) NOT NULL DEFAULT '' COMMENT '用户的标识，对当前公众号唯一',
  `nickname` varchar(64) NOT NULL DEFAULT '' COMMENT '用户的昵称',
  `headimgurl` varchar(256) NOT NULL DEFAULT '' COMMENT '用户头像',
  `sex` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '用户的性别，值为1时是男性，值为2时是女性，值为0时是未知',
  `city` varchar(64) NOT NULL DEFAULT '' COMMENT '用户所在城市',
  `language` varchar(64) NOT NULL DEFAULT '' COMMENT '用户的语言，简体中文为zh_CN',
  `province` varchar(64) NOT NULL DEFAULT '' COMMENT '用户所在省份',
  `country` varchar(64) NOT NULL DEFAULT '' COMMENT '用户所在国家',
  `remark` varchar(256) NOT NULL DEFAULT '' COMMENT '公众号运营者对粉丝的备注，公众号运营者可在微信公众平台用户管理界面对粉丝添加备注',
  `groupid` smallint(5) UNSIGNED NOT NULL DEFAULT '0' COMMENT '用户所在的分组ID（兼容旧的用户分组接口）',
  `tagid_list` varchar(256) NOT NULL DEFAULT '' COMMENT '用户被打上的标签ID列表',
  `subscribe` tinyint(3) UNSIGNED NOT NULL DEFAULT '1' COMMENT '用户是否订阅该公众号标识',
  `subscribe_time` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '关注公众号时间',
  `add_time` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '添加时间',
  `second` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '二级推荐人',
  `user_type` varchar(32) NOT NULL DEFAULT 'wechat' COMMENT '用户类型',
  `is_complete` tinyint(1) NOT NULL DEFAULT '0' COMMENT '信息是否完善',
  `is_del` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否注销',
  PRIMARY KEY (`id`),
  UNIQUE KEY `openid` (`openid`,`uid`) USING BTREE,
  KEY `groupid` (`groupid`) USING BTREE,
  KEY `subscribe_time` (`subscribe_time`) USING BTREE,
  KEY `add_time` (`add_time`) USING BTREE,
  KEY `subscribe` (`subscribe`) USING BTREE,
  KEY `unionid` (`unionid`) USING BTREE,
  KEY `uid` (`uid`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='微信用户表';

CREATE TABLE IF NOT EXISTS `eb_system_admin` (
  `id` smallint(5) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '后台管理员表ID',
  `account` varchar(32) NOT NULL DEFAULT '' COMMENT '后台管理员账号',
  `head_pic` varchar(255) NOT NULL DEFAULT '' COMMENT '管理员头像',
  `pwd` varchar(100) NOT NULL DEFAULT '' COMMENT '后台管理员密码',
  `real_name` varchar(16) NOT NULL DEFAULT '' COMMENT '后台管理员姓名',
  `roles` varchar(128) NOT NULL DEFAULT '' COMMENT '后台管理员权限(menus_id)',
  `last_ip` varchar(16) NOT NULL DEFAULT '' COMMENT '后台管理员最后一次登录ip',
  `last_time` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '后台管理员最后一次登录时间',
  `add_time` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '后台管理员添加时间',
  `login_count` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '登录次数',
  `level` tinyint(3) UNSIGNED NOT NULL DEFAULT '1' COMMENT '后台管理员级别',
  `status` tinyint(1) UNSIGNED NOT NULL DEFAULT '1' COMMENT '后台管理员状态 1有效0无效',
  `division_id` int(11) NOT NULL DEFAULT '0' COMMENT '事业部id',
  `is_del` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否删除',
  PRIMARY KEY (`id`) USING BTREE,
  KEY `account` (`account`) USING BTREE,
  KEY `status` (`status`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COMMENT='后台管理员表';

CREATE TABLE IF NOT EXISTS `eb_system_role` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '身份管理id',
  `role_name` varchar(32) NOT NULL DEFAULT '' COMMENT '身份管理名称',
  `rules` text COMMENT '身份管理权限(menus_id)',
  `level` tinyint(3) UNSIGNED NOT NULL DEFAULT '0' COMMENT '管理员等级',
  `status` tinyint(1) UNSIGNED NOT NULL DEFAULT '1' COMMENT '状态',
  PRIMARY KEY (`id`) USING BTREE,
  KEY `status` (`status`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='身份管理表';

CREATE TABLE IF NOT EXISTS `eb_system_config` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '配置id',
  `menu_name` varchar(255) NOT NULL DEFAULT '' COMMENT '字段名称',
  `type` varchar(255) NOT NULL DEFAULT '' COMMENT '类型(文本框,单选按钮...)',
  `input_type` varchar(20) NOT NULL DEFAULT 'input' COMMENT '表单类型',
  `config_tab_id` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '配置分类id',
  `parameter` varchar(255) NOT NULL DEFAULT '' COMMENT '规则 单选框和多选框',
  `upload_type` tinyint(1) UNSIGNED NOT NULL DEFAULT '1' COMMENT '上传文件格式1单图2多图3文件',
  `required` varchar(255) NOT NULL DEFAULT '' COMMENT '规则',
  `width` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '多行文本框的宽度',
  `high` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '多行文框的高度',
  `value` varchar(5000) NOT NULL DEFAULT '' COMMENT '默认值',
  `info` varchar(255) NOT NULL DEFAULT '' COMMENT '配置名称',
  `desc` varchar(255) NOT NULL DEFAULT '' COMMENT '配置简介',
  `sort` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '排序',
  `status` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否隐藏',
  `level` int(11) NOT NULL DEFAULT '0' COMMENT '配置层级0顶级1次级',
  `link_id` int(11) NOT NULL DEFAULT '0' COMMENT '关联上级配置id',
  `link_value` int(11) NOT NULL DEFAULT '0' COMMENT '关联上级配置的值',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=435 DEFAULT CHARSET=utf8mb4 COMMENT='配置表';

CREATE TABLE IF NOT EXISTS `eb_system_attachment_category` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `pid` int(11) NOT NULL DEFAULT '0' COMMENT '父级ID',
  `name` varchar(50) NOT NULL DEFAULT '' COMMENT '分类名称',
  `enname` varchar(50) NOT NULL DEFAULT '' COMMENT '分类目录',
  `type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '类型，0图片，1视频',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `id` (`id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COMMENT='附件分类表';

CREATE TABLE IF NOT EXISTS `eb_system_attachment` (
  `att_id` int(10) NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `name` varchar(100) NOT NULL DEFAULT '' COMMENT '附件名称',
  `att_dir` varchar(200) NOT NULL DEFAULT '' COMMENT '附件路径',
  `satt_dir` varchar(200) NOT NULL DEFAULT '' COMMENT '压缩图片路径',
  `att_size` char(30) NOT NULL DEFAULT '' COMMENT '附件大小',
  `att_type` char(30) NOT NULL DEFAULT '' COMMENT '附件类型',
  `pid` int(10) NOT NULL DEFAULT '0' COMMENT '分类ID0编辑器,1商品图片,2拼团图片,3砍价图片,4秒杀图片,5文章图片,6组合数据图',
  `time` int(11) NOT NULL DEFAULT '0' COMMENT '上传时间',
  `image_type` tinyint(1) UNSIGNED NOT NULL DEFAULT '1' COMMENT '图片上传类型 1本地 2七牛云 3OSS 4COS ',
  `module_type` tinyint(1) UNSIGNED NOT NULL DEFAULT '1' COMMENT '图片上传模块类型 1 后台上传 2 用户生成',
  `real_name` varchar(255) NOT NULL DEFAULT '' COMMENT '原始文件名',
  `scan_token` varchar(32) NOT NULL DEFAULT '' COMMENT '扫码上传的token',
  `type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '类型，0图片，1视频',
  PRIMARY KEY (`att_id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=92 DEFAULT CHARSET=utf8mb4 COMMENT='附件管理表';

CREATE TABLE IF NOT EXISTS `eb_store_category` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '商品分类表ID',
  `pid` int(11) NOT NULL DEFAULT '0' COMMENT '父id',
  `cate_name` varchar(100) NOT NULL DEFAULT '' COMMENT '分类名称',
  `sort` int(11) NOT NULL DEFAULT '0' COMMENT '排序',
  `pic` varchar(128) NOT NULL DEFAULT '' COMMENT '图标',
  `is_show` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否推荐',
  `add_time` int(11) NOT NULL DEFAULT '0' COMMENT '添加时间',
  `big_pic` varchar(255) NOT NULL DEFAULT '' COMMENT '分类大图',
  PRIMARY KEY (`id`) USING BTREE,
  KEY `pid` (`pid`) USING BTREE,
  KEY `is_base` (`is_show`) USING BTREE,
  KEY `sort` (`sort`) USING BTREE,
  KEY `add_time` (`add_time`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=utf8mb4 COMMENT='商品分类表';

CREATE TABLE IF NOT EXISTS `eb_store_product` (
  `id` mediumint(11) NOT NULL AUTO_INCREMENT COMMENT '商品id',
  `mer_id` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '商户Id(0为总后台管理员创建,不为0的时候是商户后台创建)',
  `image` varchar(256) NOT NULL DEFAULT '' COMMENT '商品图片',
  `recommend_image` varchar(256) NOT NULL DEFAULT '' COMMENT '推荐图',
  `slider_image` varchar(2000) NOT NULL DEFAULT '' COMMENT '轮播图',
  `store_name` varchar(128) NOT NULL DEFAULT '' COMMENT '商品名称',
  `store_info` varchar(256) NOT NULL DEFAULT '' COMMENT '商品简介',
  `keyword` varchar(256) NOT NULL DEFAULT '' COMMENT '关键字',
  `bar_code` varchar(15) NOT NULL DEFAULT '' COMMENT '商品条码（一维码）',
  `cate_id` varchar(64) NOT NULL DEFAULT '' COMMENT '分类id',
  `price` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '商品价格',
  `vip_price` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '会员价格',
  `ot_price` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '市场价',
  `postage` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '邮费',
  `unit_name` varchar(32) NOT NULL DEFAULT '' COMMENT '单位名',
  `sort` smallint(11) NOT NULL DEFAULT '0' COMMENT '排序',
  `sales` mediumint(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '销量',
  `stock` mediumint(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '库存',
  `is_show` tinyint(1) NOT NULL DEFAULT '1' COMMENT '状态（0：未上架，1：上架）',
  `is_hot` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否热卖',
  `is_benefit` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否优惠',
  `is_best` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否精品',
  `is_new` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否新品',
  `is_virtual` tinyint(1) NOT NULL DEFAULT '0' COMMENT '商品是否是虚拟商品',
  `virtual_type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '虚拟商品类型',
  `add_time` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '添加时间',
  `is_postage` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否包邮',
  `is_del` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否删除',
  `mer_use` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '商户是否代理 0不可代理1可代理',
  `give_integral` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '获得积分',
  `cost` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '成本价',
  `is_seckill` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '秒杀状态 0 未开启 1已开启',
  `is_bargain` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '砍价状态 0未开启 1开启',
  `is_good` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否优品推荐',
  `is_sub` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否单独分佣',
  `is_vip` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否开启会员价格',
  `ficti` mediumint(11) NOT NULL DEFAULT '0' COMMENT '虚拟销量',
  `browse` int(11) NOT NULL DEFAULT '0' COMMENT '浏览量',
  `code_path` varchar(64) NOT NULL DEFAULT '' COMMENT '商品二维码地址(用户小程序海报)',
  `soure_link` varchar(255) NOT NULL DEFAULT '' COMMENT '淘宝京东1688类型',
  `video_link` varchar(500) NOT NULL DEFAULT '' COMMENT '主图视频链接',
  `temp_id` int(11) NOT NULL DEFAULT '1' COMMENT '运费模板ID',
  `spec_type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '规格 0单 1多',
  `activity` varchar(255) NOT NULL DEFAULT '' COMMENT '活动显示排序1=秒杀，2=砍价，3=拼团',
  `spu` char(13) NOT NULL DEFAULT '' COMMENT '商品SPU',
  `label_id` varchar(64) NOT NULL DEFAULT '' COMMENT '标签ID',
  `command_word` varchar(255) NOT NULL DEFAULT '' COMMENT '复制口令',
  `recommend_list` varchar(255) NOT NULL DEFAULT '' COMMENT '推荐商品id',
  `vip_product` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否会员专属商品',
  `vip_product_type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '0仅付费会员可见,1仅付费会员可购买',
  `presale` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否预售商品',
  `presale_start_time` int(11) NOT NULL DEFAULT '0' COMMENT '预售开始时间',
  `presale_end_time` int(11) NOT NULL DEFAULT '0' COMMENT '预售结束时间',
  `presale_day` int(11) NOT NULL DEFAULT '0' COMMENT '预售结束后几天内发货',
  `logistics` varchar(10) NOT NULL DEFAULT '1,2' COMMENT '物流方式',
  `freight` tinyint(1) NOT NULL DEFAULT '2' COMMENT '运费设置',
  `custom_form` varchar(2000) NOT NULL DEFAULT '' COMMENT '自定义表单',
  `is_limit` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否开启限购',
  `limit_type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '限购类型1单次限购2永久限购',
  `limit_num` int(11) NOT NULL DEFAULT '0' COMMENT '限购数量',
  `min_qty` int(11) NOT NULL DEFAULT '1' COMMENT '起购数量',
  `default_sku` varchar(255) NOT NULL DEFAULT '' COMMENT '默认规格',
  `params_list` varchar(2000) NOT NULL DEFAULT '' COMMENT '商品参数',
  `label_list` varchar(255) NOT NULL DEFAULT '' COMMENT '商品标签',
  `protection_list` varchar(255) NOT NULL DEFAULT '' COMMENT '商品保障',
  `is_gift` int(1) NOT NULL DEFAULT '0' COMMENT '是否是礼品',
  `gift_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '礼品附加费',
  PRIMARY KEY (`id`) USING BTREE,
  KEY `cate_id` (`cate_id`) USING BTREE,
  KEY `is_hot` (`is_hot`) USING BTREE,
  KEY `is_benefit` (`is_benefit`) USING BTREE,
  KEY `is_best` (`is_best`) USING BTREE,
  KEY `is_new` (`is_new`) USING BTREE,
  KEY `toggle_on_sale, is_del` (`is_del`) USING BTREE,
  KEY `price` (`price`) USING BTREE,
  KEY `is_show` (`is_show`) USING BTREE,
  KEY `sort` (`sort`) USING BTREE,
  KEY `sales` (`sales`) USING BTREE,
  KEY `add_time` (`add_time`) USING BTREE,
  KEY `is_postage` (`is_postage`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COMMENT='商品表';

CREATE TABLE IF NOT EXISTS `eb_store_product_cate` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `product_id` int(11) NOT NULL DEFAULT '0' COMMENT '商品id',
  `cate_id` int(11) NOT NULL DEFAULT '0' COMMENT '分类id',
  `add_time` int(11) NOT NULL DEFAULT '0' COMMENT '添加时间',
  `cate_pid` int(11) NOT NULL DEFAULT '0' COMMENT '一级分类id',
  `status` tinyint(1) NOT NULL DEFAULT '0' COMMENT '商品状态',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=57 DEFAULT CHARSET=utf8mb4 COMMENT='商品分类辅助表';

CREATE TABLE IF NOT EXISTS `eb_store_product_attr` (
  `id` int(10) NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `product_id` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '商品ID',
  `attr_name` varchar(32) NOT NULL DEFAULT '' COMMENT '属性名',
  `attr_values` longtext COMMENT '属性值',
  `type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '活动类型 0=商品，1=秒杀，2=砍价，3=拼团',
  PRIMARY KEY (`id`),
  KEY `store_id` (`product_id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=65 DEFAULT CHARSET=utf8mb4 COMMENT='商品属性表';

CREATE TABLE IF NOT EXISTS `eb_store_product_attr_value` (
  `id` int(10) NOT NULL AUTO_INCREMENT COMMENT '主键id',
  `product_id` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '商品ID',
  `suk` varchar(128) NOT NULL DEFAULT '' COMMENT '商品属性索引值 (attr_value|attr_value[|....])',
  `stock` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '属性对应的库存',
  `sales` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '销量',
  `price` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '属性金额',
  `image` varchar(128) NOT NULL DEFAULT '' COMMENT '图片',
  `unique` char(8) NOT NULL DEFAULT '' COMMENT '唯一值',
  `cost` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '成本价',
  `bar_code` varchar(50) NOT NULL DEFAULT '' COMMENT '商品条码',
  `bar_code_number` varchar(50) NOT NULL DEFAULT '' COMMENT '条形码',
  `ot_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '原价',
  `vip_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '会员专享价',
  `weight` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '重量',
  `volume` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '体积',
  `brokerage` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '一级返佣',
  `brokerage_two` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '二级返佣',
  `type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '活动类型 0=商品，1=秒杀，2=砍价，3=拼团',
  `quota` int(11) NOT NULL DEFAULT '0' COMMENT '活动限购数量',
  `quota_show` int(11) NOT NULL DEFAULT '0' COMMENT '活动限购数量显示',
  `is_virtual` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否虚拟商品',
  `coupon_id` int(11) NOT NULL DEFAULT '0' COMMENT '优惠券id',
  `disk_info` text COMMENT '虚拟信息内容',
  `is_show` int(1) NOT NULL DEFAULT '1' COMMENT '是否显示',
  `is_default_select` int(1) NOT NULL DEFAULT '0' COMMENT '是否默认规格',
  PRIMARY KEY (`id`),
  KEY `unique` (`unique`,`suk`) USING BTREE,
  KEY `store_id` (`product_id`,`suk`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=104 DEFAULT CHARSET=utf8mb4 COMMENT='商品属性值表';

CREATE TABLE IF NOT EXISTS `eb_store_product_description` (
  `product_id` int(11) NOT NULL DEFAULT '0' COMMENT '商品ID',
  `description` longtext COMMENT '商品详情',
  `type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '商品类型',
  KEY `product_id` (`product_id`,`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品详情表';

CREATE TABLE IF NOT EXISTS `eb_store_product_virtual` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键id',
  `product_id` int(11) NOT NULL DEFAULT '0' COMMENT '商品id',
  `attr_unique` varchar(20) NOT NULL DEFAULT '' COMMENT '对应商品规格',
  `card_no` varchar(255) NOT NULL DEFAULT '' COMMENT '卡密卡号',
  `card_pwd` varchar(255) NOT NULL DEFAULT '' COMMENT '卡密密码',
  `card_unique` varchar(32) NOT NULL DEFAULT '' COMMENT '虚拟卡密唯一值',
  `order_id` varchar(255) NOT NULL DEFAULT '' COMMENT '购买订单id',
  `uid` int(11) NOT NULL DEFAULT '0' COMMENT '购买人id',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='虚拟商品卡密表';

CREATE TABLE IF NOT EXISTS `eb_store_product_label_cate` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) NOT NULL DEFAULT '' COMMENT '名称',
  `sort` int(11) NOT NULL DEFAULT '0' COMMENT '排序',
  `add_time` int(11) NOT NULL DEFAULT '0' COMMENT '添加时间',
  `is_del` int(11) NOT NULL DEFAULT '0' COMMENT '是否删除',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品标签分类';

CREATE TABLE IF NOT EXISTS `eb_store_product_label` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) NOT NULL DEFAULT '' COMMENT '标签名称',
  `cate_id` int(11) NOT NULL DEFAULT '0' COMMENT '分类id',
  `type` int(11) NOT NULL DEFAULT '0' COMMENT '效果设置0自定义1图片',
  `font_color` varchar(255) NOT NULL DEFAULT '' COMMENT '字体颜色',
  `bg_color` varchar(255) NOT NULL DEFAULT '' COMMENT '背景颜色',
  `border_color` varchar(255) NOT NULL DEFAULT '' COMMENT '边框颜色',
  `image` varchar(255) NOT NULL DEFAULT '' COMMENT '图片',
  `is_show` int(11) NOT NULL DEFAULT '1' COMMENT '移动端展示',
  `status` int(11) NOT NULL DEFAULT '1' COMMENT '是否开启',
  `sort` int(11) NOT NULL DEFAULT '0' COMMENT '排序',
  `add_time` int(11) NOT NULL DEFAULT '0' COMMENT '添加时间',
  `is_del` int(11) NOT NULL DEFAULT '0' COMMENT '是否删除',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品标签';

CREATE TABLE IF NOT EXISTS `eb_store_product_param` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) NOT NULL DEFAULT '' COMMENT '参数名称',
  `value` text COMMENT '参数内容',
  `sort` int(11) NOT NULL DEFAULT '0' COMMENT '排序',
  `add_time` int(11) NOT NULL DEFAULT '0' COMMENT '添加时间',
  `is_del` int(1) NOT NULL DEFAULT '0' COMMENT '是否删除',
  `status` int(11) NOT NULL DEFAULT '1' COMMENT '参数状态',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品参数表';

CREATE TABLE IF NOT EXISTS `eb_store_product_protection` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '编号',
  `title` varchar(255) NOT NULL DEFAULT '' COMMENT '标题',
  `content` varchar(2000) NOT NULL DEFAULT '' COMMENT '内容',
  `image` varchar(255) NOT NULL DEFAULT '' COMMENT '图标',
  `num` int(11) NOT NULL DEFAULT '0' COMMENT '使用数量',
  `status` int(1) NOT NULL DEFAULT '1' COMMENT '状态',
  `sort` int(11) NOT NULL DEFAULT '0' COMMENT '排序',
  `add_time` int(11) NOT NULL DEFAULT '0' COMMENT '添加时间',
  `is_del` int(1) NOT NULL DEFAULT '0' COMMENT '是否删除',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品保障表';

CREATE TABLE IF NOT EXISTS `eb_store_product_relation` (
  `uid` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '用户ID',
  `product_id` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '商品ID',
  `type` varchar(32) NOT NULL DEFAULT '' COMMENT '类型(收藏(collect）、点赞(like))',
  `category` varchar(32) NOT NULL DEFAULT '' COMMENT '某种类型的商品(普通商品、秒杀商品)',
  `add_time` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '添加时间',
  UNIQUE KEY `uid` (`uid`,`product_id`,`type`,`category`) USING BTREE,
  KEY `type` (`type`) USING BTREE,
  KEY `category` (`category`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品点赞和收藏表';

CREATE TABLE IF NOT EXISTS `eb_store_product_reply` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '评论ID',
  `uid` int(11) NOT NULL DEFAULT '0' COMMENT '用户ID',
  `oid` int(11) NOT NULL DEFAULT '0' COMMENT '订单ID',
  `unique` char(32) NOT NULL DEFAULT '' COMMENT '唯一id',
  `product_id` int(11) NOT NULL DEFAULT '0' COMMENT '商品id',
  `reply_type` varchar(32) NOT NULL DEFAULT 'product' COMMENT '某种商品类型(普通商品、秒杀商品）',
  `product_score` tinyint(1) NOT NULL DEFAULT '0' COMMENT '商品分数',
  `service_score` tinyint(1) NOT NULL DEFAULT '0' COMMENT '服务分数',
  `comment` varchar(512) NOT NULL DEFAULT '' COMMENT '评论内容',
  `pics` text COMMENT '评论图片',
  `add_time` int(11) NOT NULL DEFAULT '0' COMMENT '评论时间',
  `merchant_reply_content` varchar(300) NOT NULL DEFAULT '' COMMENT '管理员回复内容',
  `merchant_reply_time` int(11) NOT NULL DEFAULT '0' COMMENT '管理员回复时间',
  `is_del` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '0未删除1已删除',
  `is_reply` tinyint(1) NOT NULL DEFAULT '0' COMMENT '0未回复1已回复',
  `nickname` varchar(64) NOT NULL DEFAULT '' COMMENT '用户名称',
  `avatar` varchar(255) NOT NULL DEFAULT '' COMMENT '用户头像',
  `suk` varchar(255) NOT NULL DEFAULT '' COMMENT '规格名称',
  `status` tinyint(1) NOT NULL DEFAULT '0' COMMENT '评论状态',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `order_id_2` (`oid`,`unique`) USING BTREE,
  KEY `add_time` (`add_time`) USING BTREE,
  KEY `parent_id` (`reply_type`) USING BTREE,
  KEY `is_del` (`is_del`) USING BTREE,
  KEY `product_score` (`product_score`) USING BTREE,
  KEY `service_score` (`service_score`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='评论表';

CREATE TABLE IF NOT EXISTS `eb_store_coupon_issue` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `cid` int(10) NOT NULL DEFAULT '0' COMMENT '优惠券ID',
  `coupon_title` varchar(255) NOT NULL DEFAULT '' COMMENT '优惠券名称',
  `start_time` int(10) NOT NULL DEFAULT '0' COMMENT '优惠券领取开启时间',
  `end_time` int(10) NOT NULL DEFAULT '0' COMMENT '优惠券领取结束时间',
  `total_count` int(10) NOT NULL DEFAULT '0' COMMENT '优惠券领取数量',
  `remain_count` int(10) NOT NULL DEFAULT '0' COMMENT '优惠券剩余领取数量',
  `receive_limit` int(10) NOT NULL DEFAULT '0' COMMENT '每个人个领取的优惠券数量',
  `is_permanent` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否无限张数',
  `status` tinyint(1) NOT NULL DEFAULT '1' COMMENT '1 正常 0 未开启 -1 已无效',
  `is_give_subscribe` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否首次关注赠送 0-否(默认) 1-是',
  `is_full_give` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否满赠0-否(默认) 1-是',
  `full_reduction` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '消费满多少赠送优惠券',
  `is_del` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否删除',
  `add_time` int(10) NOT NULL DEFAULT '0' COMMENT '优惠券添加时间',
  `title` varchar(64) NOT NULL DEFAULT '' COMMENT '优惠券名称',
  `integral` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '兑换消耗积分值',
  `coupon_price` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '兑换的优惠券面值',
  `use_min_price` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '最低消费多少金额可用优惠券',
  `coupon_time` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '优惠券有效期限（单位：天）',
  `product_id` varchar(2000) NOT NULL DEFAULT '' COMMENT '所属商品id',
  `category_id` varchar(2000) NOT NULL DEFAULT '' COMMENT '分类id',
  `type` tinyint(2) NOT NULL DEFAULT '0' COMMENT '优惠券类型 0-通用 1-品类券 2-商品券',
  `receive_type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 手动领取，2 新人券，3赠送券，4会员券',
  `start_use_time` int(11) NOT NULL DEFAULT '0' COMMENT '优惠券使用开始时间',
  `end_use_time` int(11) NOT NULL DEFAULT '0' COMMENT '优惠券使用结束时间',
  `sort` int(11) NOT NULL DEFAULT '0' COMMENT '排序',
  PRIMARY KEY (`id`) USING BTREE,
  KEY `cid` (`cid`) USING BTREE,
  KEY `start_time` (`start_time`,`end_time`) USING BTREE,
  KEY `remain_count` (`remain_count`) USING BTREE,
  KEY `status` (`status`) USING BTREE,
  KEY `coupon_time` (`coupon_time`) USING BTREE,
  KEY `is_del` (`is_del`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COMMENT='优惠券前台领取表' ROW_FORMAT=COMPACT;

CREATE TABLE IF NOT EXISTS `eb_store_coupon_product` (
  `coupon_id` int(11) NOT NULL DEFAULT '0' COMMENT '优惠券模板id',
  `product_id` int(11) NOT NULL DEFAULT '0' COMMENT '商品id',
  `category_id` int(11) NOT NULL DEFAULT '0' COMMENT '分类id',
  KEY `coupon_id` (`coupon_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='优惠券模板关联列表';

CREATE TABLE IF NOT EXISTS `eb_store_product_coupon` (
  `id` int(10) NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `product_id` int(10) NOT NULL DEFAULT '0' COMMENT '商品id',
  `issue_coupon_id` int(10) NOT NULL DEFAULT '0' COMMENT '优惠劵id',
  `add_time` int(10) NOT NULL DEFAULT '0' COMMENT '添加时间',
  `title` varchar(255) NOT NULL DEFAULT '' COMMENT '优惠券名称',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COMMENT='商品关联优惠券表';

CREATE TABLE IF NOT EXISTS `eb_store_coupon_user` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '优惠券发放记录id',
  `cid` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '兑换的项目id',
  `uid` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '优惠券所属用户',
  `coupon_title` varchar(32) NOT NULL DEFAULT '' COMMENT '优惠券名称',
  `coupon_price` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '优惠券的面值',
  `use_min_price` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '最低消费多少金额可用优惠券',
  `add_time` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '优惠券创建时间',
  `start_time` int(11) NOT NULL DEFAULT '0' COMMENT '优惠券开始时间',
  `end_time` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '优惠券结束时间',
  `use_time` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '使用时间',
  `type` varchar(32) NOT NULL DEFAULT 'send' COMMENT '获取方式',
  `status` tinyint(1) NOT NULL DEFAULT '0' COMMENT '状态（0：未使用，1：已使用, 2:已过期）',
  `is_fail` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否有效',
  PRIMARY KEY (`id`) USING BTREE,
  KEY `cid` (`cid`) USING BTREE,
  KEY `uid` (`uid`) USING BTREE,
  KEY `add_time` (`add_time`) USING BTREE,
  KEY `end_time` (`end_time`) USING BTREE,
  KEY `status` (`status`) USING BTREE,
  KEY `is_fail` (`is_fail`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='优惠券发放记录表';

CREATE TABLE IF NOT EXISTS `eb_diy` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `version` varchar(255) NOT NULL DEFAULT '' COMMENT '版本号',
  `name` varchar(255) NOT NULL DEFAULT '' COMMENT '页面名称',
  `template_name` varchar(255) NOT NULL DEFAULT '' COMMENT '模版名称',
  `value` longtext COMMENT '页面数据',
  `default_value` longtext COMMENT '默认页面数据',
  `add_time` int(11) NOT NULL DEFAULT '0' COMMENT '添加时间',
  `update_time` int(11) NOT NULL DEFAULT '0' COMMENT '更新时间',
  `status` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否使用',
  `type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '页面类型',
  `is_show` tinyint(1) NOT NULL DEFAULT '0' COMMENT '显示首页',
  `is_bg_color` tinyint(1) NOT NULL DEFAULT '0' COMMENT '颜色是否选中',
  `is_bg_pic` tinyint(1) NOT NULL DEFAULT '0' COMMENT '背景图是否选中',
  `color_picker` varchar(50) NOT NULL DEFAULT '' COMMENT '背景颜色',
  `bg_pic` varchar(256) NOT NULL DEFAULT '' COMMENT '背景图',
  `bg_tab_val` tinyint(1) NOT NULL DEFAULT '0' COMMENT '背景图图片样式',
  `is_del` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否删除',
  `order_status` tinyint(1) NOT NULL DEFAULT '0' COMMENT '个人中心订单样式',
  `my_banner_status` tinyint(1) NOT NULL DEFAULT '1' COMMENT '个人中心banner是否显示',
  `my_menus_status` tinyint(1) NOT NULL DEFAULT '1' COMMENT '个人中心我的服务样式',
  `business_status` tinyint(1) NOT NULL DEFAULT '1' COMMENT '个人中心商家管理样式',
  `is_diy` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否diy',
  `title` varchar(255) NOT NULL DEFAULT '' COMMENT 'diy顶部title',
  `is_pro` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否新版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COMMENT='DIY数据表';

CREATE TABLE IF NOT EXISTS `eb_theme` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `version` varchar(255) NOT NULL DEFAULT '' COMMENT '版本号',
  `title` varchar(255) NOT NULL DEFAULT '' COMMENT '主题名称',
  `info` varchar(255) NOT NULL DEFAULT '' COMMENT '主题简介',
  `type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '主题类型，0:自建主题，1:广场主题',
  `home_data` longtext COMMENT '首页数据',
  `home_image` varchar(255) NOT NULL DEFAULT '' COMMENT '首页图片',
  `home_data_id` int(11) NOT NULL DEFAULT '0' COMMENT '首页数据来源id',
  `home_data_update_time` int(11) NOT NULL DEFAULT '0' COMMENT '首页数据更新时间',
  `category_data` longtext COMMENT '分类页数据',
  `category_image` varchar(255) NOT NULL DEFAULT '' COMMENT '分类页图片',
  `category_data_id` int(11) NOT NULL DEFAULT '0' COMMENT '分类页数据来源id',
  `category_data_update_time` int(11) NOT NULL DEFAULT '0' COMMENT '分类页数据更新时间',
  `detail_data` longtext COMMENT '商品详情页数据',
  `detail_image` varchar(255) NOT NULL DEFAULT '' COMMENT '商城详情页图片',
  `detail_data_id` int(11) NOT NULL DEFAULT '0' COMMENT '商品详情页数据来源id',
  `detail_data_update_time` int(11) NOT NULL DEFAULT '0' COMMENT '商品详情页数据更新时间',
  `user_data` longtext COMMENT '个人中心数据',
  `user_image` varchar(255) NOT NULL DEFAULT '' COMMENT '个人中心图片',
  `user_data_id` int(11) NOT NULL DEFAULT '0' COMMENT '个人中心数据来源id',
  `user_data_update_time` int(11) NOT NULL DEFAULT '0' COMMENT '个人中心数据更新时间',
  `theme_data` longtext COMMENT '主题风格数据',
  `theme_data_id` int(11) NOT NULL DEFAULT '0' COMMENT '主题风格数据来源id',
  `theme_data_update_time` int(11) NOT NULL DEFAULT '0' COMMENT '主题风格数据更新时间',
  `home_default_data` longtext COMMENT '首页默认数据',
  `home_default_image` varchar(255) NOT NULL DEFAULT '' COMMENT '首页默认图片',
  `category_default_data` longtext COMMENT '分类页默认数据',
  `category_default_image` varchar(255) NOT NULL DEFAULT '' COMMENT '分类页默认图片',
  `detail_default_data` longtext COMMENT '商品详情页默认数据',
  `detail_default_image` varchar(255) NOT NULL DEFAULT '' COMMENT '商城详情页默认图片',
  `user_default_data` longtext COMMENT '个人中心默认数据',
  `user_default_image` varchar(255) NOT NULL DEFAULT '' COMMENT '个人中心默认图片',
  `theme_default_data` longtext COMMENT '主题风格默认数据',
  `page_type` varchar(255) NOT NULL DEFAULT 'theme' COMMENT '页面类型：theme主题，micro微页面',
  `is_use` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否使用',
  `is_del` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否删除',
  `add_time` int(11) NOT NULL DEFAULT '0' COMMENT '添加时间',
  `up_time` int(11) NOT NULL DEFAULT '0' COMMENT '更新时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COMMENT='主题表';

CREATE TABLE IF NOT EXISTS `eb_page_categroy` (
  `id` int(10) NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `pid` int(10) NOT NULL DEFAULT '0' COMMENT '父类id',
  `type` varchar(50) NOT NULL DEFAULT 'link' COMMENT '类型:link、special、product、product_category、custom',
  `name` varchar(50) NOT NULL DEFAULT '' COMMENT '分类名称',
  `sort` smallint(5) NOT NULL DEFAULT '0' COMMENT '排序',
  `status` tinyint(1) NOT NULL DEFAULT '1' COMMENT '状态',
  `add_time` int(10) NOT NULL DEFAULT '0' COMMENT '添加时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COMMENT='页面链接分类';

CREATE TABLE IF NOT EXISTS `eb_page_link` (
  `id` int(10) NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `cate_id` int(10) NOT NULL DEFAULT '0' COMMENT '分类id',
  `type` tinyint(1) NOT NULL DEFAULT '1' COMMENT '分组1:基础2:分销3:个人中心',
  `name` varchar(50) NOT NULL DEFAULT '' COMMENT '页面名称',
  `url` varchar(255) NOT NULL DEFAULT '' COMMENT '页面链接',
  `param` varchar(255) NOT NULL DEFAULT '' COMMENT '参数',
  `example` varchar(255) NOT NULL DEFAULT '' COMMENT '事例',
  `status` tinyint(1) NOT NULL DEFAULT '1' COMMENT '状态',
  `sort` smallint(5) NOT NULL DEFAULT '0' COMMENT '排序',
  `add_time` int(10) NOT NULL DEFAULT '0' COMMENT '添加时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=53 DEFAULT CHARSET=utf8mb4 COMMENT='页面链接';


-- ---------------------------------------------------------------------------
-- R7：运费模板、文章、公众号、通知、拼团与预售——同样是官方安装脚本里的原样
-- 结构。eb_store_order 只为了数"预售订单有几张"：订单不迁移（PLAN §6），
-- 预售订单和拼团的团（eb_store_pink）都只计数、不搬运。
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `eb_shipping_templates` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '编号',
  `name` varchar(255) NOT NULL DEFAULT '' COMMENT '模板名称',
  `type` tinyint(1) NOT NULL DEFAULT '1' COMMENT '计费方式',
  `appoint` tinyint(1) NOT NULL DEFAULT '0' COMMENT '指定包邮',
  `no_delivery` tinyint(1) NOT NULL DEFAULT '0' COMMENT '指定不送达',
  `sort` int(11) NOT NULL DEFAULT '0' COMMENT '排序',
  `add_time` int(11) NOT NULL DEFAULT '0' COMMENT '添加时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='运费模板表';

CREATE TABLE IF NOT EXISTS `eb_shipping_templates_region` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '编号',
  `province_id` int(11) NOT NULL DEFAULT '0' COMMENT '省ID',
  `temp_id` int(11) NOT NULL DEFAULT '0' COMMENT '模板ID',
  `city_id` int(11) NOT NULL DEFAULT '0' COMMENT '城市ID',
  `first` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '首件',
  `first_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '首件运费',
  `continue` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '续件',
  `continue_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '续件运费',
  `type` tinyint(1) NOT NULL DEFAULT '1' COMMENT '计费方式',
  `uniqid` varchar(32) NOT NULL DEFAULT '' COMMENT '分组唯一值',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='运费模板指定城市运费表';

CREATE TABLE IF NOT EXISTS `eb_shipping_templates_free` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '编号',
  `province_id` int(11) NOT NULL DEFAULT '0' COMMENT '省ID',
  `temp_id` int(11) NOT NULL DEFAULT '0' COMMENT '模板ID',
  `city_id` int(11) NOT NULL DEFAULT '0' COMMENT '城市ID',
  `number` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '包邮件数',
  `price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '包邮金额',
  `type` tinyint(1) NOT NULL DEFAULT '1' COMMENT '计费方式',
  `uniqid` varchar(32) NOT NULL DEFAULT '' COMMENT '分组唯一值',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='运费模板指定包邮关联表';

CREATE TABLE IF NOT EXISTS `eb_shipping_templates_no_delivery` (
  `id` int(10) NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `province_id` int(10) NOT NULL DEFAULT '0' COMMENT '省ID',
  `temp_id` int(10) NOT NULL DEFAULT '0' COMMENT '模板ID',
  `city_id` int(10) NOT NULL DEFAULT '0' COMMENT '城市ID',
  `uniqid` varchar(32) NOT NULL DEFAULT '' COMMENT '分组唯一值',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='运费模板指定不送达表';

CREATE TABLE IF NOT EXISTS `eb_express` (
  `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '快递公司id',
  `code` varchar(50) NOT NULL DEFAULT '' COMMENT '快递公司简称',
  `name` varchar(50) NOT NULL DEFAULT '' COMMENT '快递公司全称',
  `partner_id` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否需要月结账号',
  `partner_key` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否需要月结密码',
  `net` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否需要取件网店',
  `check_man` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否填写电子面单承载快递员名',
  `partner_name` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否填写电子面单客户账户名称',
  `is_code` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否填写电子面单承载编号',
  `courier_name` varchar(100) NOT NULL DEFAULT '' COMMENT '承载快递员名',
  `customer_name` varchar(100) NOT NULL DEFAULT '' COMMENT '客户账户名称',
  `code_name` varchar(100) NOT NULL DEFAULT '' COMMENT '电子面单承载编号',
  `account` varchar(100) NOT NULL DEFAULT '' COMMENT '账号',
  `key` varchar(100) NOT NULL DEFAULT '' COMMENT '密码',
  `net_name` varchar(100) NOT NULL DEFAULT '' COMMENT '网点名称',
  `sort` int(11) NOT NULL DEFAULT '0' COMMENT '排序',
  `is_show` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否显示',
  `status` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否可用',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `code` (`code`) USING BTREE,
  KEY `is_show` (`is_show`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='快递公司表';

CREATE TABLE IF NOT EXISTS `eb_article_category` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '文章分类id',
  `pid` int(11) NOT NULL DEFAULT '0' COMMENT '父级ID',
  `title` varchar(255) NOT NULL DEFAULT '' COMMENT '文章分类标题',
  `intr` varchar(255) NOT NULL DEFAULT '' COMMENT '文章分类简介',
  `image` varchar(255) NOT NULL DEFAULT '' COMMENT '文章分类图片',
  `status` tinyint(1) UNSIGNED NOT NULL DEFAULT '1' COMMENT '状态',
  `sort` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '排序',
  `is_del` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '1删除0未删除',
  `add_time` varchar(255) NOT NULL DEFAULT '' COMMENT '添加时间',
  `hidden` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否隐藏',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文章分类表';

CREATE TABLE IF NOT EXISTS `eb_article` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '文章管理ID',
  `cid` varchar(255) NOT NULL DEFAULT '0' COMMENT '分类id',
  `title` varchar(255) NOT NULL DEFAULT '' COMMENT '文章标题',
  `author` varchar(255) NOT NULL DEFAULT '' COMMENT '文章作者',
  `image_input` varchar(255) NOT NULL DEFAULT '' COMMENT '文章图片',
  `synopsis` varchar(255) NOT NULL DEFAULT '' COMMENT '文章简介',
  `share_title` varchar(255) NOT NULL DEFAULT '' COMMENT '文章分享标题',
  `share_synopsis` varchar(255) NOT NULL DEFAULT '' COMMENT '文章分享简介',
  `visit` varchar(255) NOT NULL DEFAULT '0' COMMENT '浏览次数',
  `sort` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '排序',
  `url` varchar(255) NOT NULL DEFAULT '' COMMENT '原文链接',
  `status` tinyint(1) UNSIGNED NOT NULL DEFAULT '1' COMMENT '状态',
  `add_time` varchar(255) NOT NULL DEFAULT '' COMMENT '添加时间',
  `hide` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否隐藏',
  `admin_id` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '管理员id',
  `mer_id` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '商户id',
  `product_id` int(10) NOT NULL DEFAULT '0' COMMENT '商品关联id',
  `is_hot` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否热门(小程序)',
  `is_banner` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否轮播图(小程序)',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文章管理表';

CREATE TABLE IF NOT EXISTS `eb_article_content` (
  `nid` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '文章id',
  `content` longtext COMMENT '文章内容',
  UNIQUE KEY `nid` (`nid`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文章内容表';

CREATE TABLE IF NOT EXISTS `eb_cache` (
  `key` varchar(32) NOT NULL DEFAULT '' COMMENT '缓存key',
  `result` text COMMENT '缓存数据',
  `expire_time` int(11) NOT NULL DEFAULT '0' COMMENT '失效时间0=永久',
  `add_time` int(10) NOT NULL DEFAULT '0' COMMENT '缓存时间',
  PRIMARY KEY (`key`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='微信缓存表';

CREATE TABLE IF NOT EXISTS `eb_wechat_reply` (
  `id` mediumint(8) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '微信关键字回复id',
  `type` varchar(32) NOT NULL DEFAULT '' COMMENT '回复类型',
  `data` text COMMENT '回复数据',
  `status` tinyint(1) UNSIGNED NOT NULL DEFAULT '1' COMMENT '0=不可用  1 =可用',
  `hide` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否隐藏',
  PRIMARY KEY (`id`) USING BTREE,
  KEY `type` (`type`) USING BTREE,
  KEY `status` (`status`) USING BTREE,
  KEY `hide` (`hide`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='微信关键字回复表';

CREATE TABLE IF NOT EXISTS `eb_wechat_key` (
  `id` mediumint(8) NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `reply_id` mediumint(8) NOT NULL DEFAULT '0' COMMENT '回复内容id',
  `keys` varchar(64) NOT NULL DEFAULT '' COMMENT '关键词',
  `key_type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '回复类型，0公众号自动回复，1客服自动回复',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COMMENT='微信回复关键词辅助表' ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `eb_wechat_qrcode_cate` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '主键id',
  `cate_name` varchar(255) NOT NULL DEFAULT '' COMMENT '渠道码分类名称',
  `add_time` int(11) NOT NULL DEFAULT '0' COMMENT '添加时间',
  `is_del` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否删除',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='二维码类型表';

CREATE TABLE IF NOT EXISTS `eb_wechat_qrcode` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '编号',
  `uid` int(11) NOT NULL DEFAULT '0' COMMENT '用户id',
  `name` varchar(255) NOT NULL DEFAULT '' COMMENT '二维码名称',
  `image` varchar(500) NOT NULL DEFAULT '' COMMENT '二维码图片',
  `cate_id` int(11) NOT NULL DEFAULT '0' COMMENT '分类id',
  `label_id` varchar(32) NOT NULL DEFAULT '' COMMENT '标签id',
  `type` varchar(32) NOT NULL DEFAULT '' COMMENT '回复类型',
  `content` text COMMENT '回复内容',
  `data` text COMMENT '发送数据',
  `follow` int(11) NOT NULL DEFAULT '0' COMMENT '关注人数',
  `scan` int(11) NOT NULL DEFAULT '0' COMMENT '扫码人数',
  `add_time` int(11) NOT NULL DEFAULT '0' COMMENT '添加时间',
  `continue_time` int(11) NOT NULL DEFAULT '0' COMMENT '有效期',
  `end_time` int(11) NOT NULL DEFAULT '0' COMMENT '到期时间',
  `status` tinyint(1) NOT NULL DEFAULT '1' COMMENT '状态',
  `is_del` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否删除',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='二维码表';

-- 安装脚本里这张表带 ROW_FORMAT=COMPACT；在 MySQL 8 上，COMPACT 下 utf8mb4 的
-- varchar(255) 索引超过 767 字节会建表失败，所以这里去掉了它（只影响存储格式）。
CREATE TABLE IF NOT EXISTS `eb_qrcode` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '微信二维码ID',
  `third_type` varchar(32) NOT NULL DEFAULT '' COMMENT '二维码类型',
  `third_id` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '用户id',
  `ticket` varchar(255) NOT NULL DEFAULT '' COMMENT '二维码参数',
  `expire_seconds` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '二维码有效时间',
  `status` tinyint(1) UNSIGNED NOT NULL DEFAULT '1' COMMENT '状态',
  `add_time` varchar(255) NOT NULL DEFAULT '0' COMMENT '添加时间',
  `url` varchar(255) NOT NULL DEFAULT '' COMMENT '微信访问url',
  `qrcode_url` varchar(255) NOT NULL DEFAULT '' COMMENT '微信二维码url',
  `scan` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '被扫的次数',
  `type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '二维码所属平台1=小程序，2=公众号，3=H5',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `third_type` (`third_type`,`third_id`) USING BTREE,
  KEY `ticket` (`ticket`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='微信二维码管理表';

CREATE TABLE IF NOT EXISTS `eb_wechat_qrcode_record` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `qid` int(11) NOT NULL DEFAULT '0' COMMENT '渠道码id',
  `uid` int(11) NOT NULL DEFAULT '0' COMMENT '用户id',
  `is_follow` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否关注',
  `add_time` int(11) NOT NULL DEFAULT '0' COMMENT '扫码时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='渠道码扫码记录表';

CREATE TABLE IF NOT EXISTS `eb_wechat_media` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '微信视频音频id',
  `type` varchar(16) NOT NULL DEFAULT '' COMMENT '回复类型',
  `path` varchar(128) NOT NULL DEFAULT '' COMMENT '文件路径',
  `media_id` varchar(64) NOT NULL DEFAULT '' COMMENT '微信服务器返回的id',
  `url` varchar(256) NOT NULL DEFAULT '' COMMENT '地址',
  `temporary` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否永久或者临时 0永久1临时',
  `add_time` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '添加时间',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `type` (`type`,`media_id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='微信回复表';

CREATE TABLE IF NOT EXISTS `eb_system_notification` (
  `id` int(10) NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `mark` varchar(50) NOT NULL DEFAULT '' COMMENT '标识',
  `name` varchar(50) NOT NULL DEFAULT '' COMMENT '通知类型',
  `title` varchar(100) NOT NULL DEFAULT '' COMMENT '通知场景说明',
  `is_system` tinyint(1) NOT NULL DEFAULT '0' COMMENT '站内信（0：不存在，1：开启，2：关闭）',
  `system_title` varchar(256) NOT NULL DEFAULT '' COMMENT '站内信标题',
  `system_text` varchar(512) NOT NULL DEFAULT '' COMMENT '系统消息id',
  `is_wechat` tinyint(1) NOT NULL DEFAULT '0' COMMENT '公众号模板消息（0：不存在，1：开启，2：关闭）',
  `wechat_tempkey` varchar(255) NOT NULL DEFAULT '' COMMENT '模版消息tempkey',
  `wechat_content` varchar(255) NOT NULL DEFAULT '' COMMENT '模版消息内容',
  `wechat_kid` varchar(255) NOT NULL DEFAULT '' COMMENT '模版消息kid',
  `wechat_tempid` varchar(255) NOT NULL DEFAULT '' COMMENT '模版消息tempid',
  `wechat_data` varchar(255) NOT NULL DEFAULT '' COMMENT '模版消息参数',
  `wechat_link` varchar(255) NOT NULL DEFAULT '' COMMENT '模版消息链接',
  `wechat_to_routine` int(1) NOT NULL DEFAULT '0' COMMENT '模版消息跳转小程序',
  `is_routine` tinyint(1) NOT NULL DEFAULT '0' COMMENT '小程序订阅消息（0：不存在，1：开启，2：关闭）',
  `routine_tempkey` varchar(255) NOT NULL DEFAULT '' COMMENT '订阅消息id',
  `routine_content` varchar(255) NOT NULL DEFAULT '' COMMENT '订阅消息内容',
  `routine_kid` varchar(255) NOT NULL DEFAULT '' COMMENT '订阅消息kid',
  `routine_tempid` varchar(255) NOT NULL DEFAULT '' COMMENT '订阅消息tempid',
  `routine_data` varchar(255) NOT NULL DEFAULT '' COMMENT '订阅消息参数',
  `routine_link` varchar(255) NOT NULL DEFAULT '' COMMENT '订阅消息链接',
  `is_sms` tinyint(1) NOT NULL DEFAULT '0' COMMENT '发送短信（0：不存在，1：开启，2：关闭）',
  `sms_id` varchar(32) NOT NULL DEFAULT '' COMMENT '短信id',
  `sms_text` varchar(255) NOT NULL DEFAULT '' COMMENT '短信模版内容',
  `is_ent_wechat` tinyint(1) NOT NULL DEFAULT '0' COMMENT '企业微信群通知（0：不存在，1：开启，2：关闭）',
  `ent_wechat_text` varchar(512) NOT NULL DEFAULT '' COMMENT '企业微信消息',
  `url` varchar(512) NOT NULL DEFAULT '' COMMENT '群机器人链接',
  `is_app` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'APP推送（0：不存在，1：开启，2：关闭）',
  `app_id` int(11) NOT NULL DEFAULT '0' COMMENT 'app推送id',
  `variable` varchar(256) NOT NULL DEFAULT '' COMMENT '变量',
  `type` tinyint(1) NOT NULL DEFAULT '1' COMMENT '类型（1：用户，2：管理员）',
  `add_time` int(11) NOT NULL DEFAULT '0' COMMENT '添加时间',
  `custom_trigger` varchar(255) NOT NULL DEFAULT '' COMMENT '自定义消息触发位置',
  `custom_variable` varchar(1000) NOT NULL DEFAULT '' COMMENT '自定义消息变量',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知设置';

CREATE TABLE IF NOT EXISTS `eb_message_system` (
  `id` int(10) NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `mark` varchar(50) NOT NULL DEFAULT '' COMMENT '标识',
  `uid` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '用户ID',
  `title` varchar(256) NOT NULL DEFAULT '' COMMENT '通知标题',
  `content` varchar(512) NOT NULL DEFAULT '' COMMENT '通知内容',
  `data` varchar(5000) NOT NULL DEFAULT '' COMMENT '站内信参数',
  `look` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否查看',
  `type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1:普通用户，2：管理员',
  `add_time` int(11) NOT NULL DEFAULT '0' COMMENT '通知时间',
  `is_del` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否删除',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统通知';

CREATE TABLE IF NOT EXISTS `eb_store_combination` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `product_id` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '商品id',
  `mer_id` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '商户id',
  `image` varchar(255) NOT NULL DEFAULT '' COMMENT '推荐图',
  `images` varchar(2000) NOT NULL DEFAULT '' COMMENT '轮播图',
  `title` varchar(255) NOT NULL DEFAULT '' COMMENT '活动标题',
  `attr` varchar(255) NOT NULL DEFAULT '' COMMENT '活动属性',
  `people` int(2) UNSIGNED NOT NULL DEFAULT '0' COMMENT '参团人数',
  `info` varchar(255) NOT NULL DEFAULT '' COMMENT '简介',
  `price` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '价格',
  `sort` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '排序',
  `sales` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '销量',
  `stock` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '库存',
  `add_time` varchar(128) NOT NULL DEFAULT '0' COMMENT '添加时间',
  `is_host` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '推荐',
  `is_show` tinyint(1) UNSIGNED NOT NULL DEFAULT '1' COMMENT '商品状态',
  `is_del` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否删除',
  `combination` tinyint(1) UNSIGNED NOT NULL DEFAULT '1' COMMENT '拼团',
  `mer_use` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '商户是否可用1可用0不可用',
  `is_postage` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否包邮1是0否',
  `postage` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '邮费',
  `start_time` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '拼团开始时间',
  `stop_time` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '拼团结束时间',
  `effective_time` int(11) NOT NULL DEFAULT '0' COMMENT '拼团订单有效时间',
  `cost` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '拼图商品成本',
  `browse` int(11) NOT NULL DEFAULT '0' COMMENT '浏览量',
  `unit_name` varchar(32) NOT NULL DEFAULT '' COMMENT '单位名',
  `temp_id` int(11) NOT NULL DEFAULT '0' COMMENT '运费模板ID',
  `weight` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '重量',
  `volume` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '体积',
  `num` int(11) NOT NULL DEFAULT '0' COMMENT '单次购买数量',
  `once_num` int(11) NOT NULL DEFAULT '0' COMMENT '每个订单可购买数量',
  `quota` int(10) NOT NULL DEFAULT '0' COMMENT '限购总数',
  `quota_show` int(10) NOT NULL DEFAULT '0' COMMENT '限量总数显示',
  `virtual` int(11) NOT NULL DEFAULT '100' COMMENT '虚拟成团百分比',
  `logistics` varchar(11) NOT NULL DEFAULT '1,2' COMMENT '物流方式',
  `freight` tinyint(1) NOT NULL DEFAULT '2' COMMENT '运费设置',
  `custom_form` varchar(2000) NOT NULL DEFAULT '' COMMENT '自定义表单',
  `virtual_type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '商品类型',
  `is_commission` tinyint(1) NOT NULL DEFAULT '0' COMMENT '拼团是否返佣',
  `head_commission` int(11) NOT NULL DEFAULT '0' COMMENT '团长佣金比例',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拼团商品表';

CREATE TABLE IF NOT EXISTS `eb_store_pink` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `uid` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '用户id',
  `nickname` varchar(64) NOT NULL DEFAULT '' COMMENT '用户昵称',
  `avatar` varchar(256) NOT NULL DEFAULT '' COMMENT '用户头像',
  `order_id` varchar(32) NOT NULL DEFAULT '' COMMENT '订单id 生成',
  `order_id_key` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '订单id  数据库',
  `total_num` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '购买商品个数',
  `total_price` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '购买总金额',
  `cid` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '拼团商品id',
  `pid` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '商品id',
  `people` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '拼图总人数',
  `price` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '拼团商品单价',
  `add_time` varchar(24) NOT NULL DEFAULT '0' COMMENT '开始时间',
  `stop_time` varchar(24) NOT NULL DEFAULT '0' COMMENT '结束时间',
  `k_id` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '团长id 0为团长',
  `is_tpl` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否发送模板消息0未发送1已发送',
  `is_refund` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否退款 0未退款 1已退款',
  `status` tinyint(1) UNSIGNED NOT NULL DEFAULT '1' COMMENT '状态1进行中2已完成3未完成',
  `is_virtual` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否虚拟拼团',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拼团表';

CREATE TABLE IF NOT EXISTS `eb_store_advance` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '预售商品id',
  `product_id` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '商品id',
  `image` varchar(255) NOT NULL DEFAULT '' COMMENT '商品主图',
  `images` varchar(2000) NOT NULL DEFAULT '' COMMENT '轮播图',
  `title` varchar(255) NOT NULL DEFAULT '' COMMENT '活动标题',
  `info` varchar(255) NOT NULL DEFAULT '' COMMENT '简介',
  `price` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '价格',
  `ot_price` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '原价',
  `sort` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '排序',
  `stock` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '库存',
  `sales` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '销量',
  `unit_name` varchar(16) NOT NULL DEFAULT '' COMMENT '单位名',
  `start_time` varchar(128) NOT NULL DEFAULT '' COMMENT '开始时间',
  `stop_time` varchar(128) NOT NULL DEFAULT '' COMMENT '结束时间',
  `add_time` varchar(128) NOT NULL DEFAULT '' COMMENT '添加时间',
  `status` tinyint(1) UNSIGNED NOT NULL DEFAULT '1' COMMENT '商品状态',
  `is_del` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '删除 0未删除1已删除',
  `type` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '类型 0全款1定金',
  `deposit` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '定金金额',
  `pay_start_time` varchar(128) NOT NULL DEFAULT '' COMMENT '尾款支付开始时间',
  `pay_stop_time` varchar(128) NOT NULL DEFAULT '' COMMENT '尾款支付结束时间',
  `deliver_time` int(10) NOT NULL DEFAULT '0' COMMENT '付款后几天后发货',
  `num` int(11) UNSIGNED NOT NULL DEFAULT '1' COMMENT '最多购买几个',
  `temp_id` int(11) NOT NULL DEFAULT '0' COMMENT '运费模板ID',
  `quota` int(10) NOT NULL DEFAULT '0' COMMENT '限购总数',
  `quota_show` int(10) NOT NULL DEFAULT '0' COMMENT '限购总数显示',
  `once_num` int(11) NOT NULL DEFAULT '0' COMMENT '单次购买个数',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='预售商品表';

CREATE TABLE IF NOT EXISTS `eb_store_order` (
  `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '订单ID',
  `pid` int(10) NOT NULL DEFAULT '0' COMMENT '父类订单id',
  `order_id` varchar(32) NOT NULL DEFAULT '0' COMMENT '订单号',
  `trade_no` varchar(100) NOT NULL DEFAULT '' COMMENT '支付订单号',
  `uid` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '用户id',
  `real_name` varchar(32) NOT NULL DEFAULT '' COMMENT '用户姓名',
  `user_phone` varchar(18) NOT NULL DEFAULT '' COMMENT '用户电话',
  `user_address` varchar(100) NOT NULL DEFAULT '' COMMENT '详细地址',
  `cart_id` text COMMENT '购物车id',
  `freight_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '运费金额',
  `total_num` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '订单商品总数',
  `total_price` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '订单总价',
  `total_postage` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '邮费',
  `pay_price` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '实际支付金额',
  `pay_postage` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '支付邮费',
  `deduction_price` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '抵扣金额',
  `coupon_id` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '优惠券id',
  `coupon_price` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '优惠券金额',
  `paid` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '支付状态',
  `pay_time` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '支付时间',
  `pay_type` varchar(32) NOT NULL DEFAULT '' COMMENT '支付方式',
  `add_time` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '创建时间',
  `status` tinyint(1) NOT NULL DEFAULT '0' COMMENT '订单状态（-1 : 申请退款 -2 : 退货成功 0：待发货；1：待收货；2：已收货；3：待评价；-1：已退款）',
  `is_stock_up` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否备货中',
  `refund_status` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '0 未退款 1 申请中 2 已退款',
  `refund_type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '退款申请类型',
  `refund_express` varchar(255) NOT NULL DEFAULT '' COMMENT '退货快递单号',
  `refund_express_name` varchar(255) NOT NULL DEFAULT '' COMMENT '退货快递名称',
  `refund_reason_wap_img` varchar(2000) NOT NULL DEFAULT '' COMMENT '退款图片',
  `refund_reason_wap_explain` varchar(255) NOT NULL DEFAULT '' COMMENT '退款用户说明',
  `refund_reason_time` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '退款时间',
  `refund_reason_wap` varchar(255) NOT NULL DEFAULT '' COMMENT '前台退款原因',
  `refund_reason` varchar(255) NOT NULL DEFAULT '' COMMENT '不退款的理由',
  `refund_price` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '退款金额',
  `delivery_name` varchar(64) NOT NULL DEFAULT '' COMMENT '快递名称/送货人姓名',
  `delivery_code` varchar(50) NOT NULL DEFAULT '' COMMENT '快递公司编码',
  `delivery_type` varchar(32) NOT NULL DEFAULT '' COMMENT '发货类型',
  `delivery_id` varchar(64) NOT NULL DEFAULT '' COMMENT '快递单号/手机号',
  `kuaidi_label` varchar(255) NOT NULL DEFAULT '' COMMENT '快递单号图片',
  `kuaidi_task_id` varchar(64) NOT NULL DEFAULT '' COMMENT '快递单任务id',
  `kuaidi_order_id` varchar(64) NOT NULL DEFAULT '' COMMENT '快递单订单号',
  `fictitious_content` varchar(500) NOT NULL DEFAULT '' COMMENT '虚拟发货内容',
  `delivery_uid` int(11) NOT NULL DEFAULT '0' COMMENT '配送员id',
  `gain_integral` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '消费赚取积分',
  `use_integral` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '使用积分',
  `back_integral` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '给用户退了多少积分',
  `spread_uid` int(10) NOT NULL DEFAULT '0' COMMENT '推广人uid',
  `spread_two_uid` int(10) NOT NULL DEFAULT '0' COMMENT '上上级推广人uid',
  `one_brokerage` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '一级返佣金额',
  `two_brokerage` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '二级返佣金额',
  `mark` varchar(512) NOT NULL DEFAULT '' COMMENT '备注',
  `is_del` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否删除',
  `is_cancel` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '是否取消',
  `unique` char(32) NOT NULL DEFAULT '' COMMENT '唯一id(md5加密)类似id',
  `remark` varchar(512) NOT NULL DEFAULT '' COMMENT '管理员备注',
  `mer_id` int(10) UNSIGNED NOT NULL DEFAULT '0' COMMENT '商户ID',
  `is_mer_check` tinyint(3) UNSIGNED NOT NULL DEFAULT '0' COMMENT '商户上传',
  `combination_id` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '拼团商品id0一般商品',
  `pink_id` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '拼团id 0没有拼团',
  `cost` decimal(12,2) UNSIGNED NOT NULL DEFAULT '0.00' COMMENT '成本价',
  `seckill_id` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '秒杀商品ID',
  `bargain_id` int(11) UNSIGNED NOT NULL DEFAULT '0' COMMENT '砍价id',
  `advance_id` int(10) NOT NULL DEFAULT '0' COMMENT '预售商品id',
  `verify_code` varchar(12) NOT NULL DEFAULT '' COMMENT '核销码',
  `store_id` int(11) NOT NULL DEFAULT '0' COMMENT '门店id',
  `shipping_type` tinyint(1) NOT NULL DEFAULT '1' COMMENT '配送方式 1=快递 ，2=门店自提',
  `clerk_id` int(11) NOT NULL DEFAULT '0' COMMENT '店员id',
  `is_channel` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '支付渠道(0微信公众号1微信小程序)',
  `is_remind` tinyint(1) UNSIGNED NOT NULL DEFAULT '0' COMMENT '消息提醒',
  `is_system_del` tinyint(1) NOT NULL DEFAULT '0' COMMENT '后台是否删除',
  `channel_type` varchar(255) NOT NULL DEFAULT '' COMMENT '用户访问端标识',
  `province` varchar(255) NOT NULL DEFAULT '' COMMENT '用户省份',
  `express_dump` varchar(502) NOT NULL DEFAULT '' COMMENT '订单面单打印信息',
  `virtual_type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '虚拟商品类型',
  `virtual_info` varchar(255) NOT NULL DEFAULT '' COMMENT '虚拟商品信息',
  `pay_uid` int(11) NOT NULL DEFAULT '0' COMMENT '支付用户uid',
  `custom_form` text COMMENT '自定义表单',
  `staff_id` int(11) NOT NULL DEFAULT '0' COMMENT '员工id',
  `agent_id` int(11) NOT NULL DEFAULT '0' COMMENT '代理id',
  `division_id` int(11) NOT NULL DEFAULT '0' COMMENT '事业部id',
  `staff_brokerage` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '员工返佣',
  `agent_brokerage` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '代理返佣',
  `division_brokerage` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '事业部返佣',
  `is_gift` int(1) NOT NULL DEFAULT '0' COMMENT '是否礼品订单',
  `gift_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '礼品附加费',
  `gift_uid` int(11) NOT NULL DEFAULT '0' COMMENT '接受礼品用户uid',
  `gift_mark` varchar(255) NOT NULL DEFAULT '' COMMENT '礼物留言',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `order_id_2` (`order_id`,`uid`) USING BTREE,
  UNIQUE KEY `unique` (`unique`) USING BTREE,
  KEY `uid` (`uid`) USING BTREE,
  KEY `add_time` (`add_time`) USING BTREE,
  KEY `pay_price` (`pay_price`) USING BTREE,
  KEY `paid` (`paid`) USING BTREE,
  KEY `pay_time` (`pay_time`) USING BTREE,
  KEY `pay_type` (`pay_type`) USING BTREE,
  KEY `status` (`status`) USING BTREE,
  KEY `is_del` (`is_del`) USING BTREE,
  KEY `coupon_id` (`coupon_id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单表';

-- ---------------------------------------------------------------------------
-- 后台管理员与角色
-- ---------------------------------------------------------------------------
-- 三个管理员，其中 #3 已删除（is_del = 1），迁移后 admins 应该正好两行。
-- pwd 是 md5 的形状（旧系统就是 md5），但这些是随手敲的 32 位十六进制，
-- 不对应任何口令。
INSERT INTO `eb_system_admin` (`id`,`account`,`pwd`,`real_name`,`roles`,`last_time`,`add_time`,`login_count`,`level`,`status`,`is_del`) VALUES
(1,'demo_admin','0123456789abcdef0123456789abcdef','示例超级管理员','1',1700000000,1600000000,42,0,1,0),
(2,'demo_editor','fedcba9876543210fedcba9876543210','示例运营','2',0,1600000100,3,1,1,0),
(3,'demo_removed','11112222333344445555666677778888','已删除的管理员','2',0,1600000200,0,1,0,1);

INSERT INTO `eb_system_role` (`id`,`role_name`,`rules`,`level`,`status`) VALUES
(1,'超级管理员','1,2,3,4,5',0,1),
(2,'运营','2,3',1,1),
(3,'只读','3',1,0);

-- ---------------------------------------------------------------------------
-- 系统配置
-- ---------------------------------------------------------------------------
-- value 全部是 JSON 编码的，和真实导出一致："2" 而不是 2。
-- order_cancel_time 在旧库里的单位是小时，新库是分钟；如果迁移时忘了先
-- JSON 解码，Number.parseFloat('"2"') 会得到 NaN 并静默回落到默认值。
-- config_export_open 在显式丢弃清单里，应该被算作 dropped 而不是 unmapped。
INSERT INTO `eb_system_config` (`id`,`menu_name`,`type`,`input_type`,`value`,`info`,`status`) VALUES
(1,'site_name',0,'input','"示例商城"','网站名称',1),
(2,'site_url',0,'input','"https://shop.example.invalid"','网站地址',1),
(3,'site_phone',0,'input','"400-000-0000"','客服电话',1),
(4,'order_cancel_time',0,'input','"2"','未支付订单取消时间(小时)',1),
(5,'store_stock',0,'input','"5"','库存预警值',1),
(6,'product_replay_days',0,'input','"7"','自动好评天数',1),
(7,'config_export_open',0,'radio','"0"','电子面单开关（已废弃）',1),
(8,'site_logo',0,'upload','"/uploads/demo/logo.png"','网站 LOGO',1),
(9,'site_keywords',0,'input','"示例,测试"','网站关键字',1),
(10,'site_description',0,'input','"一个用于测试的示例商城"','网站描述',1);

-- ---------------------------------------------------------------------------
-- 素材库
-- ---------------------------------------------------------------------------
-- att_dir 指向测试在临时目录里真实写出的文件；sha256 由 run 自己算，
-- 所以这里不写摘要（旧库里也没有这一列）。
INSERT INTO `eb_system_attachment_category` (`id`,`pid`,`name`,`enname`,`type`) VALUES
(1,0,'示例分类','demo',0),
(2,1,'示例子分类','demo-sub',0);

INSERT INTO `eb_system_attachment` (`att_id`,`name`,`att_dir`,`satt_dir`,`att_size`,`att_type`,`pid`,`time`,`image_type`,`module_type`,`real_name`) VALUES
(1,'logo.png','/uploads/demo/logo.png','/uploads/demo/logo.png','120','image/png',1,1600000000,1,1,'logo.png'),
(2,'banner.jpg','uploads/demo/banner.jpg','uploads/demo/banner.jpg','340','image/jpeg',1,1600000100,1,1,'banner.jpg'),
(3,'goods-1.png','/uploads/demo/goods-1.png','/uploads/demo/goods-1.png','88','image/png',2,1600000200,1,1,'goods-1.png'),
(4,'missing.png','/uploads/demo/missing.png','/uploads/demo/missing.png','10','image/png',2,1600000300,1,1,'missing.png');

-- ---------------------------------------------------------------------------
-- 商品
-- ---------------------------------------------------------------------------
INSERT INTO `eb_store_category` (`id`,`pid`,`cate_name`,`sort`,`pic`,`is_show`,`add_time`) VALUES
(1,0,'示例一级分类',10,'/uploads/demo/logo.png',1,1600000000),
(2,1,'示例二级分类',20,'/uploads/demo/logo.png',1,1600000000),
(3,0,'隐藏的分类',0,'',0,0);

-- #4 是软删除的商品（is_del = 1），它必须照样迁过去：订单明细指着它，
-- 丢掉它等于让将来落地的订单流悬空。
INSERT INTO `eb_store_product` (`id`,`mer_id`,`image`,`slider_image`,`store_name`,`store_info`,`keyword`,`bar_code`,`cate_id`,`price`,`vip_price`,`ot_price`,`postage`,`unit_name`,`sort`,`sales`,`stock`,`is_show`,`is_hot`,`is_best`,`is_new`,`add_time`,`is_del`,`cost`,`ficti`,`browse`,`temp_id`,`spec_type`,`is_virtual`,`virtual_type`) VALUES
(1,0,'/uploads/demo/goods-1.png','[\"\\/uploads\\/demo\\/goods-1.png\"]','示例商品甲','一件用于测试的商品','示例,测试','DEMO-0001',1,'19.90','18.00','29.90','0.00','件',100,12,88,1,1,0,1,1600001000,0,'10.00',0,31,1,0,0,0),
(2,0,'/uploads/demo/goods-1.png','[\"\\/uploads\\/demo\\/goods-1.png\"]','示例商品乙','有两个规格的测试商品','示例','DEMO-0002',2,'99.00','88.00','129.00','5.00','盒',90,3,20,1,0,1,0,1600002000,0,'60.00',0,7,1,1,0,0),
(3,0,'/uploads/demo/goods-1.png','[]','示例虚拟卡密商品','发卡密的测试商品','虚拟','DEMO-0003',2,'5.00','5.00','5.00','0.00','张',80,0,100,1,0,0,0,1600003000,0,'1.00',0,0,0,0,1,2),
(4,0,'/uploads/demo/goods-1.png','[]','已下架的示例商品','软删除，但必须迁移','','DEMO-0004',1,'1.00','1.00','1.00','0.00','件',0,0,0,0,0,0,0,1600004000,1,'0.50',0,0,1,0,0,0);

INSERT INTO `eb_store_product_cate` (`id`,`product_id`,`cate_id`,`add_time`,`cate_pid`) VALUES
(1,1,1,1600001000,0),
(2,2,2,1600002000,1),
(3,3,2,1600003000,1),
(4,4,1,1600004000,0);

INSERT INTO `eb_store_product_description` (`product_id`,`description`,`type`) VALUES
(1,'<p>示例商品甲的详情。</p>',0),
(2,'<p>示例商品乙的详情。</p>',0),
(3,'<p>示例虚拟商品的详情。</p>',0);

INSERT INTO `eb_store_product_attr` (`id`,`product_id`,`attr_name`,`attr_values`,`type`) VALUES
(1,2,'颜色','红,蓝',0),
(2,2,'尺码','S,M',0);

-- type = 0 才是普通 SKU；3 是拼团、6 是预售（活动价行在文件末尾），其它取值属于已经退役的活动。
INSERT INTO `eb_store_product_attr_value` (`id`,`product_id`,`suk`,`stock`,`sales`,`price`,`image`,`unique`,`cost`,`bar_code`,`ot_price`,`vip_price`,`weight`,`volume`,`type`) VALUES
(1,1,'默认',88,12,'19.90','/uploads/demo/goods-1.png','demo0001','10.00','DEMO-0001','29.90','18.00','0.50','0.00',0),
(2,2,'红,S',5,1,'99.00','/uploads/demo/goods-1.png','demo0002','60.00','DEMO-0002-RS','129.00','88.00','1.00','0.01',0),
(3,2,'红,M',5,1,'99.00','/uploads/demo/goods-1.png','demo0003','60.00','DEMO-0002-RM','129.00','88.00','1.10','0.01',0),
(4,2,'蓝,S',5,1,'109.00','/uploads/demo/goods-1.png','demo0004','60.00','DEMO-0002-BS','139.00','98.00','1.00','0.01',0),
(5,2,'蓝,M',5,0,'109.00','/uploads/demo/goods-1.png','demo0005','60.00','DEMO-0002-BM','139.00','98.00','1.10','0.01',0),
(6,3,'默认',100,0,'5.00','','demo0006','1.00','DEMO-0003','5.00','5.00','0.00','0.00',0),
(7,4,'默认',0,0,'1.00','','demo0007','0.50','DEMO-0004','1.00','1.00','0.00','0.00',0);

INSERT INTO `eb_store_product_virtual` (`id`,`product_id`,`attr_unique`,`card_no`,`card_pwd`,`card_unique`,`order_id`,`uid`) VALUES
(1,3,'demo0006','DEMOCARD0001','demo-pwd-0001','demo-card-u1','',0),
(2,3,'demo0006','DEMOCARD0002','demo-pwd-0002','demo-card-u2','',0);

INSERT INTO `eb_store_product_label_cate` (`id`,`name`,`sort`,`add_time`,`is_del`) VALUES
(1,'示例标签分类',10,1600000000,0);

INSERT INTO `eb_store_product_label` (`id`,`name`,`cate_id`,`type`,`font_color`,`bg_color`,`border_color`,`is_show`,`status`,`sort`,`add_time`,`is_del`) VALUES
(1,'新品',1,0,'#ffffff','#ff6600','#ff6600',1,1,10,1600000000,0),
(2,'热卖',1,0,'#ffffff','#e93323','#e93323',1,1,20,1600000000,0);

INSERT INTO `eb_store_product_param` (`id`,`name`,`value`,`sort`,`add_time`,`is_del`,`status`) VALUES
(1,'产地','示例省示例市',10,1600000000,0,1),
(2,'保质期','12 个月',20,1600000000,0,1);

INSERT INTO `eb_store_product_protection` (`id`,`title`,`content`,`image`,`num`,`status`,`sort`,`add_time`,`is_del`) VALUES
(1,'七天无理由','示例服务说明','/uploads/demo/logo.png',0,1,10,1600000000,0),
(2,'假一赔十','示例服务说明','/uploads/demo/logo.png',0,1,20,1600000000,0);

-- 收藏属于用户，而 user 组还没落地，所以这些行会被丢弃并计数。
INSERT INTO `eb_store_product_relation` (`uid`,`product_id`,`type`,`category`,`add_time`) VALUES
(1001,1,'collect','product',1600005000),
(1002,2,'collect','product',1600005100),
(1001,2,'like','product',1600005200);

-- 评价同理：uid 指向还没迁移的用户。
INSERT INTO `eb_store_product_reply` (`id`,`uid`,`oid`,`unique`,`product_id`,`reply_type`,`product_score`,`service_score`,`comment`,`pics`,`add_time`,`is_del`,`is_reply`,`nickname`,`avatar`,`suk`,`status`) VALUES
(1,1001,9001,'demo0001',1,'product',5,5,'示例好评','[]',1600006000,0,0,'示例用户甲','/uploads/demo/logo.png','默认',1),
(2,1002,9002,'demo0002',2,'product',4,5,'示例中评','[]',1600006100,0,1,'示例用户乙','/uploads/demo/logo.png','红,S',1);

-- ---------------------------------------------------------------------------
-- 优惠券
-- ---------------------------------------------------------------------------
-- #3 是会员券（receive_type = 4），新系统没有对应的领取方式，按规则丢弃。
-- #4 已删除。迁移后 coupon_templates 应该正好两行。
INSERT INTO `eb_store_coupon_issue` (`id`,`cid`,`coupon_title`,`start_time`,`end_time`,`total_count`,`remain_count`,`receive_limit`,`is_permanent`,`status`,`is_full_give`,`full_reduction`,`is_del`,`add_time`,`title`,`coupon_price`,`use_min_price`,`coupon_time`,`type`,`receive_type`,`start_use_time`,`end_use_time`,`sort`) VALUES
(1,1,'示例满减券',1600000000,1900000000,100,80,1,0,1,0,'0.00',0,1600000000,'示例满减券','10.00','100.00',30,0,1,0,0,10),
(2,2,'示例品类券',1600000000,1900000000,50,50,1,0,1,0,'0.00',0,1600000000,'示例品类券','5.00','50.00',15,2,1,0,0,20),
(3,3,'示例会员券',1600000000,1900000000,10,10,1,1,1,0,'0.00',0,1600000000,'示例会员券','20.00','200.00',30,0,4,0,0,30),
(4,4,'已删除的券',1600000000,1900000000,10,10,1,0,0,0,'0.00',1,1600000000,'已删除的券','1.00','10.00',7,0,1,0,0,40);

INSERT INTO `eb_store_coupon_product` (`coupon_id`,`product_id`,`category_id`) VALUES
(2,0,2),
(1,1,0);

INSERT INTO `eb_store_product_coupon` (`id`,`product_id`,`issue_coupon_id`,`add_time`,`title`) VALUES
(1,1,1,1600000000,'示例满减券');

-- 已领取的券属于用户，user 组未落地，所以会被丢弃并计数。
INSERT INTO `eb_store_coupon_user` (`id`,`cid`,`uid`,`coupon_title`,`coupon_price`,`use_min_price`,`add_time`,`start_time`,`end_time`,`use_time`,`type`,`status`,`is_fail`) VALUES
(1,1,1001,'示例满减券','10.00','100.00',1600007000,1600007000,1900000000,0,'get',0,0),
(2,1,1002,'示例满减券','10.00','100.00',1600007100,1600007100,1900000000,1600008000,'get',1,0);

-- ---------------------------------------------------------------------------
-- DIY 页面与主题
-- ---------------------------------------------------------------------------
-- value 是 JSON。CR-1-g1：迁移后要按"解析成 JSON 再深比较"验证，而不是比字节，
-- 因为 jsonb 会重排节点内部的键序。
INSERT INTO `eb_diy` (`id`,`version`,`name`,`template_name`,`value`,`default_value`,`add_time`,`update_time`,`status`,`type`,`is_show`,`is_bg_color`,`is_bg_pic`,`color_picker`,`bg_pic`,`bg_tab_val`,`is_del`,`is_diy`,`title`) VALUES
(1,'1.0','示例首页','','{\"is_diy\":1,\"title\":\"示例首页\",\"name\":\"首页\",\"value\":[{\"name\":\"headerSerch\",\"num\":0,\"timestamp\":1600000000},{\"name\":\"swiperBg\",\"num\":1,\"timestamp\":1600000001}]}','',1600000000,1600000000,1,0,1,0,0,'#ffffff','',1,0,1,'示例首页'),
(2,'1.0','示例活动页','','{\"is_diy\":1,\"title\":\"示例活动页\",\"value\":[{\"name\":\"titles\",\"num\":0}]}','',1600000100,1600000100,0,0,1,0,0,'#f5f5f5','',1,0,1,'示例活动页'),
(3,'1.0','商品详情模板','product_detail','{\"value\":[{\"name\":\"detail\",\"num\":0}]}','',1600000200,1600000200,1,1,1,0,0,'#ffffff','',1,0,1,'商品详情模板'),
-- 下面两行不是页面：template_name = category / member 的行，value 是运营挑的
-- 内置版式编号（一个裸数字）。它们是 diy 配置组的 categoryLayout /
-- userCenterLayout，由 config group 搬进 config_values；不搬的话，迁完的商城
-- 前台「分类」和「我的」两页会悄悄回到版式一。
(4,'1.0','分类页版式','category','2','',1600000300,1600000300,0,1,0,0,0,'','',0,0,0,''),
(5,'1.0','个人中心版式','member','3','',1600000400,1600000400,0,1,0,0,0,'','',0,0,0,'');

INSERT INTO `eb_theme` (`id`,`version`,`title`,`info`,`type`,`page_type`,`is_use`,`is_del`,`add_time`,`up_time`) VALUES
(1,'1.0','示例主题（橙）','用于测试的主题',0,0,1,0,1600000000,1600000000),
(2,'1.0','示例主题（蓝）','用于测试的主题',0,0,0,0,1600000100,1600000100);

INSERT INTO `eb_page_categroy` (`id`,`pid`,`type`,`name`,`sort`,`status`,`add_time`) VALUES
(1,0,0,'示例链接分类',10,1,1600000000),
(2,1,0,'示例子分类',20,1,1600000000);

INSERT INTO `eb_page_link` (`id`,`cate_id`,`type`,`name`,`url`,`param`,`example`,`status`,`sort`,`add_time`) VALUES
(1,1,0,'示例首页链接','/pages/index/index','','',1,10,1600000000),
(2,1,0,'示例分类链接','/pages/goods_cate/goods_cate','','',1,20,1600000000),
(3,2,0,'示例商品详情','/pages/goods_details/index','id','id=1',1,30,1600000000);

-- ---------------------------------------------------------------------------
-- 会员
-- ---------------------------------------------------------------------------
-- #1001 是 bcrypt（登录过），#1002 是旧的 md5（没登录过），#1003 已删除。
-- pwd 的取值都是随手编的，不对应任何真实口令。
-- account 故意放了一对只有大小写不同的（demo_vip / DEMO_VIP）：MySQL 的
-- utf8mb4_general_ci 认为它们相同，PostgreSQL 的 lower(account) 唯一索引也认为
-- 相同，所以迁移必须发现这个冲突而不是在插入时炸掉。这里让后者已删除，
-- 于是冲突是可以自动化解的。
INSERT INTO `eb_user` (`uid`,`account`,`pwd`,`real_name`,`birthday`,`mark`,`group_id`,`nickname`,`avatar`,`phone`,`add_time`,`add_ip`,`last_time`,`last_ip`,`status`,`login_type`,`is_del`) VALUES
(1001,'demo_vip','$2y$10$abcdefghijklmnopqrstuuMB1NOe2Z1lVjYlLhCzs8eUgcL2eHKab','示例用户甲',0,'示例备注',1,'示例用户甲','/uploads/demo/logo.png','13000000001',1600000000,'10.0.0.1',1700000000,'10.0.0.2',1,'h5',0),
(1002,'demo_user','0123456789abcdef0123456789abcdef','示例用户乙',0,'',2,'示例用户乙','/uploads/demo/logo.png','13000000002',1600000100,'10.0.0.3',0,'',1,'wechat',0),
(1003,'DEMO_VIP','fedcba9876543210fedcba9876543210','已注销的用户',0,'',0,'已注销','','13000000003',1600000200,'10.0.0.4',0,'',0,'h5',1);

-- city_id 指向城市字典（新库的 cities，由 packages/db 的种子数据写入，并沿用旧库的
-- id）。前两行用 1，真实种子数据里就是"北京市"；第三行用 0，旧库里 0 表示"没有选中
-- 城市"，迁移后必须是 NULL，而不是一条指向 id 0 的外键；第四行用一个字典里根本
-- 没有的 id——旧库被人手工加过城市、或者字典这些年被改过，都会出现这种行。它必须
-- 落成 NULL 并被计数，而不是让整个 user group 因为一条外键而全部回滚（CR-3-j）。
INSERT INTO `eb_user_address` (`id`,`uid`,`real_name`,`phone`,`province`,`city`,`city_id`,`district`,`detail`,`post_code`,`is_default`,`is_del`,`add_time`) VALUES
(1,1001,'示例用户甲','13000000001','示例省','示例市',1,'示例区','示例路 1 号','000000',1,0,1600000000),
(2,1001,'示例用户甲','13000000001','示例省','示例市',1,'示例区','示例路 2 号','000000',0,0,1600000100),
(3,1002,'示例用户乙','13000000002','示例省','示例市',0,'示例区','示例路 3 号','000000',1,0,1600000200),
(4,1002,'示例用户乙','13000000002','示例省','示例市',999999,'示例区','示例路 4 号','000000',0,0,1600000300);

INSERT INTO `eb_user_group` (`id`,`group_name`) VALUES
(1,'示例分组甲'),
(2,'示例分组乙');

-- label_cate 指向一个根本不存在的表，mapper 需要自己把分类补出来。
INSERT INTO `eb_user_label` (`id`,`label_cate`,`label_name`) VALUES
(1,1,'示例标签甲'),
(2,1,'示例标签乙'),
(3,2,'示例标签丙');

INSERT INTO `eb_user_label_relation` (`uid`,`label_id`) VALUES
(1001,1),
(1001,3),
(1002,2);

INSERT INTO `eb_user_cancel` (`id`,`uid`,`name`,`phone`,`add_time`,`status`,`up_time`,`remark`) VALUES
(1,1003,'已注销','13000000003',1600000300,1,1600000400,'示例注销申请');

INSERT INTO `eb_wechat_user` (`id`,`uid`,`unionid`,`openid`,`nickname`,`headimgurl`,`sex`,`city`,`province`,`country`,`subscribe`,`subscribe_time`,`add_time`,`user_type`,`is_del`) VALUES
(1,1002,'','oDemoOpenId00000000000001','示例用户乙','/uploads/demo/logo.png',1,'示例市','示例省','中国',1,1600000100,1600000100,'wechat',0);

-- ---------------------------------------------------------------------------
-- 运费模板与快递公司
-- ---------------------------------------------------------------------------
-- #1 按件计费，有兜底规则（province_id = city_id = 0）、一条覆盖两个城市的规则
-- （同一个 uniqid 下每个城市一行，迁移后并成一条规则两个城市）、一条只指向字典
-- 里没有的城市的规则（整条丢弃并计数）。#2 没有兜底规则，迁移时补一条零运费的。
-- temp_id = 99 的那行没有模板，丢弃并计数。
INSERT INTO `eb_shipping_templates` (`id`,`name`,`type`,`appoint`,`no_delivery`,`sort`,`add_time`) VALUES
(1,'示例运费模板（按件）',1,1,1,10,1600000000),
(2,'示例运费模板（按重量）',2,0,0,20,1600000100);

INSERT INTO `eb_shipping_templates_region` (`id`,`province_id`,`temp_id`,`city_id`,`first`,`first_price`,`continue`,`continue_price`,`type`,`uniqid`) VALUES
(1,0,1,0,'1.00','10.00','1.00','5.00',1,'demo-r-all'),
(2,1,1,2,'1.00','8.00','1.00','3.00',1,'demo-r-bj'),
(3,1,1,3,'1.00','8.00','1.00','3.00',1,'demo-r-bj'),
(4,0,1,888888,'1.00','20.00','1.00','10.00',1,'demo-r-gone'),
(5,0,99,0,'1.00','1.00','1.00','1.00',1,'demo-r-orphan');

-- #2 既没有件数门槛也没有金额门槛：新 CHECK 不允许，而且它等于"无条件包邮"，丢弃并计数。
INSERT INTO `eb_shipping_templates_free` (`id`,`province_id`,`temp_id`,`city_id`,`number`,`price`,`type`,`uniqid`) VALUES
(1,1,1,2,'3.00','99.00',1,'demo-f-bj'),
(2,0,1,0,'0.00','0.00',1,'demo-f-none');

-- 第二行的城市字典里没有，丢弃并计数。
INSERT INTO `eb_shipping_templates_no_delivery` (`id`,`province_id`,`temp_id`,`city_id`,`uniqid`) VALUES
(1,1,1,3,'demo-n'),
(2,0,1,888888,'demo-n');

-- 商品乙按模板计运费（freight = 3，temp_id = 1）。shipping 排在 catalog 前面，
-- 所以它的 shipping_template_id 保得住；模板没迁过来的话会降级成固定运费并计数。
UPDATE `eb_store_product` SET `freight` = 3 WHERE `id` = 2;

-- 快递公司字典由种子写入，id 沿用安装脚本（顺丰 #2、圆通 #3、中通 #4）；旧库
-- 只带运营改过的排序与显示开关，按 id 覆盖到种子行上。#2000 是运营自己加的一家，
-- 编码却和种子里的 #4 撞了：新表 code 唯一，它留给种子并计数，而不是让整次迁移失败。
INSERT INTO `eb_express` (`id`,`code`,`name`,`sort`,`is_show`,`status`) VALUES
(2,'shunfeng','顺丰速运',10,1,1),
(3,'yuantong','圆通速递',20,0,1),
(2000,'zhongtong','中通（运营自建）',30,1,1);

-- ---------------------------------------------------------------------------
-- 文章
-- ---------------------------------------------------------------------------
-- 删除的分类也迁移（带 deleted_at）。文章乙的 product_id 指向不存在的商品：
-- 文章留下、链接清空并计数。nid = 99 的正文没有文章，丢弃并计数。
-- 文章甲的正文里有一段 <script>，要被和后台编辑器同一个清洗函数洗掉。
INSERT INTO `eb_article_category` (`id`,`pid`,`title`,`intr`,`image`,`status`,`sort`,`is_del`,`add_time`,`hidden`) VALUES
(1,0,'示例资讯','示例栏目简介','',1,10,0,'1600000000',0),
(2,1,'示例子栏目','','',1,5,0,'1600000100',0),
(3,0,'已删除的栏目','','',1,0,1,'1600000200',0);

INSERT INTO `eb_article` (`id`,`cid`,`title`,`author`,`image_input`,`synopsis`,`share_title`,`share_synopsis`,`visit`,`sort`,`url`,`status`,`add_time`,`hide`,`admin_id`,`mer_id`,`product_id`,`is_hot`,`is_banner`) VALUES
(1,'1','示例文章甲','示例作者','/uploads/demo/banner.jpg','示例摘要甲','','','12',10,'',1,'1600001000',0,1,0,1,1,0),
(2,'2','示例文章乙','示例作者','','示例摘要乙','','','3',5,'',1,'1600001100',0,1,0,99,0,0);

INSERT INTO `eb_article_content` (`nid`,`content`) VALUES
(1,'<p>示例正文甲。</p><script>alert(1)</script>'),
(2,'<p>示例正文乙。</p>'),
(99,'<p>没有文章的正文。</p>');

-- ---------------------------------------------------------------------------
-- 公众号
-- ---------------------------------------------------------------------------
-- 菜单在 eb_cache 里（key = wechat_menus）；另一行缓存与公众号无关，不读。
INSERT INTO `eb_cache` (`key`,`result`,`expire_time`,`add_time`) VALUES
('wechat_menus','[{\"name\":\"商城\",\"type\":\"view\",\"url\":\"https://shop.example.invalid/\"}]',0,1600000000),
('demo_other_cache','{}',0,1600000000);

-- 回复 #3 没有任何关键词，#4 的类型不认识，都丢弃并计数；关键词 #4 是客服消息
-- （key_type = 1），丢弃并计数；#5 属于那条类型不认识的回复。
INSERT INTO `eb_wechat_reply` (`id`,`type`,`data`,`status`,`hide`) VALUES
(1,'text','{\"content\":\"欢迎关注示例商城\"}',1,0),
(2,'text','{\"content\":\"营业时间 9:00-18:00\"}',1,0),
(3,'text','{\"content\":\"没有关键词的回复\"}',1,0),
(4,'demo_unknown_kind','{}',1,0);

INSERT INTO `eb_wechat_key` (`id`,`reply_id`,`keys`,`key_type`) VALUES
(1,1,'subscribe',0),
(2,2,'营业时间',0),
(3,2,'几点开门',0),
(4,2,'人工客服',1),
(5,4,'未知类型',0);

-- 两个同名的在线分类：新表每个名字只允许一个在线分类，后一个改名为 线下门店（#2）。
INSERT INTO `eb_wechat_qrcode_cate` (`id`,`cate_name`,`add_time`,`is_del`) VALUES
(1,'线下门店',1600000000,0),
(2,'线下门店',1600000100,0),
(3,'已删除的分类',1600000200,1);

-- #2 在 eb_qrcode 里没有 ticket：从来没在微信侧生成过，丢弃并计数。
INSERT INTO `eb_wechat_qrcode` (`id`,`uid`,`name`,`image`,`cate_id`,`label_id`,`type`,`content`,`data`,`follow`,`scan`,`add_time`,`continue_time`,`end_time`,`status`,`is_del`) VALUES
(1,0,'示例门店海报','',1,'','text','','{\"content\":\"欢迎光临示例门店\"}',3,10,1600000300,0,0,1,0),
(2,0,'没生成的码','',2,'','text','','{\"content\":\"占位\"}',0,0,1600000400,0,0,1,0);

INSERT INTO `eb_qrcode` (`id`,`third_type`,`third_id`,`ticket`,`expire_seconds`,`status`,`add_time`,`url`,`qrcode_url`,`scan`,`type`) VALUES
(1,'wechatqrcode',1,'gQDemoTicket0001',0,1,'1600000300','https://mp.weixin.example.invalid/q/demo0001','',10,0),
(2,'demo_other',1,'',0,1,'1600000300','','',0,0);

-- 扫码记录：#2 的用户不存在，保留记录但清空 user_id；#3 属于被丢弃的码，丢弃并计数。
INSERT INTO `eb_wechat_qrcode_record` (`id`,`qid`,`uid`,`is_follow`,`add_time`) VALUES
(1,1,1002,1,1600000500),
(2,1,4040,0,1600000600),
(3,2,1001,0,1600000700);

-- #2 是临时素材，早就过了三天有效期；#3 没有 media_id。都丢弃并计数。
INSERT INTO `eb_wechat_media` (`id`,`type`,`path`,`media_id`,`url`,`temporary`,`add_time`) VALUES
(1,'image','/uploads/demo/logo.png','DemoMediaId0001','https://mmbiz.example.invalid/demo1',0,1600000000),
(2,'voice','','DemoMediaId0002','',1,1600000000),
(3,'image','','','',0,1600000000);

-- ---------------------------------------------------------------------------
-- 通知模板与站内信
-- ---------------------------------------------------------------------------
-- #3 的 mark 属于已经下线的分销功能，注册表里没有对应事件，点名丢弃。
INSERT INTO `eb_system_notification` (`id`,`mark`,`name`,`title`,`is_system`,`system_title`,`system_text`,`is_wechat`,`wechat_tempkey`,`wechat_tempid`,`is_routine`,`is_sms`,`sms_id`,`sms_text`,`variable`,`type`,`add_time`) VALUES
(1,'order_pay_success','支付成功','用户下单支付成功后通知',1,'支付成功','您的订单{order_id}已支付{pay_price}元',1,'OPENTM000001','demo-tpl-0001',0,1,'DEMO_SMS_0001','您的订单{order_id}已支付','order_id,pay_price',1,1600000000),
(2,'order_take','确认收货','用户确认收货后通知',1,'确认收货','订单{order_id}已确认收货',0,'','',0,0,'','','order_id',1,1600000000),
(3,'revenue_received','收益到账','佣金到账提醒',1,'收益到账','示例',0,'','',0,0,'','','',1,1600000000),
(4,'admin_pay_success_code','用户支付成功','新订单提醒管理员',1,'新订单','订单{order_id}已支付',0,'','',0,0,'','','order_id',2,1600000000);

-- #3 的收件人不存在，#4 已删除，都丢弃并计数；#5 发给管理员 #1。
INSERT INTO `eb_message_system` (`id`,`mark`,`uid`,`title`,`content`,`data`,`look`,`type`,`add_time`,`is_del`) VALUES
(1,'order_pay_success',1002,'支付成功','您的订单已支付','{\"order_id\":\"DEMO0001\"}',0,1,1600009000,0),
(2,'',1001,'系统公告','示例公告','',1,1,1600009100,0),
(3,'order_take',5050,'确认收货','示例','',0,1,1600009200,0),
(4,'order_take',1002,'确认收货','示例','',0,1,1600009300,1),
(5,'admin_pay_success_code',1,'新订单','订单已支付','',0,2,1600009400,0);

-- ---------------------------------------------------------------------------
-- 拼团
-- ---------------------------------------------------------------------------
-- #2 一人成团（新 CHECK 不允许）、#3 已删除、#4 的商品不存在，都丢弃并计数。
-- #5 的运费模板 77 不存在：活动留下、模板清空并计数；它的 virtual = 80（虚拟成团
-- 百分比）新系统没有，计数。
INSERT INTO `eb_store_combination` (`id`,`product_id`,`image`,`images`,`title`,`info`,`people`,`price`,`sort`,`sales`,`stock`,`add_time`,`is_show`,`is_del`,`start_time`,`stop_time`,`effective_time`,`cost`,`browse`,`temp_id`,`num`,`once_num`,`quota`,`quota_show`,`virtual`) VALUES
(1,2,'/uploads/demo/goods-1.png','[]','示例拼团乙','三人成团',3,'79.00',10,2,20,'1600010000',1,0,1600010000,1900000000,24,60,5,1,2,2,10,10,100),
(2,1,'/uploads/demo/goods-1.png','[]','一人成团','',1,'9.90',0,0,5,'1600010100',1,0,1600010000,1900000000,24,10,0,1,1,1,5,5,100),
(3,1,'/uploads/demo/goods-1.png','[]','已删除的拼团','',2,'9.90',0,0,5,'1600010200',1,1,1600010000,1900000000,24,10,0,1,1,1,5,5,100),
(4,99,'','[]','商品不存在的拼团','',2,'9.90',0,0,5,'1600010300',1,0,1600010000,1900000000,24,10,0,1,1,1,5,5,100),
(5,1,'/uploads/demo/goods-1.png','[]','示例拼团甲','两人成团',2,'15.90',5,0,10,'1600010400',1,0,1600010000,1900000000,0,10,0,77,1,1,0,0,80);

-- 团是订单的一部分，不迁移，只计数。
INSERT INTO `eb_store_pink` (`id`,`uid`,`order_id`,`order_id_key`,`total_num`,`total_price`,`cid`,`pid`,`people`,`price`,`add_time`,`stop_time`,`status`) VALUES
(1,1001,'DEMO-PINK-0001',1,1,'79.00',1,2,3,'79.00','1600011000','1600097400',1),
(2,1002,'DEMO-PINK-0002',2,1,'79.00',1,2,3,'79.00','1600011100','1600097500',1);

-- ---------------------------------------------------------------------------
-- 预售
-- ---------------------------------------------------------------------------
-- #2 已删除、#3 的商品不存在，丢弃并计数。
INSERT INTO `eb_store_advance` (`id`,`product_id`,`image`,`images`,`title`,`info`,`price`,`ot_price`,`sort`,`stock`,`sales`,`unit_name`,`start_time`,`stop_time`,`add_time`,`status`,`is_del`,`type`,`deposit`,`pay_start_time`,`pay_stop_time`,`deliver_time`,`num`,`temp_id`,`quota`,`quota_show`,`once_num`) VALUES
(1,2,'/uploads/demo/goods-1.png','[]','示例预售乙','定金预售','89.00','129.00',10,20,1,'盒','1600020000','1900000000','1600020000',1,0,1,'20.00','1900000000','1900086400',3,1,1,10,10,1),
(2,1,'/uploads/demo/goods-1.png','[]','已删除的预售','','9.90','9.90',0,5,0,'件','1600020000','1900000000','1600020100',1,1,0,'0.00','','',3,1,1,5,5,1),
(3,99,'','[]','商品不存在的预售','','9.90','9.90',0,5,0,'件','1600020000','1900000000','1600020200',1,0,0,'0.00','','',3,1,1,5,5,1);

-- 订单不迁移：这张表只用来数"有几张预售订单被留下"（advance_id > 0 的那张）。
INSERT INTO `eb_store_order` (`id`,`order_id`,`uid`,`unique`,`advance_id`,`add_time`) VALUES
(1,'DEMO-ADV-0001',1002,'demo-order-u1',1,1600021000),
(2,'DEMO-ORD-0002',1001,'demo-order-u2',0,1600021100);

-- 活动价行：和普通 SKU 同一张表，type = 3 是拼团、type = 6 是预售，product_id
-- 是活动 id。拼团 #1 的「绿,L」和预售 #1 的「黑,XL」商品上没有这个规格，丢弃并计数。
INSERT INTO `eb_store_product_attr_value` (`id`,`product_id`,`suk`,`stock`,`sales`,`price`,`image`,`unique`,`cost`,`bar_code`,`ot_price`,`vip_price`,`weight`,`volume`,`type`,`quota`,`quota_show`) VALUES
(101,1,'红,S',5,1,'79.00','','demo0101','60.00','','99.00','0.00','0.00','0.00',3,5,5),
(102,1,'红,M',5,1,'79.00','','demo0102','60.00','','99.00','0.00','0.00','0.00',3,5,5),
(103,1,'绿,L',5,0,'79.00','','demo0103','60.00','','99.00','0.00','0.00','0.00',3,5,5),
(104,5,'默认',10,0,'15.90','','demo0104','10.00','','19.90','0.00','0.00','0.00',3,0,0),
(111,1,'蓝,S',5,0,'89.00','','demo0111','60.00','','109.00','0.00','0.00','0.00',6,5,5),
(112,1,'蓝,M',5,1,'89.00','','demo0112','60.00','','109.00','0.00','0.00','0.00',6,5,5),
(113,1,'黑,XL',5,0,'89.00','','demo0113','60.00','','109.00','0.00','0.00','0.00',6,5,5);

SET FOREIGN_KEY_CHECKS = 1;
