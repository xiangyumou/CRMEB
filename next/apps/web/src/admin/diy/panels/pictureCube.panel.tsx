'use client';

import {
  pictureCubeSchema,
  type PictureCubeComponent,
} from '@shop/contracts/diy/schema/pictureCube.schema';

import { pictureCubeDefault } from '../defaults/pictureCube.default';
import {
  DiyCommonStyleSection,
  DiyFilletField,
  DiySection,
  DiySetUpTabs,
  DiySliderField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';
import { DiyCubeCellsField, DiyCubeStyleField } from './_fields';

/**
 * 图片魔方 — ports `c_picture_cube.vue`.
 *
 * The legacy panel is a canvas: pick one of eleven cube layouts, click a cell,
 * and the single-row `c_menu_list` underneath edits that cell. The cells and
 * their links are the payload (`picStyle.picList`), the mirror row is not, so
 * this panel edits the cells directly and leaves `menuConfig` alone. See
 * `_fields/cube.tsx` for why the layout's `count` travels with its index.
 */
export default defineDiyPanel<PictureCubeComponent>({
  key: 'pictureCube',
  schema: pictureCubeSchema,
  createDefault: () => structuredClone(pictureCubeDefault),
  label: '图片魔方',
  description: '一组拼在一起的图片，十一种排布',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);

    return (
      <>
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleLeft ?? '展示设置'} when={f.tab === 0}>
          <DiyCubeStyleField
            {...f.bind('styleConfig')}
            picStyle={value.picStyle}
            onPicStyleChange={(next) => f.patch({ picStyle: next as never })}
          />
        </DiySection>

        <DiySection title={value.titleContent ?? '内容设置'} when={f.tab === 0}>
          <DiyCubeCellsField {...f.bind('picStyle')} />
        </DiySection>

        <DiySection title={value.titleRight ?? '图片魔方'} when={f.tab === 1}>
          <DiySliderField {...f.bind('imgConfig')} min={0} max={30} />
          <DiyFilletField {...f.bind('filletImg')} />
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
