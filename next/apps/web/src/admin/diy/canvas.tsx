'use client';

import {
  CopyOutlined,
  DeleteOutlined,
  DownOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  HolderOutlined,
  UpOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Empty, Tooltip } from 'antd';
import type { CSSProperties, ReactNode } from 'react';

import { useDiyEditor } from './editor-context';
import { componentLabel } from './palette';
import { DiyPreview } from './preview';
import { DIY_PAGE_SELECTION, isPinned, type DiyEditorNode } from './store';

/**
 * The middle pane: the page as a phone-width column.
 *
 * Selection, ordering and per-row actions mirror the legacy canvas
 * (`diyIndex.vue:120`): hide, delete, duplicate, move up, move down — in that
 * order, on hover, over the top-right of the row. Hiding never deletes; an
 * `isHide` node stays in the saved page and is skipped by the renderer
 * (`pageDesign.vue:554`), which is the whole point of having the flag.
 */

const PHONE_WIDTH = 375;

export function DiyCanvas() {
  const { state, dispatch, readOnly, theme } = useDiyEditor();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = state.nodes.findIndex((node) => node.uid === active.id);
    const to = state.nodes.findIndex((node) => node.uid === over.id);
    if (from < 0 || to < 0) return;
    dispatch({ type: 'move', from, to });
  };

  const background = state.meta.background;
  const canvasStyle: CSSProperties = {
    width: PHONE_WIDTH,
    margin: '0 auto',
    minHeight: 480,
    background: background?.color ?? '#f5f5f5',
    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  };
  if (background?.imageUrl) {
    canvasStyle.backgroundImage = `url(${background.imageUrl})`;
    canvasStyle.backgroundRepeat = background.imageMode === 'repeat' ? 'repeat' : 'no-repeat';
    canvasStyle.backgroundSize = background.imageMode === 'full' ? '100% 100%' : 'contain';
    if (background.imageMode === 'fixed') canvasStyle.backgroundAttachment = 'fixed';
  }

  return (
    <div style={{ padding: '16px 0' }}>
      <div style={canvasStyle}>
        <button
          type="button"
          onClick={() => dispatch({ type: 'select', uid: DIY_PAGE_SELECTION })}
          style={{
            display: 'block',
            width: '100%',
            padding: '10px 12px',
            border: 'none',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            background:
              state.selected === DIY_PAGE_SELECTION
                ? 'rgba(22,119,255,0.12)'
                : 'rgba(255,255,255,0.7)',
            textAlign: 'center',
            font: 'inherit',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          {state.meta.title || state.meta.name}
        </button>

        {state.nodes.length === 0 ? (
          <Empty
            style={{ padding: '80px 0' }}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="从左侧选择组件添加到页面"
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={state.nodes.map((node) => node.uid)}
              strategy={verticalListSortingStrategy}
            >
              {state.nodes.map((node, index) => (
                <CanvasRow
                  key={node.uid}
                  node={node}
                  index={index}
                  last={index === state.nodes.length - 1}
                  readOnly={readOnly}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}

        {state.footer ? (
          <button
            type="button"
            onClick={() => dispatch({ type: 'select', uid: state.footer?.uid ?? '' })}
            style={{
              display: 'block',
              width: '100%',
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              outline:
                state.selected === state.footer.uid
                  ? '2px solid var(--ant-color-primary, #1677ff)'
                  : 'none',
            }}
          >
            <DiyPreview value={state.footer.value} theme={theme.theme} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CanvasRow({
  node,
  index,
  last,
  readOnly,
}: {
  node: DiyEditorNode;
  index: number;
  last: boolean;
  readOnly: boolean;
}) {
  const { state, dispatch, theme } = useDiyEditor();
  const pinned = isPinned(node.value);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.uid,
    disabled: readOnly || pinned,
  });
  const selected = state.selected === node.uid;
  const hidden = node.value.isHide === true;

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'relative',
    opacity: isDragging ? 0.6 : hidden ? 0.45 : 1,
    outline: selected ? '2px solid var(--ant-color-primary, #1677ff)' : 'none',
    outlineOffset: -2,
    cursor: 'pointer',
  };

  const label = componentLabel(typeof node.value.name === 'string' ? node.value.name : '');

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => dispatch({ type: 'select', uid: node.uid })}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          dispatch({ type: 'select', uid: node.uid });
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
    >
      <DiyPreview value={node.value} theme={theme.theme} />

      {selected ? (
        <span
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            padding: '1px 6px',
            fontSize: 11,
            color: '#fff',
            background: 'var(--ant-color-primary, #1677ff)',
            borderTopRightRadius: 4,
          }}
        >
          {label}
          {hidden ? '（已隐藏）' : null}
        </span>
      ) : null}

      {readOnly ? null : (
        <div
          className="diy-row-actions"
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            display: 'flex',
            gap: 2,
            padding: 2,
            borderRadius: 4,
            background: 'rgba(0,0,0,0.55)',
          }}
        >
          <RowAction
            title={hidden ? '显示' : '隐藏'}
            onClick={() => dispatch({ type: 'toggleHide', uid: node.uid })}
          >
            {hidden ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          </RowAction>
          <RowAction title="删除" onClick={() => dispatch({ type: 'remove', uid: node.uid })}>
            <DeleteOutlined />
          </RowAction>
          <RowAction title="复制" onClick={() => dispatch({ type: 'duplicate', uid: node.uid })}>
            <CopyOutlined />
          </RowAction>
          <RowAction
            title="上移"
            disabled={pinned || index === 0}
            onClick={() => dispatch({ type: 'move', from: index, to: index - 1 })}
          >
            <UpOutlined />
          </RowAction>
          <RowAction
            title="下移"
            disabled={pinned || last}
            onClick={() => dispatch({ type: 'move', from: index, to: index + 1 })}
          >
            <DownOutlined />
          </RowAction>
          {pinned ? null : (
            <span
              {...attributes}
              {...listeners}
              title="拖动排序"
              style={{ color: '#fff', cursor: 'grab', padding: '0 4px', fontSize: 12 }}
            >
              <HolderOutlined />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function RowAction({
  title,
  onClick,
  disabled = false,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip title={title}>
      <button
        type="button"
        aria-label={title}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        style={{
          border: 'none',
          background: 'transparent',
          color: '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.4 : 1,
          padding: '0 4px',
          fontSize: 12,
          lineHeight: 1,
        }}
      >
        {children}
      </button>
    </Tooltip>
  );
}
