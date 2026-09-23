import { Image, View } from '@tarojs/components';

import type { LinkTarget } from '../../schema/link';
import { IMAGE_CUBE_LAYOUTS, type ImageCubeLayout } from '../../schema/constants';
import type { ImageCubeProps } from '../../schema/image-cube';
import { cx, designVars, tapProps } from '../shared/css';
import { BlockFrame } from '../shared/frame';
import type { BlockProps } from '../shared/types';
import styles from './image-cube.module.scss';

type Cell = ImageCubeProps['cells'][number] | undefined;

interface CellProps {
  cell: Cell;
  className?: string | undefined;
  onLink: ((target: LinkTarget) => void) | undefined;
}

function tap(cell: Cell, onLink: CellProps['onLink']) {
  const link = cell?.link;
  return link && onLink ? () => onLink(link) : undefined;
}

/** A composite-layout cell: fills its box. An unset cell is an empty grey box. */
function BoxCell({ cell, className, onLink }: CellProps) {
  return (
    <View className={cx(styles.cell, className)} {...tapProps(tap(cell, onLink))}>
      {cell ? <Image className={styles.fill} src={cell.image} mode="aspectFill" /> : null}
    </View>
  );
}

const ROWS: Partial<Record<ImageCubeLayout, true>> = { row2: true, row3: true, row4: true };

/** 图片魔方: two to four pictures in one of six layouts, each with its own link. */
export function ImageCube({ props, onLink }: BlockProps<ImageCubeProps>) {
  const count = IMAGE_CUBE_LAYOUTS[props.layout].cells;
  const cells: Cell[] = Array.from({ length: count }, (_unused, index) => props.cells[index]);
  const [a, b, c, d] = cells;

  if (ROWS[props.layout]) {
    return (
      <BlockFrame type="imageCube" frame={props.style}>
        <View className={styles.row} style={designVars({ gap: props.gap })}>
          {cells.map((cell, index) => (
            <View
              key={index}
              className={cx(styles.rowCell, index > 0 && styles.gapLeft)}
              {...tapProps(tap(cell, onLink))}
            >
              {cell ? <Image className={styles.rowImage} src={cell.image} mode="widthFix" /> : null}
            </View>
          ))}
        </View>
      </BlockFrame>
    );
  }

  const vars = designVars({ gap: props.gap, height: props.height });
  let body;
  switch (props.layout) {
    case 'left1right2':
      body = (
        <View className={styles.box} style={vars}>
          <BoxCell cell={a} onLink={onLink} />
          <View className={cx(styles.split, styles.column, styles.gapLeft)}>
            <BoxCell cell={b} onLink={onLink} />
            <BoxCell cell={c} onLink={onLink} className={styles.gapTop} />
          </View>
        </View>
      );
      break;
    case 'top1bottom2':
      body = (
        <View className={cx(styles.box, styles.column)} style={vars}>
          <BoxCell cell={a} onLink={onLink} />
          <View className={cx(styles.split, styles.gapTop)}>
            <BoxCell cell={b} onLink={onLink} />
            <BoxCell cell={c} onLink={onLink} className={styles.gapLeft} />
          </View>
        </View>
      );
      break;
    default:
      body = (
        <View className={cx(styles.box, styles.column)} style={vars}>
          <View className={styles.split}>
            <BoxCell cell={a} onLink={onLink} />
            <BoxCell cell={b} onLink={onLink} className={styles.gapLeft} />
          </View>
          <View className={cx(styles.split, styles.gapTop)}>
            <BoxCell cell={c} onLink={onLink} />
            <BoxCell cell={d} onLink={onLink} className={styles.gapLeft} />
          </View>
        </View>
      );
  }

  return (
    <BlockFrame type="imageCube" frame={props.style}>
      {body}
    </BlockFrame>
  );
}
