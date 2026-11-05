import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react';
import { getComponentType, CATEGORY_LABEL } from '../library/catalog';
import type { Component, TrustBoundary } from '../model/types';
import type { ComponentProgress } from '../logic/analysis';
import { useStore } from '../state/store';
import { BOUNDARY_KIND_LABEL } from './labels';

export type ComponentNodeData = { component: Component; progress: ComponentProgress };
export type BoundaryNodeData = { boundary: TrustBoundary };

export type ComponentRFNode = Node<ComponentNodeData, 'component'>;
export type BoundaryRFNode = Node<BoundaryNodeData, 'boundary'>;

export function ComponentNode({ data, selected }: NodeProps<ComponentRFNode>) {
  const { component, progress } = data;
  const t = getComponentType(component.type);
  const pct = progress.total ? Math.round((progress.answered / progress.total) * 100) : 100;
  return (
    <div className={`node cat-${t.category} plane-${component.plane} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="target" position={Position.Top} id="t" />
      <div className="node-glyph" aria-hidden>
        {t.glyph}
      </div>
      <div className="node-body">
        <div className="node-name" title={component.name}>
          {component.name}
        </div>
        <div className="node-type">
          {t.label}
          {component.provider ? ` · ${component.provider}` : ''}
        </div>
        {progress.total > 0 && (
          <div className="node-progress" title={`${progress.answered}/${progress.total} answered, ${progress.unknown} unknown`}>
            <div className="node-progress-bar" style={{ width: `${pct}%` }} />
            {progress.unknown > 0 && <span className="node-unknown">{progress.unknown}?</span>}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
      <Handle type="source" position={Position.Bottom} id="b" />
      <span className="sr-only">{CATEGORY_LABEL[t.category]}</span>
    </div>
  );
}

export function BoundaryNode({ data, selected }: NodeProps<BoundaryRFNode>) {
  const { boundary } = data;
  const updateBoundary = useStore((s) => s.updateBoundary);
  return (
    <div className={`boundary ${selected ? 'selected' : ''}`}>
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={100}
        onResizeEnd={(_, p) => updateBoundary(boundary.id, { position: { x: p.x, y: p.y }, width: p.width, height: p.height })}
      />
      <div className="boundary-label">
        {boundary.name}
        <span className="boundary-kind">{BOUNDARY_KIND_LABEL[boundary.kind]}</span>
      </div>
    </div>
  );
}

export const nodeTypes = { component: ComponentNode, boundary: BoundaryNode };
