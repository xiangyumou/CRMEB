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
 * 视频.
 *
 * 视频 nodes carry the four scalar sliders `topConfig` / `bottomConfig` /
 * `prConfig` / `mbConfig`, and some stored ones carry nothing else for
 * spacing. For those, the storefront renderer (`videos.vue`) *synthesises*
 * `paddingConfig` and `marginConfig` from the scalars.
 *
 * That fallback is why this panel edits the scalars directly on such a node:
 * editing them changes the page exactly as synthesised spacing would, without
 * this panel writing two objects into a node that never had them. When a node does carry `paddingConfig`, `c_common_style`
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
    const scalarSpacing = value.paddingConfig === undefined && value.marginConfig === undefined;

    return (
      <>
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleLeft ?? '内容设置'} when={f.tab === 0}>
          <DiyUploadField {...f.bind('videoConfig')} label="上传视频" />
          <DiyUploadField {...f.bind('imgConfig')} label="视频封面" />
          <DiyTabsField {...f.bind('scaleConfig')} />
        </DiySection>

        <DiySection title="边距设置" when={f.tab === 1 && scalarSpacing}>
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
