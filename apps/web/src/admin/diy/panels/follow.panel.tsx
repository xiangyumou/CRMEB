'use client';

import { followSchema, type FollowComponent } from '@shop/contracts/diy/schema/follow.schema';

import { followDefault } from '../defaults/follow.default';
import {
  DiyCommonStyleSection,
  DiyInputField,
  DiySection,
  DiySetUpTabs,
  DiyTabsField,
  DiyUploadField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';

/**
 * 关注公众号.
 *
 * Four one-row sections on the content tab, each with its own heading from the
 * node (`titleLeft`, `positionTitle`, `pictrueTitle` — misspelled in the payload
 * — and `codeTitle`).
 *
 * `themeColor` (按钮颜色) has no row: the style tab is `titleRight` plus
 * `c_common_style`, and `c_common_style` has no `themeColor` row. There is no
 * 关注按钮 heading either, rather than one with nothing under it; the stored
 * colour is carried through untouched.
 */
export default defineDiyPanel<FollowComponent>({
  key: 'follow',
  schema: followSchema,
  createDefault: () => structuredClone(followDefault),
  label: '关注公众号',
  description: '公众号关注引导，带二维码',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    return (
      <>
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleLeft ?? '标题设置'} when={f.tab === 0}>
          <DiyInputField {...f.bind('titleConfig')} />
        </DiySection>

        <DiySection title={value.positionTitle ?? '位置设置'} when={f.tab === 0}>
          <DiyTabsField {...f.bind('positionConfig')} />
        </DiySection>

        <DiySection title={value.pictrueTitle ?? '图片设置'} when={f.tab === 0}>
          <DiyUploadField
            {...f.bind('imgConfig')}
            label="上传图片"
            tip={typeof value.imgConfig?.info === 'string' ? value.imgConfig.info : undefined}
          />
        </DiySection>

        <DiySection title={value.codeTitle ?? '关注二维码'} when={f.tab === 0}>
          <DiyUploadField {...f.bind('codeConfig')} label="上传二维码" />
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
