import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "../styles/workflow-editor-accessibility.css";
import {
  Bot,
  Download,
  LayoutGrid,
  Loader2,
  Save,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type { Workflow } from "../../../shared/workflow";
import { formatWorkflowLayout } from "../utils/flow-layout";
import { useUiText, type UiTextKey } from "../lib/i18n";
import { useGlobalMessage } from "../lib/global-notification";
import { selectWorkflowSummary } from "../lib/workflow-selection";
import { useAppStore } from "../store/app-store";

type WorkflowNodeData = {
  nodeId: string;
  label: string;
  workflowType: string;
  inputs: Workflow["nodes"][number]["inputs"];
  outputs: Workflow["nodes"][number]["outputs"];
  config: Record<string, unknown>;
};

const NODE_CATALOG: Array<{
  type: string;
  labelKey: UiTextKey;
  inputs: WorkflowNodeData["inputs"];
  outputs: WorkflowNodeData["outputs"];
}> = [
  {
    type: "input.chapter",
    labelKey: "nodeInputChapter",
    inputs: [],
    outputs: [{ id: "out", type: "chapter", required: false }],
  },
  {
    type: "context.load",
    labelKey: "nodeLoadContext",
    inputs: [{ id: "in", type: "chapter", required: true }],
    outputs: [{ id: "out", type: "context", required: false }],
  },
  {
    type: "ai.prompt",
    labelKey: "nodeAiWriting",
    inputs: [{ id: "in", type: "any", required: true }],
    outputs: [{ id: "out", type: "any", required: false }],
  },
  {
    type: "ai.critic",
    labelKey: "nodeAiReview",
    inputs: [{ id: "in", type: "any", required: true }],
    outputs: [{ id: "out", type: "any", required: false }],
  },
  {
    type: "human.review",
    labelKey: "nodeHumanReview",
    inputs: [{ id: "in", type: "any", required: true }],
    outputs: [{ id: "out", type: "any", required: false }],
  },
  {
    type: "chapter.write",
    labelKey: "nodeWriteChapter",
    inputs: [{ id: "in", type: "any", required: true }],
    outputs: [{ id: "out", type: "chapter", required: false }],
  },
  {
    type: "memory.extract",
    labelKey: "nodeExtractSettings",
    inputs: [{ id: "in", type: "any", required: true }],
    outputs: [{ id: "out", type: "any", required: false }],
  },
  {
    type: "image.propose",
    labelKey: "nodeImageProposal",
    inputs: [{ id: "in", type: "any", required: true }],
    outputs: [{ id: "out", type: "any", required: false }],
  },
  {
    type: "image.generate",
    labelKey: "nodeGenerateImage",
    inputs: [{ id: "in", type: "any", required: true }],
    outputs: [{ id: "out", type: "any", required: false }],
  },
  {
    type: "image.select",
    labelKey: "nodeSelectImage",
    inputs: [{ id: "in", type: "any", required: true }],
    outputs: [{ id: "out", type: "any", required: false }],
  },
  {
    type: "image.insert",
    labelKey: "nodeInsertImage",
    inputs: [{ id: "in", type: "any", required: true }],
    outputs: [{ id: "out", type: "any", required: false }],
  },
  {
    type: "logic.merge",
    labelKey: "nodeMergeInput",
    inputs: [
      { id: "a", type: "any", required: true },
      { id: "b", type: "any", required: true },
    ],
    outputs: [{ id: "out", type: "any", required: false }],
  },
];

function WorkflowBlock({ data, selected }: NodeProps<Node<WorkflowNodeData>>) {
  const activate = () => window.dispatchEvent(new CustomEvent("novel:workflow-node-activate", { detail: data.nodeId }));
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activate();
  };
  return (
    <div
      className={`workflow-block${selected ? " selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${data.label} · ${data.workflowType}`}
      onKeyDown={onKeyDown}
    >
      {data.inputs.map((port, index) => (
        <Handle
          key={`in-${port.id}`}
          type="target"
          position={Position.Left}
          id={port.id}
          style={{ top: `${((index + 1) / (data.inputs.length + 1)) * 100}%` }}
        />
      ))}
      <strong>{data.label}</strong>
      <small>{data.workflowType}</small>
      {data.outputs.map((port, index) => (
        <Handle
          key={`out-${port.id}`}
          type="source"
          position={Position.Right}
          id={port.id}
          style={{ top: `${((index + 1) / (data.outputs.length + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
}

const workflowNodeTypes = { workflow: WorkflowBlock };

function toReactFlow(workflow: Workflow): {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
} {
  return {
    nodes: workflow.nodes.map((node) => ({
      id: node.id,
      type: "workflow",
      position: node.position,
      data: {
        nodeId: node.id,
        label: node.label,
        workflowType: node.type,
        inputs: node.inputs,
        outputs: node.outputs,
        config: node.config,
      },
    })),
    edges: workflow.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourcePort,
      targetHandle: edge.targetPort,
    })),
  };
}

function toWorkflow(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
  base: Workflow,
  name: string,
): Workflow {
  return {
    ...base,
    name,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.workflowType,
      label: String(node.data.label),
      position: node.position,
      inputs: node.data.inputs,
      outputs: node.data.outputs,
      config: node.data.config,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourcePort: edge.sourceHandle ?? "out",
      target: edge.target,
      targetPort: edge.targetHandle ?? "in",
    })),
  };
}

const fallbackWorkflow: Workflow = {
  schemaVersion: 1,
  id: "flow_current",
  name: "Novel Flow",
  cyclePolicy: "reject",
  variables: [],
  nodes: [
    {
      id: "chapter",
      type: "input.chapter",
      label: "Chapter Input",
      position: { x: 80, y: 120 },
      inputs: [],
      outputs: [{ id: "out", type: "chapter", required: false }],
      config: {},
    },
    {
      id: "writer",
      type: "ai.prompt",
      label: "LLM Writer",
      position: { x: 340, y: 120 },
      inputs: [{ id: "in", type: "any", required: true }],
      outputs: [{ id: "out", type: "any", required: false }],
      config: { agent: "writer" },
    },
    {
      id: "review",
      type: "human.review",
      label: "Human Review",
      position: { x: 620, y: 120 },
      inputs: [{ id: "in", type: "any", required: true }],
      outputs: [{ id: "out", type: "any", required: false }],
      config: {},
    },
  ],
  edges: [
    {
      id: "chapter-writer",
      source: "chapter",
      sourcePort: "out",
      target: "writer",
      targetPort: "in",
    },
    {
      id: "writer-review",
      source: "writer",
      sourcePort: "out",
      target: "review",
      targetPort: "in",
    },
  ],
};

export function WorkflowEditor() {
  const uiText = useUiText();
  const defaultWorkflow = useAppStore((state) => state.project?.manifest.defaultWorkflow);
  const formatUiText = (key: Parameters<typeof uiText>[0], values: Record<string, string | number>): string => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), uiText(key));
  const initial = toReactFlow(fallbackWorkflow);
  const [baseWorkflow, setBaseWorkflow] = useState<Workflow>(fallbackWorkflow);
  const [nodes, setNodes, onNodesChange] = useNodesState<
    Node<WorkflowNodeData>
  >(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState(fallbackWorkflow.name);
  const [message, setMessage] = useGlobalMessage();
  const [loading, setLoading] = useState(true);
  const [propertiesWidth, setPropertiesWidth] = useState(320);
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);
  const flowRef = useRef<ReactFlowInstance<
    Node<WorkflowNodeData>,
    Edge
  > | null>(null);

  useEffect(() => {
    let current = true;
    void (async () => {
      const list = await window.novelAPI.workflowEditor.list();
      const summary = list.ok
        ? selectWorkflowSummary(list.data, defaultWorkflow)
        : undefined;
      if (!summary) {
        if (current) setLoading(false);
        return;
      }
      const result = await window.novelAPI.workflowEditor.read(summary.relPath);
      if (!current) return;
      if (result.ok) {
        const mapped = toReactFlow(result.data);
        setBaseWorkflow(result.data);
        setName(result.data.name);
        setNodes(mapped.nodes);
        setEdges(mapped.edges);
      } else setMessage(formatUiText("workflowLoadingFailed", { error: result.error.message }));
      setLoading(false);
    })();
    return () => {
      current = false;
    };
  }, [defaultWorkflow, setEdges, setNodes]);

  const workflow = useMemo(
    () => toWorkflow(nodes, edges, baseWorkflow, name),
    [nodes, edges, baseWorkflow, name],
  );
  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            id: `${connection.source}-${connection.target}-${Date.now()}`,
          },
          current,
        ),
      ),
    [setEdges],
  );
  const save = async () => {
    setMessage(uiText("workflowSaving"));
    const result = await window.novelAPI.workflowEditor.save(workflow);
    setMessage(
      result.ok
        ? formatUiText("workflowSaved", { path: result.data.relPath })
        : formatUiText("workflowSaveFailed", { error: result.error.message }),
    );
  };
  const validate = async () => {
    const result = await window.novelAPI.workflowEditor.validate(workflow);
    setMessage(
      result.ok && result.data.length === 0
        ? uiText("workflowValidationPassed")
        : result.ok
          ? result.data.map((issue) => issue.message).join("；")
          : formatUiText("workflowValidationFailed", { error: result.error.message }),
    );
  };
  const importCommunityWorkflow = async () => {
    const picked = await window.novelAPI.project.pickCommunityWorkflowOpen();
    if (!picked.ok || !picked.data) {
      if (!picked.ok) setMessage(formatUiText("communityPickFailed", { error: picked.error.message }));
      return;
    }
    const preview = await window.novelAPI.communityWorkflow.preview(picked.data);
    if (!preview.ok) {
      setMessage(formatUiText("communityReadFailed", { error: preview.error.message }));
      return;
    }
    const missing = preview.data.dependencies.filter((item) => !item.installed);
    const dependencyText = preview.data.dependencies.length === 0
      ? uiText("communityNoDependencies")
      : missing.length === 0
        ? uiText("communityDependenciesReady")
        : formatUiText("communityMissingDependencies", { dependencies: missing.map((item) => item.id).join("、") });
    if (missing.length > 0) {
      setMessage(formatUiText("communityImportBlocked", { name: preview.data.name, dependencies: dependencyText }));
      return;
    }
    const confirmed = window.confirm(formatUiText("communityImportConfirm", { name: preview.data.name, description: preview.data.description || uiText("communityNoDescription"), dependencies: dependencyText, permissions: preview.data.permissions.join("、") || uiText("communityNoExtraPermissions"), prompts: preview.data.promptNames.join("、") || uiText("communityNoPrompts") }));
    if (!confirmed) return;
    const installed = await window.novelAPI.communityWorkflow.install(picked.data, preview.data.permissions);
    if (!installed.ok) {
      setMessage(formatUiText("communityImportFailed", { error: installed.error.message }));
      return;
    }
    const loaded = await window.novelAPI.workflowEditor.read(installed.data.relPath);
    if (!loaded.ok) {
      setMessage(formatUiText("communityImportLoadedFailed", { error: loaded.error.message }));
      return;
    }
    const mapped = toReactFlow(loaded.data);
    setBaseWorkflow(loaded.data);
    setName(loaded.data.name);
    setNodes(mapped.nodes);
    setEdges(mapped.edges);
    setSelected(null);
    setMessage(formatUiText("communityImported", { path: installed.data.relPath }));
  };
  const exportCommunityWorkflow = async () => {
    const picked = await window.novelAPI.project.pickCommunityWorkflowSave();
    if (!picked.ok || !picked.data) {
      if (!picked.ok) setMessage(formatUiText("communityExportPickFailed", { error: picked.error.message }));
      return;
    }
    const result = await window.novelAPI.communityWorkflow.export(workflow, picked.data);
    setMessage(result.ok ? formatUiText("communityExported", { path: picked.data }) : formatUiText("communityExportFailed", { error: result.error.message }));
  };
  const formatLayout = () => {
    setNodes((current) => formatWorkflowLayout(current, edges));
    requestAnimationFrame(() =>
      flowRef.current?.fitView({ padding: 0.18, duration: 240 }),
    );
    setMessage(uiText("workflowLayoutArranged"));
  };
  const rename = (label: string) => {
    if (!selected) return;
    setNodes((current) =>
      current.map((node) =>
        node.id === selected
          ? { ...node, data: { ...node.data, label } }
          : node,
      ),
    );
  };
  const deleteSelected = () => {
    if (!selected) return;
    setNodes((current) => current.filter((node) => node.id !== selected));
    setEdges((current) =>
      current.filter(
        (edge) => edge.source !== selected && edge.target !== selected,
      ),
    );
    setSelected(null);
  };
  const addBlock = (type: string) => {
    const template = NODE_CATALOG.find((item) => item.type === type);
    if (!template) return;
    const baseId = type.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
    const used = new Set(nodes.map((node) => node.id));
    let index = 1;
    while (used.has(`${baseId}-${index}`)) index += 1;
    const next: Node<WorkflowNodeData> = {
      id: `${baseId}-${index}`,
      type: "workflow",
      position: {
        x: 120 + (nodes.length % 4) * 230,
        y: 80 + Math.floor(nodes.length / 4) * 150,
      },
      data: {
        nodeId: `${baseId}-${index}`,
        label: uiText(template.labelKey),
        workflowType: template.type,
        inputs: template.inputs,
        outputs: template.outputs,
        config: template.type === "ai.prompt" ? { agent: "writer" } : {},
      },
    };
    setNodes((current) => [...current, next]);
    setSelected(next.id);
  };
  const updateVariables = (variables: Workflow["variables"]) =>
    setBaseWorkflow((current) => ({ ...current, variables }));
  const addVariable = () => {
    const used = new Set(workflow.variables.map((variable) => variable.name));
    let index = workflow.variables.length + 1;
    while (used.has(`variable${index}`)) index += 1;
    updateVariables([
      ...workflow.variables,
      { name: `variable${index}`, type: "text", defaultValue: "" },
    ]);
  };
  const removeVariable = (name: string) =>
    updateVariables(
      workflow.variables.filter((variable) => variable.name !== name),
    );
  const updateVariable = (
    name: string,
    patch: Partial<Workflow["variables"][number]>,
  ) =>
    updateVariables(
      workflow.variables.map((variable) =>
        variable.name === name ? { ...variable, ...patch } : variable,
      ),
    );
  const updateNodeConfig = (
    key: string,
    value: string | number | undefined,
  ) => {
    if (!selected) return;
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== selected) return node;
        const nextConfig = Object.fromEntries(
          Object.entries(node.data.config).filter(([name]) => name !== key),
        );
        return {
          ...node,
          data: {
            ...node.data,
            config:
              value === undefined
                ? nextConfig
                : { ...nextConfig, [key]: value },
          },
        };
      }),
    );
  };
  const selectedNode = nodes.find((node) => node.id === selected);

  useEffect(() => {
    const onKeyboardNodeActivate = (event: Event) => {
      const nodeId = (event as CustomEvent<unknown>).detail;
      if (typeof nodeId === "string" && nodes.some((node) => node.id === nodeId)) setSelected(nodeId);
    };
    window.addEventListener("novel:workflow-node-activate", onKeyboardNodeActivate);
    return () => window.removeEventListener("novel:workflow-node-activate", onKeyboardNodeActivate);
  }, [nodes]);

  useEffect(() => {
    const body = document.querySelector(".workflow-body") as HTMLElement | null;
    const panel = document.querySelector(
      ".workflow-properties",
    ) as HTMLElement | null;
    body?.style.setProperty(
      "--workflow-properties-width",
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
        setPropertiesWidth(
          Math.max(260, Math.min(560, startWidth + startX - moveEvent.clientX)),
        );
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

  return (
    <main className="workflow-shell">
      <header>
        <div>
          <b>{uiText("workflowEditorTitle")}</b>
          <small>
            {workflow.id} · {loading ? uiText("loadingProjectWorkflow") : uiText("projectWorkflow")}
          </small>
        </div>
        <input
          aria-label={uiText("workflowName")}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <div>
          <button
            onClick={formatLayout}
            disabled={loading || nodes.length < 2}
            title={uiText("arrangeLayoutTitle")}
          >
            <LayoutGrid size={14} /> {uiText("arrangeLayout")}
          </button>
          <button onClick={() => void validate()} disabled={loading}>
            <ShieldCheck size={14} /> {uiText("validate")}
          </button>
          <button onClick={() => void importCommunityWorkflow()} disabled={loading} title={uiText("communityWorkflowTitle")}>
            <Upload size={14} /> {uiText("importCommunityWorkflow")}
          </button>
          <button onClick={() => void exportCommunityWorkflow()} disabled={loading} title={uiText("exportCommunityWorkflow")}>
            <Download size={14} /> {uiText("exportCommunityWorkflow")}
          </button>
          <button
            className="primary"
            onClick={() => void save()}
            disabled={loading}
          >
            <Save size={14} /> {uiText("save")}
          </button>
        </div>
      </header>
      <div className="workflow-body">
        <div className="workflow-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={workflowNodeTypes}
            onInit={(instance) => {
              flowRef.current = instance;
            }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelected(node.id)}
            fitView
          >
            <Background />
            <Controls showInteractive={false}>
              <button
                type="button"
                className="react-flow__controls-button properties-toggle-control"
                onClick={() => setPropertiesCollapsed((collapsed) => !collapsed)}
                aria-label={propertiesCollapsed ? uiText("expandProperties") : uiText("collapseProperties")}
                title={propertiesCollapsed ? uiText("expandProperties") : uiText("collapseProperties")}
              >
                <Bot size={15} aria-hidden="true" />
              </button>
            </Controls>
          </ReactFlow>
        </div>
        <aside className={`workflow-properties${propertiesCollapsed ? " is-collapsed" : ""}`}>
          <div className="workflow-properties-heading">
            <h3>{uiText("properties")}</h3>
          </div>
          {loading && (
            <p>
              <Loader2 className="spin" size={14} /> {uiText("loadingWorkflow")}
            </p>
          )}
          <section className="workflow-add-block">
            <h4>{uiText("addBlock")}</h4>
            <select
              aria-label={uiText("selectBlock")}
              defaultValue=""
              onChange={(event) => {
                addBlock(event.target.value);
                event.target.value = "";
              }}
              disabled={loading}
            >
              <option value="">{uiText("selectNodeType")}</option>
              {NODE_CATALOG.map((item) => (
                <option value={item.type} key={item.type}>
                  {uiText(item.labelKey)} · {item.type}
                </option>
              ))}
            </select>
            <small>{uiText("blockHint")}</small>
          </section>
          <section className="workflow-variables">
            <div className="workflow-section-heading">
              <h4>{uiText("variables")}</h4>
              <button type="button" onClick={addVariable} disabled={loading}>
                ＋
              </button>
            </div>
            {workflow.variables.map((variable) => (
              <div className="workflow-variable" key={variable.name}>
                <input
                  aria-label={uiText("variableName")}
                  value={variable.name}
                  onChange={(event) =>
                    updateVariable(variable.name, { name: event.target.value })
                  }
                />
                <select
                  aria-label={uiText("variableType")}
                  value={variable.type}
                  onChange={(event) =>
                    updateVariable(variable.name, { type: event.target.value })
                  }
                >
                  <option value="text">text</option>
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                </select>
                <input
                  aria-label={uiText("variableDefault")}
                  value={
                    typeof variable.defaultValue === "string" ||
                    typeof variable.defaultValue === "number" ||
                    typeof variable.defaultValue === "boolean"
                      ? String(variable.defaultValue)
                      : ""
                  }
                  onChange={(event) =>
                    updateVariable(variable.name, {
                      defaultValue: event.target.value,
                    })
                  }
                  placeholder={uiText("defaultValue")}
                />
                <button
                  type="button"
                  aria-label={formatUiText("removeVariable", { name: variable.name })}
                  onClick={() => removeVariable(variable.name)}
                >
                  ×
                </button>
              </div>
            ))}
            {workflow.variables.length === 0 && (
              <p className="workflow-help">
                {uiText("noVariables")}
              </p>
            )}
          </section>
          {selectedNode && (
            <>
              <label>
                {uiText("label")}
                <input
                  value={String(selectedNode.data.label)}
                  onChange={(event) => rename(event.target.value)}
                />
              </label>
              <p>
                {uiText("nodeId")} <code>{selectedNode.id}</code>
              </p>
              <p>
                {uiText("type")} <code>{selectedNode.data.workflowType}</code>
              </p>
              <p>
                {uiText("inputs")}{" "}
                <code>
                  {selectedNode.data.inputs
                    .map((port) => `${port.id}:${port.type}`)
                    .join(", ") || uiText("none")}
                </code>
              </p>
              <p>
                {uiText("outputs")}{" "}
                <code>
                  {selectedNode.data.outputs
                    .map((port) => `${port.id}:${port.type}`)
                    .join(", ") || uiText("none")}
                </code>
              </p>
              <button
                type="button"
                className="workflow-delete-node"
                onClick={deleteSelected}
              >
                {uiText("deleteBlock")}
              </button>
              {selectedNode.data.workflowType.startsWith("ai.") && (
                <div className="workflow-agent-config">
                  <h4>{uiText("agentPolicyOverrides")}</h4>
                  <label>
                    {uiText("agent")}
                    <input
                      value={String(selectedNode.data.config.agent ?? "writer")}
                      onChange={(event) =>
                        updateNodeConfig("agent", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    {uiText("temperature")}
                    <input
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={
                        typeof selectedNode.data.config.temperature === "number"
                          ? selectedNode.data.config.temperature
                          : ""
                      }
                      onChange={(event) =>
                        updateNodeConfig(
                          "temperature",
                          event.target.value === ""
                            ? undefined
                            : Number(event.target.value),
                        )
                      }
                    />
                  </label>
                  <label>
                    {uiText("maxOutputTokens")}
                    <input
                      type="number"
                      min="1"
                      max="100000"
                      step="1"
                      value={
                        typeof selectedNode.data.config.maxOutputTokens ===
                        "number"
                          ? selectedNode.data.config.maxOutputTokens
                          : ""
                      }
                      onChange={(event) =>
                        updateNodeConfig(
                          "maxOutputTokens",
                          event.target.value === ""
                            ? undefined
                            : Number(event.target.value),
                        )
                      }
                    />
                  </label>
                  <label>
                    {uiText("retryCount")}
                    <input
                      type="number"
                      min="0"
                      max="5"
                      step="1"
                      value={
                        typeof selectedNode.data.config.retry === "number"
                          ? selectedNode.data.config.retry
                          : ""
                      }
                      onChange={(event) =>
                        updateNodeConfig(
                          "retry",
                          event.target.value === ""
                            ? undefined
                            : Number(event.target.value),
                        )
                      }
                    />
                  </label>
                  <label>
                    {uiText("contextRecipe")}
                    <input
                      value={String(
                        selectedNode.data.config.contextRecipe ?? "",
                      )}
                      onChange={(event) =>
                        updateNodeConfig(
                          "contextRecipe",
                          event.target.value || undefined,
                        )
                      }
                      placeholder={uiText("defaultAgentPolicy")}
                    />
                  </label>
                </div>
              )}
            </>
          )}
          {!loading && !selectedNode && <p>{uiText("selectNodeToEdit")}</p>}
          {message && (
            <div className="workflow-message" role="status">
              {message}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
