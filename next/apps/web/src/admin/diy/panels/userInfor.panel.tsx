'use client';

import {
  userInforSchema,
  type UserInforComponent,
} from '@shop/contracts/diy/schema/userInfor.schema';

import { userInforDefault } from '../defaults/userInfor.default';
import {
  DiyCheckboxField,
  DiyColourField,
  DiyCommonStyleSection,
  DiySection,
  DiySetUpTabs,
  DiyTabsField,
  DiyUploadField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';

/**
 * 用户信息 — ports `c_userInfor.vue`: the member card at the top of 个人中心.
 *
 * One index on the style tab, `toneConfig.tabVal`, which unlocks the two
 * progress-bar colours.
 *
 * Like 视频, its default predates the four-sided spacing rework and carries the
 * scalar `topConfig` / `bottomConfig` / `prConfig` / `mbConfig` *as well as*
 * `paddingConfig` and `marginConfig`. Here the four-sided pair is present, so
 * `c_common_style` draws it and the scalars are dead weight the renderer no
 * longer reads — they are left untouched rather than surfaced.
 */
export default defineDiyPanel<UserInforComponent>({
  key: 'userInfor',
  schema: userInforSchema,
  createDefault: () => structuredClone(userInforDefault),
  label: '用户信息',
  description: '个人中心顶部的头像、等级与进度条',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const customTone = Number(value.toneConfig?.tabVal ?? 0) !== 0;

    return (
      <>
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleLeft ?? '展示设置'} when={f.tab === 0}>
          <DiyTabsField {...f.bind('styleConfig')} />
          <DiyCheckboxField {...f.bind('checkboxInfo')} />
        </DiySection>

        <DiySection title={value.titleImg ?? '默认头像'} when={f.tab === 0}>
          <DiyUploadField
            {...f.bind('logoConfig')}
            label="上传图片"
            tip={typeof value.logoConfig?.info === 'string' ? value.logoConfig.info : undefined}
          />
        </DiySection>

        <DiySection title={value.titleRight ?? '进度条'} when={f.tab === 1}>
          <DiyTabsField {...f.bind('toneConfig')} />
          {customTone ? (
            <>
              <DiyColourField {...f.bind('progressColor')} />
              <DiyColourField {...f.bind('progressBgColor')} />
            </>
          ) : null}
        </DiySection>

        <DiyCommonStyleSection
          value={value}
          onChange={onChange}
          disabled={ctx.disabled}
          when={f.tab === 1}
        />
      </>
    );
  },
});
