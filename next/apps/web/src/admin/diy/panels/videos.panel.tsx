'use client';

import { videosSchema, type VideosComponent } from '@shop/contracts/diy/schema/videos.schema';

import { videosDefault } from '../defaults/videos.default';
import {
  DiyCommonStyleSection,
  DiySection,
  DiySetUpTabs,
  DiySliderField,
  DiyTabsField,
  DiyUploadField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';

/**
 * 视频 — ports `c_video.vue`.
 *
 * Its default predates the 内边距 / 外边距 rework and still carries the four
 * scalar sliders `topConfig` / `bottomConfig` / `prConfig` / `mbConfig`. Both
 * the legacy panel and the renderer handle that by *synthesising*
 * `paddingConfig` and `marginConfig` from them — `c_video.vue:patchConfig` and
 * `videos.vue:40-68` build the same four-sided object from the same scalars.
 *
 * The renderer's fallback is the reason this panel can edit the scalars
 * directly instead: a node with no `paddingConfig` renders from `topConfig` and
 * friends, so editing them changes the page exactly as the legacy panel's
 * synthesised spacing would, without this panel writing two objects into a node
 * that never had them. When a node does carry `paddingConfig`, `c_common_style`
 * draws it and the scalars stop mattering — to the renderer too.
 */
export default defineDiyPanel<VideosComponent>({
  key: 'videos',
  schema: videosSchema,
  createDefault: () => structuredClone(videosDefault),
  label: '视频',
  description: '一段视频，带封面与比例',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const legacySpacing = value.paddingConfig === undefined && value.marginConfig === undefined;

    return (
      <>
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleLeft ?? '内容设置'} when={f.tab === 0}>
          <DiyUploadField {...f.bind('videoConfig')} label="上传视频" />
          <DiyUploadField {...f.bind('imgConfig')} label="视频封面" />
          <DiyTabsField {...f.bind('scaleConfig')} />
        </DiySection>

        <DiySection title="边距设置" when={f.tab === 1 && legacySpacing}>
          <DiySliderField {...f.bind('topConfig')} min={0} max={100} />
          <DiySliderField {...f.bind('bottomConfig')} min={0} max={100} />
          <DiySliderField {...f.bind('prConfig')} min={0} max={100} />
          <DiySliderField {...f.bind('mbConfig')} min={0} max={100} />
        </DiySection>

        <DiyCommonStyleSection
          value={value}
          onChange={onChange}
          disabled={ctx.disabled}
          title={value.titleRight}
          when={f.tab === 1}
        />
      </>
    );
  },
});
