import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '../state/store';
import { componentProgress, crossedBoundaries, membership, missingFlowLabels, NODE_W, NODE_H } from '../logic/analysis';
import { nodeTypes } from './nodes';
import { useTier } from './hooks';

export const DND_MIME = 'application/x-tm-component';

export function Canvas() {
  const assessment = useStore((s) => s.assessment)!;
  const selection = useStore((s) => s.selection);
  const layers = useStore((s) => s.layers);
  const select = useStore((s) => s.select);
  const addComponent = useStore((s) => s.addComponent);
  const addFlow = useStore((s) => s.addFlow);
  const updateComponent = useStore((s) => s.updateComponent);
  const updateBoundary = useStore((s) => s.updateBoundary);
  const tier = useTier();
  const { screenToFlowPosition } = useReactFlow();

  const builtNodes = useMemo<Node[]>(() => {
    const b: Node[] = assessment.boundaries.map((bd) => ({
      id: bd.id,
      type: 'boundary',
      position: bd.position,
      width: bd.width,
      height: bd.height,
      zIndex: 0,
      hidden: !layers.boundaries,
      selected: selection?.kind === 'boundary' && selection.id === bd.id,
      data: { boundary: bd },
    }));
    const c: Node[] = assessment.components.map((comp) => ({
      id: comp.id,
      type: 'component',
      position: comp.position,
      zIndex: 10,
      hidden: (comp.plane === 'data' && !layers.data) || (comp.plane === 'control' && !layers.control),
      selected: selection?.kind === 'component' && selection.id === comp.id,
      data: { component: comp, progress: componentProgress(assessment, comp, tier) },
    }));
    return [...b, ...c];
  }, [assessment, layers, selection, tier]);

  // Local node state keeps React Flow's measured sizes and live drag positions;
  // the store is updated on drag/resize end.
  const [nodes, setNodes] = useState<Node[]>(builtNodes);
  useEffect(() => {
    setNodes((prev) => {
      const pm = new Map(prev.map((n) => [n.id, n]));
      return builtNodes.map((n) => {
        const p = pm.get(n.id);
        return p ? { ...p, ...n, measured: p.measured } : n;
      });
    });
  }, [builtNodes]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Selection and removal are driven by the store; apply everything else locally.
    setNodes((nds) => applyNodeChanges(changes.filter((c) => c.type !== 'select' && c.type !== 'remove'), nds));
  }, []);

  const edges = useMemo<Edge[]>(() => {
    const members = membership(assessment);
    return assessment.flows.map((f) => {
      const crossing = crossedBoundaries(f, members).length > 0;
      const incomplete = missingFlowLabels(f).length > 0;
      const control = f.plane === 'control';
      const selected = selection?.kind === 'flow' && selection.id === f.id;
      const classes = ['flow', control ? 'control' : 'data', crossing ? 'crossing' : '', incomplete ? 'incomplete' : '', selected ? 'selected' : '']
        .filter(Boolean)
        .join(' ');
      const label = layers.labels ? `${crossing && incomplete ? '⚠ ' : ''}${f.label || '(unlabeled flow)'}${f.dataClassification ? ` · ${f.dataClassification}` : ''}` : undefined;
      return {
        id: f.id,
        source: f.source,
        target: f.target,
        label,
        className: classes,
        selected,
        hidden: (control && !layers.control) || (!control && !layers.data),
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
        zIndex: 5,
      };
    });
  }, [assessment, layers, selection]);

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) addFlow(c.source, c.target);
    },
    [addFlow],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData(DND_MIME);
      if (!type) return;
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addComponent(type, { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 });
    },
    [addComponent, screenToFlowPosition],
  );

  return (
    <div className="canvas" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => select({ kind: n.type === 'boundary' ? 'boundary' : 'component', id: n.id })}
        onEdgeClick={(_, e) => select({ kind: 'flow', id: e.id })}
        onPaneClick={() => select(null)}
        onNodeDragStop={(_, __, dragged) => {
          for (const n of dragged) {
            if (n.type === 'boundary') updateBoundary(n.id, { position: n.position });
            else updateComponent(n.id, { position: n.position });
          }
        }}
        isValidConnection={(c) => c.source !== c.target}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        connectionRadius={30}
        proOptions={{ hideAttribution: true }}
        colorMode="system"
      >
        <Background gap={20} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeStrokeWidth={2} />
      </ReactFlow>
    </div>
  );
}
