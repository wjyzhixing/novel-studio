import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "../styles/graph.css";
import {
  LayoutGrid,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import type {
  EntityKind,
  StoryEntity,
  StoryRelation,
} from "../../../shared/story";
import { formatGraphLayout } from "../utils/flow-layout";

type GraphNodeData = { label: string; kind: string };

function GraphBlock({ data, selected }: NodeProps<Node<GraphNodeData>>) {
  return (
    <div className={`graph-block${selected ? " selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <strong>{data.label}</strong>
      <small>{data.kind}</small>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const graphNodeTypes = { graph: GraphBlock };

const kindLabels: Record<string, string> = {
  character: "人物",
  place: "地点",
  org: "组织",
  item: "物品",
};

function graphNodes(entities: StoryEntity[]): Node<GraphNodeData>[] {
  return entities.map((entity, index) => ({
    id: entity.id,
    type: "graph",
    position: {
      x: (index % 4) * 220 + 40,
      y: Math.floor(index / 4) * 140 + 40,
    },
    data: { label: entity.name, kind: kindLabels[entity.kind] ?? entity.kind },
  }));
}

function graphEdges(
  relations: StoryRelation[],
  entities: StoryEntity[],
): Edge[] {
  const names = new Map(entities.map((entity) => [entity.id, entity.name]));
  return relations
    .filter(
      (relation) => names.has(relation.fromId) && names.has(relation.toId),
    )
    .map((relation) => ({
      id: relation.id,
      source: relation.fromId,
      target: relation.toId,
      label: relation.relationType,
      title: `${names.get(relation.fromId) ?? relation.fromId} — ${relation.relationType} → ${names.get(relation.toId) ?? relation.toId}`,
      animated: false,
    }));
}

export function GraphStudio() {
  const [entities, setEntities] = useState<StoryEntity[]>([]);
  const [relations, setRelations] = useState<StoryRelation[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<GraphNodeData>>(
    [],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [relationType, setRelationType] = useState("");
  const [metadataText, setMetadataText] = useState("{}");
  const [selectedRelation, setSelectedRelation] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<StoryEntity | null>(
    null,
  );
  const [kindFilter, setKindFilter] = useState<"all" | EntityKind>("all");
  const [entityQuery, setEntityQuery] = useState("");
  const [relationQuery, setRelationQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [propertiesWidth, setPropertiesWidth] = useState(320);
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);
  const flowRef = useRef<ReactFlowInstance<Node<GraphNodeData>, Edge> | null>(
    null,
  );

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [entityResult, relationResult] = await Promise.all([
        window.novelAPI.story.listEntities(),
        window.novelAPI.story.listRelations(),
      ]);
      if (!entityResult.ok)
        setNotice(`实体加载失败：${entityResult.error.message}`);
      if (!relationResult.ok)
        setNotice(`关系加载失败：${relationResult.error.message}`);
      const nextEntities = entityResult.ok ? entityResult.data : [];
      const nextRelations = relationResult.ok ? relationResult.data : [];
      setEntities(nextEntities);
      setRelations(nextRelations);
      setNodes(graphNodes(nextEntities));
      setEdges(graphEdges(nextRelations, nextEntities));
    } catch (error: unknown) {
      setNotice(
        `图谱加载失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setLoading(false);
    }
  }, [setEdges, setNodes]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const entityOptions = useMemo(
    () =>
      entities.map((entity) => ({
        id: entity.id,
        label: `${entity.name} · ${kindLabels[entity.kind] ?? entity.kind}`,
      })),
    [entities],
  );
  const visibleEntities = useMemo(() => {
    const query = entityQuery.trim().toLowerCase();
    return entities.filter(
      (entity) =>
        (kindFilter === "all" || entity.kind === kindFilter) &&
        (!query ||
          [entity.name, ...entity.aliases]
            .join(" ")
            .toLowerCase()
            .includes(query)),
    );
  }, [entities, kindFilter, entityQuery]);
  const visibleRelations = useMemo(() => {
    const query = relationQuery.trim().toLowerCase();
    return graphEdges(
      relations.filter(
        (relation) =>
          !query || relation.relationType.toLowerCase().includes(query),
      ),
      visibleEntities,
    );
  }, [relations, relationQuery, visibleEntities]);
  const selectedRelationData = useMemo(
    () =>
      relations.find((relation) => relation.id === selectedRelation) ?? null,
    [relations, selectedRelation],
  );
  const canSave = Boolean(
    fromId && toId && relationType.trim() && fromId !== toId,
  );

  useEffect(() => {
    const body = document.querySelector(".graph-body") as HTMLElement | null;
    const panel = document.querySelector(".graph-properties") as HTMLElement | null;
    body?.style.setProperty(
      "--graph-properties-width",
      `${propertiesCollapsed ? 0 : propertiesWidth}px`,
    );
    if (!panel) return;
    const onPointerDown = (event: PointerEvent) => {
      const bounds = panel.getBoundingClientRect();
      if (event.clientX > bounds.left + 10) return;
      event.preventDefault();
      panel.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startWidth = propertiesWidth;
      const onMove = (moveEvent: PointerEvent) =>
        setPropertiesWidth(Math.max(260, Math.min(560, startWidth + startX - moveEvent.clientX)));
      const onUp = () => {
        panel.removeEventListener("pointermove", onMove);
        panel.removeEventListener("pointerup", onUp);
        panel.removeEventListener("pointercancel", onUp);
      };
      panel.addEventListener("pointermove", onMove);
      panel.addEventListener("pointerup", onUp);
      panel.addEventListener("pointercancel", onUp);
    };
    panel.addEventListener("pointerdown", onPointerDown);
    return () => panel.removeEventListener("pointerdown", onPointerDown);
  }, [propertiesCollapsed, propertiesWidth]);

  const formatLayout = () => {
    setNodes((current) => formatGraphLayout(current, edges));
    requestAnimationFrame(() =>
      flowRef.current?.fitView({ padding: 0.18, duration: 240 }),
    );
    setNotice("图谱布局已整理");
  };

  useEffect(() => {
    if (
      selectedRelation &&
      !visibleRelations.some((edge) => edge.id === selectedRelation)
    )
      setSelectedRelation(null);
    if (
      selectedEntity &&
      !visibleEntities.some((entity) => entity.id === selectedEntity.id)
    )
      setSelectedEntity(null);
  }, [selectedEntity, selectedRelation, visibleEntities, visibleRelations]);

  const selectRelation = (relationId: string) => {
    const relation = relations.find((item) => item.id === relationId);
    if (!relation) return;
    setSelectedRelation(relation.id);
    setSelectedEntity(null);
    setFromId(relation.fromId);
    setToId(relation.toId);
    setRelationType(relation.relationType);
    setMetadataText(JSON.stringify(relation.metadata, null, 2));
    setNotice("已载入关系，可直接修改后保存");
  };

  const save = async () => {
    if (!canSave) return;
    try {
      let metadata: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(metadataText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error("必须是 JSON 对象");
        metadata = parsed as Record<string, unknown>;
      } catch (error: unknown) {
        setNotice(
          `关系元数据无效：${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }
      const result = await window.novelAPI.story.saveRelation({
        id: selectedRelation ?? undefined,
        fromId,
        toId,
        relationType: relationType.trim(),
        metadata,
      });
      if (!result.ok) {
        setNotice(`保存失败：${result.error.message}`);
        return;
      }
      setNotice("关系已保存");
      setSelectedRelation(null);
      setFromId("");
      setToId("");
      setRelationType("");
      setMetadataText("{}");
      await reload();
    } catch (error: unknown) {
      setNotice(
        `保存关系失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const remove = async () => {
    if (!selectedRelation) return;
    try {
      const result =
        await window.novelAPI.story.deleteRelation(selectedRelation);
      if (!result.ok) {
        setNotice(`删除失败：${result.error.message}`);
        return;
      }
      setSelectedRelation(null);
      setFromId("");
      setToId("");
      setRelationType("");
      setMetadataText("{}");
      setNotice("关系已删除");
      await reload();
    } catch (error: unknown) {
      setNotice(
        `删除关系失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const onConnect = async (connection: Connection) => {
    if (
      !connection.source ||
      !connection.target ||
      connection.source === connection.target
    )
      return;
    setFromId(connection.source);
    setToId(connection.target);
    setNotice("已填入关系端点，请输入关系类型后保存");
  };

  return (
    <main className="graph-shell">
      <header className="graph-header">
        <div>
          <b>Graph Studio</b>
          <small>
            Story Bible 实体关系图 · {visibleEntities.length}/{entities.length}{" "}
            个实体 · {visibleRelations.length}/{relations.length} 条关系
          </small>
        </div>
        <div className="graph-header-actions">
          <div className="graph-search-group">
            <label className="graph-search-field">
              <Search size={13} aria-hidden="true" />
              <input
                className="graph-search"
                aria-label="搜索图谱实体"
                value={entityQuery}
                onChange={(event) => setEntityQuery(event.target.value)}
                placeholder="搜索实体…"
              />
            </label>
            <label className="graph-search-field graph-relation-field">
              <span className="graph-search-label">关系</span>
              <input
                className="graph-search"
                aria-label="筛选关系类型"
                value={relationQuery}
                onChange={(event) => setRelationQuery(event.target.value)}
                placeholder="关系类型…"
              />
            </label>
          </div>
          <div className="graph-filter-group">
            <span>实体类型</span>
            <div className="graph-filters">
              {(["all", "character", "place", "org", "item"] as const).map(
                (kind) => (
                  <button
                    key={kind}
                    className={kindFilter === kind ? "active" : ""}
                    onClick={() => setKindFilter(kind)}
                  >
                    {kind === "all" ? "全部" : kindLabels[kind]}
                  </button>
                ),
              )}
            </div>
          </div>
          <button
            className="graph-format"
            onClick={formatLayout}
            disabled={loading || nodes.length < 2}
            title="自动整理节点布局"
          >
            <LayoutGrid size={14} /> 整理布局
          </button>
          <button
            className="graph-refresh"
            onClick={() => void reload()}
            disabled={loading}
          >
            <RefreshCw size={14} /> 刷新
          </button>
        </div>
      </header>
      <div
        className="graph-body"
        style={{
          gridTemplateColumns: `minmax(0, 1fr) var(--graph-properties-width, 320px)`,
        }}
      >
        <div className="graph-canvas">
          <ReactFlow<Node<GraphNodeData>, Edge>
            nodes={nodes.filter((node) =>
              visibleEntities.some((entity) => entity.id === node.id),
            )}
            edges={visibleRelations.map((edge) => ({
              ...edge,
              selected: edge.id === selectedRelation,
            }))}
            nodeTypes={graphNodeTypes}
            onInit={(instance) => {
              flowRef.current = instance;
            }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={(connection) => void onConnect(connection)}
            onNodeClick={(_, node) => {
              setSelectedEntity(
                entities.find((entity) => entity.id === node.id) ?? null,
              );
              setSelectedRelation(null);
            }}
            onEdgeClick={(_, edge) => selectRelation(edge.id)}
            fitView
          >
            <Background />
            <Controls showInteractive={false}>
              <button
                type="button"
                className="react-flow__controls-button properties-toggle-control"
                onClick={() => setPropertiesCollapsed((collapsed) => !collapsed)}
                aria-label={propertiesCollapsed ? "展开 Properties" : "折叠 Properties"}
                title={propertiesCollapsed ? "展开 Properties" : "折叠 Properties"}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d={propertiesCollapsed ? "M11 4.5V11.5" : "M5 4.5V11.5"} stroke="#86909C" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="1" y="2" width="14" height="12" rx="1.5" stroke="#86909C" strokeWidth="1.2" />
                </svg>
              </button>
            </Controls>
          </ReactFlow>
        </div>
        <aside className={`graph-properties${propertiesCollapsed ? " is-collapsed" : ""}`}>
          <div className="graph-properties-heading">
            <h3>{selectedRelation ? "编辑关系" : "新增关系"}</h3>
          </div>
          {loading && (
            <p>
              <Loader2 className="spin" size={14} /> 正在读取 Story Bible…
            </p>
          )}
          <label>
            起点
            <select
              value={fromId}
              onChange={(event) => setFromId(event.target.value)}
            >
              <option value="">选择实体</option>
              {entityOptions.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            关系类型
            <input
              value={relationType}
              onChange={(event) => setRelationType(event.target.value)}
              placeholder="例如：盟友、位于、持有"
            />
          </label>
          <label>
            关系元数据（JSON）
            <textarea
              value={metadataText}
              onChange={(event) => setMetadataText(event.target.value)}
              placeholder='{"confidence": 0.8}'
            />
          </label>
          <label>
            终点
            <select
              value={toId}
              onChange={(event) => setToId(event.target.value)}
            >
              <option value="">选择实体</option>
              {entityOptions.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.label}
                </option>
              ))}
            </select>
          </label>
          <div className="graph-relation-actions">
            <button
              className="primary graph-save-button"
              disabled={!canSave}
              onClick={() => void save()}
            >
              {selectedRelation ? <Save size={14} /> : <Plus size={14} />}{" "}
              {selectedRelation ? "更新关系" : "保存关系"}
            </button>
            {selectedRelation && (
              <button
                className="graph-cancel-button"
                onClick={() => {
                  setSelectedRelation(null);
                  setFromId("");
                  setToId("");
                  setRelationType("");
                  setMetadataText("{}");
                  setNotice("已切换为新增关系");
                }}
              >
                取消编辑
              </button>
            )}
            <button
              className="graph-delete-button"
              disabled={!selectedRelation}
              onClick={() => void remove()}
            >
              <Trash2 size={14} /> 删除选中关系
            </button>
          </div>
          {selectedEntity && (
            <div className="graph-selection">
              <h3>选中实体</h3>
              <b>{selectedEntity.name}</b>
              <small>
                {kindLabels[selectedEntity.kind] ?? selectedEntity.kind} ·{" "}
                {selectedEntity.id}
              </small>
              {selectedEntity.aliases.length > 0 && (
                <small>别名：{selectedEntity.aliases.join("、")}</small>
              )}
            </div>
          )}
          {selectedRelationData && (
            <div className="graph-selection">
              <h3>选中关系</h3>
              <b>
                {entities.find(
                  (entity) => entity.id === selectedRelationData.fromId,
                )?.name ?? selectedRelationData.fromId}{" "}
                →{" "}
                {entities.find(
                  (entity) => entity.id === selectedRelationData.toId,
                )?.name ?? selectedRelationData.toId}
              </b>
              <small>类型：{selectedRelationData.relationType}</small>
              <small>关系 ID：{selectedRelationData.id}</small>
            </div>
          )}
          <p className="graph-hint">
            也可以在画布上从一个节点拖到另一个节点，自动填入关系两端。
          </p>
          {notice && (
            <div className="workflow-message" role="status">
              {notice}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
