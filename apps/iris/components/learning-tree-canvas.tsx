"use client"

import {
  type CardRelation,
  getRelationLabel,
  type LearningTreeBranch
} from "@/lib/learning-tree"
import {
  Background,
  Controls,
  type Edge,
  Handle,
  MiniMap,
  type Node as FlowNode,
  type NodeProps,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState
} from "@xyflow/react"
import { type FC, useEffect, useMemo } from "react"

interface LearningTreeNodeData extends Record<string, unknown> {
  branch: LearningTreeBranch
  active: boolean
  childCount: number
  onActivate: (branchId: string) => void
  onCreate: (
    source: LearningTreeBranch,
    relation: Exclude<CardRelation, "root">
  ) => void
  onDelete: (branch: LearningTreeBranch) => void
}

interface LearningTreeCanvasProps {
  branches: LearningTreeBranch[]
  activeBranchId: string
  onActivate: (branchId: string) => void
  onCreate: (
    source: LearningTreeBranch,
    relation: Exclude<CardRelation, "root">
  ) => void
  onDelete: (branch: LearningTreeBranch) => void
  onMove: (branchId: string, x: number, y: number) => void
}

const LearningTreeNode: FC<NodeProps> = ({ data }) => {
  const {
    branch,
    active,
    childCount,
    onActivate,
    onCreate,
    onDelete
  } = data as LearningTreeNodeData
  const latest = [...branch.entries].reverse().find(entry => entry.text)

  return (
    <article className={`tree-node${active ? " active" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <header
        className="tree-node-drag-handle"
        onClick={() => onActivate(branch.id)}
      >
        <div>
          <strong>{branch.name}</strong>
          <span>
            {getRelationLabel(branch.relation)} · {branch.entries.length} 条消息
          </span>
        </div>
        <nav className="nodrag" aria-label={`${branch.name} 分支操作`}>
          <button
            type="button"
            title="创建深入子卡片"
            onClick={() => onCreate(branch, "child")}
          >
            +
          </button>
          <button
            type="button"
            title="创建同级发散卡片"
            onClick={() => onCreate(branch, "divergent")}
          >
            ↗
          </button>
          <button
            type="button"
            title="从当前记录创建历史分支"
            disabled={branch.entries.length === 0}
            onClick={() => onCreate(branch, "branch")}
          >
            ⑂
          </button>
          {branch.relation !== "root" ? (
            <button
              type="button"
              className="danger"
              title="删除卡片"
              onClick={() => onDelete(branch)}
            >
              ×
            </button>
          ) : null}
        </nav>
      </header>
      <button
        type="button"
        className="tree-node-body nodrag"
        onClick={() => onActivate(branch.id)}
      >
        {branch.sourceQuote ? <q>{branch.sourceQuote}</q> : null}
        <span>{latest?.text || "打开对话继续探索"}</span>
        <small>{childCount} 个直接分支</small>
      </button>
      <Handle type="source" position={Position.Right} />
    </article>
  )
}

const nodeTypes = { learningBranch: LearningTreeNode }

export function LearningTreeCanvas({
  branches,
  activeBranchId,
  onActivate,
  onCreate,
  onDelete,
  onMove
}: LearningTreeCanvasProps) {
  const flowNodes = useMemo<FlowNode<LearningTreeNodeData>[]>(
    () =>
      branches.map(branch => ({
        id: branch.id,
        type: "learningBranch",
        position: { x: branch.x, y: branch.y },
        dragHandle: ".tree-node-drag-handle",
        data: {
          branch,
          active: branch.id === activeBranchId,
          childCount: branches.filter(item => item.parentId === branch.id)
            .length,
          onActivate,
          onCreate,
          onDelete
        }
      })),
    [activeBranchId, branches, onActivate, onCreate, onDelete]
  )
  const flowEdges = useMemo<Edge[]>(
    () =>
      branches
        .filter(branch => branch.parentId)
        .map(branch => ({
          id: `${branch.parentId}-${branch.id}`,
          source: branch.parentId!,
          target: branch.id,
          animated: branch.id === activeBranchId,
          label:
            branch.relation === "child"
              ? "深入"
              : branch.relation === "divergent"
                ? "发散"
                : "分支",
          style: { strokeWidth: branch.id === activeBranchId ? 2 : 1.5 }
        })),
    [activeBranchId, branches]
  )
  const [nodes, setNodes, onNodesChange] =
    useNodesState<FlowNode<LearningTreeNodeData>>(flowNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(flowEdges)

  useEffect(() => setNodes(flowNodes), [flowNodes, setNodes])
  useEffect(() => setEdges(flowEdges), [flowEdges, setEdges])

  return (
    <div className="learning-tree-canvas">
      <ReactFlow<FlowNode<LearningTreeNodeData>, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={(_, node) =>
          onMove(node.id, node.position.x, node.position.y)
        }
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.25}
        maxZoom={1.4}
        nodesConnectable={false}
        nodesFocusable={false}
        elementsSelectable={false}
        panOnDrag
        selectionOnDrag={false}
        zoomOnDoubleClick={false}
      >
        <Background gap={28} size={1} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  )
}
