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
  Bot,
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
import { useGlobalMessage } from "../lib/global-notification";
import { filterGraphNeighborhood } from "../lib/graph-neighborhood";
import { getAdjacentRelations } from "../lib/graph-inspector";
import { getUiText, useUiLocale, useUiText } from "../lib/i18n";

type GraphNodeData = { label: string; kind: string; entityId: string; onActivate?: (entityId: string) => void };

function GraphBlock({ data, selected }: NodeProps<Node<GraphNodeData>>) {
  return (
    <div
      className={`graph-block${selected ? " selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${data.label} · ${data.kind}`}
      onClick={() => data.onActivate?.(data.entityId)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
    >
      <Handle type="target" position={Position.Left} />
      <strong>{data.label}</strong>
      <small>{data.kind}</small>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const graphNodeTypes = { graph: GraphBlock };

function graphNodes(entities: StoryEntity[], locale: Parameters<typeof getUiText>[0], onActivate: (entityId: string) => void): Node<GraphNodeData>[] {
  const kindLabels: Record<string, string> = { character: getUiText(locale, "graphEntityCharacter"), place: getUiText(locale, "graphEntityPlace"), org: getUiText(locale, "graphEntityOrg"), item: getUiText(locale, "graphEntityItem") };
  return entities.map((entity, index) => ({
    id: entity.id,
    type: "graph",
    position: {
      x: (index % 4) * 220 + 40,
      y: Math.floor(index / 4) * 140 + 40,
    },
    data: { label: entity.name, kind: kindLabels[entity.kind] ?? entity.kind, entityId: entity.id, onActivate },
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

export function GraphStudio({ focusRelationId = null }: { focusRelationId?: string | null }) {
  const [locale] = useUiLocale();
  const uiText = useUiText();
  const formatUiText = (key: Parameters<typeof uiText>[0], values: Record<string, string | number>): string => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), uiText(key));
  const kindLabel = (kind: string) => ({ character: "graphEntityCharacter", place: "graphEntityPlace", org: "graphEntityOrg", item: "graphEntityItem" } as Record<string, Parameters<typeof uiText>[0]>)[kind] ? uiText(({ character: "graphEntityCharacter", place: "graphEntityPlace", org: "graphEntityOrg", item: "graphEntityItem" } as Record<string, Parameters<typeof uiText>[0]>)[kind]) : kind;
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
  const [focusEntityId, setFocusEntityId] = useState<string | null>(null);
  const [neighborhoodHops, setNeighborhoodHops] = useState(1);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useGlobalMessage();
  const [propertiesWidth, setPropertiesWidth] = useState(320);
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);
  const flowRef = useRef<ReactFlowInstance<Node<GraphNodeData>, Edge> | null>(
    null,
  );
  const entitiesRef = useRef<StoryEntity[]>([]);
  const selectEntity = useCallback((entity: StoryEntity) => {
    setSelectedEntity(entity);
    setSelectedRelation(null);
    requestAnimationFrame(() => flowRef.current?.fitView({ nodes: [{ id: entity.id }], padding: 0.3, duration: 240 }));
  }, []);
  const activateEntity = useCallback((entityId: string) => {
    const entity = entitiesRef.current.find((item) => item.id === entityId);
    if (entity) selectEntity(entity);
  }, [selectEntity]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [entityResult, relationResult] = await Promise.all([
        window.novelAPI.story.listEntities(),
        window.novelAPI.story.listRelations(),
      ]);
      if (!entityResult.ok)
        setNotice(formatUiText("graphEntityLoadFailed", { error: entityResult.error.message }));
      if (!relationResult.ok)
        setNotice(formatUiText("graphRelationLoadFailed", { error: relationResult.error.message }));
       const nextEntities = entityResult.ok ? entityResult.data : [];
       const nextRelations = relationResult.ok ? relationResult.data : [];
       entitiesRef.current = nextEntities;
       setEntities(nextEntities);
      setRelations(nextRelations);
       setNodes(graphNodes(nextEntities, locale, activateEntity));
      setEdges(graphEdges(nextRelations, nextEntities));
    } catch (error: unknown) {
      setNotice(
        formatUiText("graphLoadFailed", { error: error instanceof Error ? error.message : String(error) }),
      );
    } finally {
      setLoading(false);
    }
  }, [activateEntity, setEdges, setNodes, locale]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const entityOptions = useMemo(
    () =>
      entities.map((entity) => ({
        id: entity.id,
        label: `${entity.name} · ${kindLabel(entity.kind)}`,
      })),
    [entities, locale],
  );
  const filteredEntities = useMemo(() => {
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
  const focusedGraph = useMemo(() => filterGraphNeighborhood(
    filteredEntities,
    relations.filter((relation) => !relationQuery.trim() || relation.relationType.toLowerCase().includes(relationQuery.trim().toLowerCase())),
    focusEntityId,
    neighborhoodHops,
  ), [filteredEntities, focusEntityId, relationQuery, relations]);
  const visibleEntities = focusedGraph.entities;
  const visibleRelations = useMemo(() => {
    const query = relationQuery.trim().toLowerCase();
    return graphEdges(focusedGraph.relations.filter((relation) => !query || relation.relationType.toLowerCase().includes(query)), visibleEntities);
  }, [focusedGraph.relations, relationQuery, visibleEntities]);
  const graphAdjacentRelations = useMemo(
    () => getAdjacentRelations(entities, relations, selectedEntity?.id ?? null),
    [entities, relations, selectedEntity],
  );
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
    setNotice(uiText("graphLayoutArranged"));
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
    setNotice(uiText("graphRelationLoaded"));
  };

  useEffect(() => {
    if (focusRelationId && relations.some((relation) => relation.id === focusRelationId)) selectRelation(focusRelationId)
  }, [focusRelationId, relations])

  const save = async () => {
    if (!canSave) return;
    try {
      let metadata: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(metadataText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error(uiText("graphMetadataObjectExpected"));
        metadata = parsed as Record<string, unknown>;
      } catch (error: unknown) {
        setNotice(
          formatUiText("graphMetadataInvalid", { error: error instanceof Error ? error.message : String(error) }),
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
        setNotice(formatUiText("graphSaveFailed", { error: result.error.message }));
        return;
      }
      setNotice(uiText("graphRelationSaved"));
      setSelectedRelation(null);
      setFromId("");
      setToId("");
      setRelationType("");
      setMetadataText("{}");
      await reload();
    } catch (error: unknown) {
      setNotice(
        formatUiText("graphRelationSaveFailed", { error: error instanceof Error ? error.message : String(error) }),
      );
    }
  };

  const remove = async () => {
    if (!selectedRelation) return;
    try {
      const result =
        await window.novelAPI.story.deleteRelation(selectedRelation);
      if (!result.ok) {
        setNotice(formatUiText("graphDeleteFailed", { error: result.error.message }));
        return;
      }
      setSelectedRelation(null);
      setFromId("");
      setToId("");
      setRelationType("");
      setMetadataText("{}");
      setNotice(uiText("graphRelationDeleted"));
      await reload();
    } catch (error: unknown) {
      setNotice(
        formatUiText("graphRelationDeleteFailed", { error: error instanceof Error ? error.message : String(error) }),
      );
    }
   };

   const propose = async () => {
     if (!selectedRelation || !canSave) return;
     try {
       const parsed: unknown = JSON.parse(metadataText);
       if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(uiText("graphMetadataObjectExpected"));
       const result = await window.novelAPI.canon.proposeRelationUpdate({ id: selectedRelation, fromId, toId, relationType: relationType.trim(), metadata: parsed as Record<string, unknown> });
       setNotice(result.ok ? uiText("graphRelationProposalSubmitted") : formatUiText("graphRelationProposalFailed", { error: result.error.message }));
     } catch (error: unknown) {
       setNotice(formatUiText("graphRelationProposalFailed", { error: error instanceof Error ? error.message : String(error) }));
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
    setNotice(uiText("graphEndpointsFilled"));
  };

  return (
    <main className="graph-shell">
      <header className="graph-header">
        <div>
          <b>{uiText("graphStudio")}</b>
          <small>
            {uiText("graphEntityRelationMap")} · {formatUiText("graphEntityCount", { count: visibleEntities.length })}/{entities.length} · {formatUiText("graphRelationCount", { count: visibleRelations.length })}/{relations.length}{focusEntityId ? ` · ${entities.find((entity) => entity.id === focusEntityId)?.name ?? focusEntityId}` : ""}
          </small>
        </div>
        <div className="graph-header-actions">
          <div className="graph-search-group">
            <label className="graph-search-field">
              <Search size={13} aria-hidden="true" />
              <input
                className="graph-search"
                aria-label={uiText("graphSearchEntities")}
                value={entityQuery}
                onChange={(event) => setEntityQuery(event.target.value)}
                placeholder={uiText("graphSearchEntities")}
              />
            </label>
            <label className="graph-search-field graph-relation-field">
              <span className="graph-search-label">{uiText("graphRelation")}</span>
              <input
                className="graph-search"
                aria-label={uiText("graphSearchRelations")}
                value={relationQuery}
                onChange={(event) => setRelationQuery(event.target.value)}
                placeholder={uiText("graphSearchRelations")}
              />
            </label>
          </div>
          <div className="graph-filter-group">
             <span>{uiText("graphEntityType")}</span>
            <div className="graph-filters">
              {(["all", "character", "place", "org", "item"] as const).map(
                (kind) => (
                  <button
                    key={kind}
                    className={kindFilter === kind ? "active" : ""}
                    onClick={() => setKindFilter(kind)}
                  >
                    {kind === "all" ? uiText("graphAll") : kindLabel(kind)}
                  </button>
                ),
              )}
            </div>
          </div>
          <button
            className="graph-format"
            onClick={formatLayout}
            disabled={loading || nodes.length < 2}
             title={uiText("graphArrangeLayout")}
          >
             <LayoutGrid size={14} /> {uiText("graphArrangeLayout")}
          </button>
          <label className="graph-depth-control">
            <span>{uiText("graphNeighborhoodDepth")}</span>
            <select
              data-testid="graph-neighborhood-depth"
              aria-label={uiText("graphNeighborhoodDepth")}
              value={neighborhoodHops}
              onChange={(event) => setNeighborhoodHops(Number(event.target.value))}
            >
              {[1, 2, 3].map((hops) => <option key={hops} value={hops}>{hops} {uiText("graphHops")}</option>)}
            </select>
          </label>
           {selectedEntity && !focusEntityId && <button type="button" className="graph-focus-button" data-testid="graph-focus-neighborhood" onClick={() => { setEntityQuery(""); setKindFilter("all"); setFocusEntityId(selectedEntity.id); requestAnimationFrame(() => flowRef.current?.fitView({ padding: 0.2, duration: 240 })) }} title={uiText("graphFocusNeighborhood")}><Search size={14} /> {uiText("graphFocusNeighborhood")}</button>}
           {focusEntityId && <button type="button" className="graph-focus-button active" data-testid="graph-clear-focus" onClick={() => { setFocusEntityId(null); requestAnimationFrame(() => flowRef.current?.fitView({ padding: 0.18, duration: 240 })) }} title={uiText("graphShowFullGraph")}><LayoutGrid size={14} /> {uiText("graphShowFullGraph")}</button>}
          <button
            className="graph-refresh"
            onClick={() => void reload()}
            disabled={loading}
          >
             <RefreshCw size={14} /> {uiText("graphRefresh")}
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
              const entity = entities.find((item) => item.id === node.id);
              if (entity) selectEntity(entity);
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
                 aria-label={propertiesCollapsed ? uiText("graphExpandProperties") : uiText("graphCollapseProperties")}
                 title={propertiesCollapsed ? uiText("graphExpandProperties") : uiText("graphCollapseProperties")}
              >
                <Bot size={15} aria-hidden="true" />
              </button>
            </Controls>
          </ReactFlow>
        </div>
        <aside className={`graph-properties${propertiesCollapsed ? " is-collapsed" : ""}`}>
          <div className="graph-properties-heading">
             <h3>{selectedRelation ? uiText("graphEditRelation") : uiText("graphNewRelation")}</h3>
          </div>
          {selectedEntity && <section className="graph-entity-inspector" data-testid="graph-entity-inspector" aria-label={uiText("graphInspectEntity")}>
            <div className="graph-entity-inspector-heading"><strong>{selectedEntity.name}</strong><small>{kindLabel(selectedEntity.kind)}</small></div>
            {selectedEntity.aliases.length > 0 && <p><b>{uiText("graphEntityAliases")}</b><span>{selectedEntity.aliases.join(" · ")}</span></p>}
            {selectedEntity.notes.trim() && <p><b>{uiText("graphEntityNotes")}</b><span>{selectedEntity.notes}</span></p>}
            <div className="graph-entity-neighbors"><b>{uiText("graphAdjacentRelations")}</b>{graphAdjacentRelations.length > 0 ? graphAdjacentRelations.map((item) => <button type="button" key={item.relationId} data-testid="graph-adjacent-relation" onClick={() => selectEntity(item.neighbor)} title={uiText("graphFocusNeighbor")}><span>{item.direction === "incoming" ? uiText("graphIncoming") : uiText("graphOutgoing")} · {item.relationType}</span><strong>{item.neighbor.name}</strong></button>) : <small>{uiText("graphNoAdjacentRelations")}</small>}</div>
            {!focusEntityId && <button type="button" className="graph-focus-button" data-testid="graph-inspector-focus" onClick={() => { setEntityQuery(""); setKindFilter("all"); setFocusEntityId(selectedEntity.id); requestAnimationFrame(() => flowRef.current?.fitView({ padding: 0.2, duration: 240 })) }}><Search size={14} /> {uiText("graphFocusNeighbor")}</button>}
          </section>}
          {visibleRelations.length > 0 && (
             <div className="graph-relation-list" aria-label={uiText("graphRelationList")}>
              {visibleRelations.map((edge) => (
                <button
                  type="button"
                  key={edge.id}
                  data-testid="graph-relation-edge"
                  data-relation-id={edge.id}
                  className={selectedRelation === edge.id ? "active" : ""}
                  onClick={() => selectRelation(edge.id)}
                >
                  {edge.label ?? edge.id}
                </button>
              ))}
            </div>
          )}
          {loading && (
            <p>
               <Loader2 className="spin" size={14} /> {uiText("graphLoading")}
            </p>
          )}
          <label>
             {uiText("graphStart")}
            <select
              value={fromId}
              onChange={(event) => setFromId(event.target.value)}
            >
               <option value="">{uiText("graphSelectEntity")}</option>
              {entityOptions.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.label}
                </option>
              ))}
            </select>
          </label>
          <label>
             {uiText("graphRelationType")}
            <input
              data-testid="graph-relation-type"
              value={relationType}
              onChange={(event) => setRelationType(event.target.value)}
               placeholder="e.g. ally, located in, owns"
            />
          </label>
          <label>
             {uiText("graphRelationMetadata")}
            <textarea
              data-testid="graph-relation-metadata"
              value={metadataText}
              onChange={(event) => setMetadataText(event.target.value)}
              placeholder='{"confidence": 0.8}'
            />
          </label>
          <label>
             {uiText("graphEnd")}
            <select
              value={toId}
              onChange={(event) => setToId(event.target.value)}
            >
               <option value="">{uiText("graphSelectEntity")}</option>
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
              data-testid="graph-relation-save"
              disabled={!canSave}
              onClick={() => void save()}
            >
              {selectedRelation ? <Save size={14} /> : <Plus size={14} />}{" "}
               {selectedRelation ? uiText("graphUpdateRelation") : uiText("graphSaveRelation")}
            </button>
            {selectedRelation && <button type="button" data-testid="graph-relation-propose" onClick={() => void propose()} disabled={!canSave} title={uiText("graphProposeRelation")}>{uiText("graphProposeRelation")}</button>}
            {selectedRelation && (
              <button
                className="graph-cancel-button"
                onClick={() => {
                  setSelectedRelation(null);
                  setFromId("");
                  setToId("");
                  setRelationType("");
                  setMetadataText("{}");
                   setNotice(uiText("graphSwitchToNew"));
                }}
              >
                 {uiText("graphCancelEdit")}
              </button>
            )}
            <button
              className="graph-delete-button"
              data-testid="graph-relation-delete"
              disabled={!selectedRelation}
              onClick={() => void remove()}
            >
               <Trash2 size={14} /> {uiText("graphDeleteRelation")}
            </button>
          </div>
          {selectedEntity && (
            <div className="graph-selection">
               <h3>{uiText("graphSelectedEntity")}</h3>
              <b>{selectedEntity.name}</b>
              <small>
                {kindLabel(selectedEntity.kind)} ·{" "}
                {selectedEntity.id}
              </small>
              {selectedEntity.aliases.length > 0 && (
                 <small>{formatUiText("graphAliases", { aliases: selectedEntity.aliases.join("、") })}</small>
              )}
            </div>
          )}
          {selectedRelationData && (
            <div className="graph-selection">
               <h3>{uiText("graphSelectedRelation")}</h3>
              <b>
                {entities.find(
                  (entity) => entity.id === selectedRelationData.fromId,
                )?.name ?? selectedRelationData.fromId}{" "}
                →{" "}
                {entities.find(
                  (entity) => entity.id === selectedRelationData.toId,
                )?.name ?? selectedRelationData.toId}
              </b>
               <small>{uiText("graphRelationType")}：{selectedRelationData.relationType}</small>
               <small>{formatUiText("graphRelationId", { id: selectedRelationData.id })}</small>
            </div>
          )}
          <p className="graph-hint">
             {uiText("graphCanvasHint")}
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
