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
import {
  LayoutGrid,
  Loader2,
  Save,
  ShieldCheck,
} from "lucide-react";
import type { Workflow } from "../../../shared/workflow";
import { formatWorkflowLayout } from "../utils/flow-layout";

type WorkflowNodeData = {
  label: string;
  workflowType: string;
  inputs: Workflow["nodes"][number]["inputs"];
  outputs: Workflow["nodes"][number]["outputs"];
  config: Record<string, unknown>;
};

const NODE_CATALOG: Array<{
  type: string;
  label: string;
  inputs: WorkflowNodeData["inputs"];
  outputs: WorkflowNodeData["outputs"];
}> = [
  {
    type: "input.chapter",
    label: "当前章节输入",
    inputs: [],
    outputs: [{ id: "out", type: "chapter", required: false }],
  },
  {
    type: "context.load",
    label: "加载 Context",
    inputs: [{ id: "in", type: "chapter", required: true }],
    outputs: [{ id: "out", type: "context", required: false }],
  },
  {
    type: "ai.prompt",
    label: "AI 写作",
    inputs: [{ id: "in", type: "any", required: true }],
    outputs: [{ id: "out", type: "any", required: false }],
  },
  {
    type: "ai.critic",
    label: "AI 审稿",
    inputs: [{ id: "in", type: "any", required: true }],
    outputs: [{ id: "out", type: "any", required: false }],
  },
  {
    type: "human.review",
    label: "人工审核",
    inputs: [{ id: "in", type: "any", required: true }],
    outputs: [{ id: "out", type: "any", required: false }],
  },
  {
    type: "chapter.write",
    label: "写回当前章节",
    inputs: [{ id: "in", type: "any", required: true }],
    outputs: [{ id: "out", type: "chapter", required: false }],
  },
  {
    type: "memory.extract",
    label: "提取设定",
    inputs: [{ id: "in", type: "any", required: true }],
    outputs: [{ id: "out", type: "any", required: false }],
  },
  {
    type: "image.propose",
    label: "图片提案",
    inputs: [{ id: "in", type: "any", required: true }],
    outputs: [{ id: "out", type: "any", required: false }],
  },
  {
    type: "image.generate",
    label: "生成图片",
    inputs: [{ id: "in", type: "any", required: true }],
    outputs: [{ id: "out", type: "any", required: false }],
  },
  {
    type: "image.select",
    label: "人工选图",
    inputs: [{ id: "in", type: "any", required: true }],
    outputs: [{ id: "out", type: "any", required: false }],
  },
  {
    type: "image.insert",
    label: "插入正文",
    inputs: [{ id: "in", type: "any", required: true }],
    outputs: [{ id: "out", type: "any", required: false }],
  },
  {
    type: "logic.merge",
    label: "合并输入",
    inputs: [
      { id: "a", type: "any", required: true },
      { id: "b", type: "any", required: true },
    ],
    outputs: [{ id: "out", type: "any", required: false }],
  },
];

function WorkflowBlock({ data, selected }: NodeProps<Node<WorkflowNodeData>>) {
  return (
    <div className={`workflow-block${selected ? " selected" : ""}`}>
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
  const initial = toReactFlow(fallbackWorkflow);
  const [baseWorkflow, setBaseWorkflow] = useState<Workflow>(fallbackWorkflow);
  const [nodes, setNodes, onNodesChange] = useNodesState<
    Node<WorkflowNodeData>
  >(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState(fallbackWorkflow.name);
  const [message, setMessage] = useState("");
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
        ? (list.data.find((item) => item.id === "flow_builtin_novel") ??
          list.data[0])
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
      } else setMessage(`加载失败：${result.error.message}`);
      setLoading(false);
    })();
    return () => {
      current = false;
    };
  }, [setEdges, setNodes]);

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
    setMessage("保存中…");
    const result = await window.novelAPI.workflowEditor.save(workflow);
    setMessage(
      result.ok
        ? `Workflow 已保存：${result.data.relPath}`
        : `保存失败：${result.error.message}`,
    );
  };
  const validate = async () => {
    const result = await window.novelAPI.workflowEditor.validate(workflow);
    setMessage(
      result.ok && result.data.length === 0
        ? "DAG 校验通过"
        : result.ok
          ? result.data.map((issue) => issue.message).join("；")
          : result.error.message,
    );
  };
  const formatLayout = () => {
    setNodes((current) => formatWorkflowLayout(current, edges));
    requestAnimationFrame(() =>
      flowRef.current?.fitView({ padding: 0.18, duration: 240 }),
    );
    setMessage("Workflow 布局已整理");
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
        label: template.label,
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
          <b>Workflow Editor</b>
          <small>
            {workflow.id} · {loading ? "加载中…" : "项目 Workflow"}
          </small>
        </div>
        <input
          aria-label="Workflow name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <div>
          <button
            onClick={formatLayout}
            disabled={loading || nodes.length < 2}
            title="自动整理流程布局"
          >
            <LayoutGrid size={14} /> 整理布局
          </button>
          <button onClick={() => void validate()} disabled={loading}>
            <ShieldCheck size={14} /> Validate
          </button>
          <button
            className="primary"
            onClick={() => void save()}
            disabled={loading}
          >
            <Save size={14} /> Save
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
        <aside className={`workflow-properties${propertiesCollapsed ? " is-collapsed" : ""}`}>
          <div className="workflow-properties-heading">
            <h3>Properties</h3>
          </div>
          {loading && (
            <p>
              <Loader2 className="spin" size={14} /> 正在读取项目 Workflow…
            </p>
          )}
          <section className="workflow-add-block">
            <h4>添加流程块</h4>
            <select
              aria-label="选择流程块"
              defaultValue=""
              onChange={(event) => {
                addBlock(event.target.value);
                event.target.value = "";
              }}
              disabled={loading}
            >
              <option value="">选择节点类型…</option>
              {NODE_CATALOG.map((item) => (
                <option value={item.type} key={item.type}>
                  {item.label} · {item.type}
                </option>
              ))}
            </select>
            <small>块添加后，通过左右端口拖拽连线；运行顺序由连线决定。</small>
          </section>
          <section className="workflow-variables">
            <div className="workflow-section-heading">
              <h4>Variables</h4>
              <button type="button" onClick={addVariable} disabled={loading}>
                ＋
              </button>
            </div>
            {workflow.variables.map((variable) => (
              <div className="workflow-variable" key={variable.name}>
                <input
                  aria-label="Variable name"
                  value={variable.name}
                  onChange={(event) =>
                    updateVariable(variable.name, { name: event.target.value })
                  }
                />
                <select
                  aria-label="Variable type"
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
                  aria-label="Variable default"
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
                  placeholder="default"
                />
                <button
                  type="button"
                  aria-label={`Remove ${variable.name}`}
                  onClick={() => removeVariable(variable.name)}
                >
                  ×
                </button>
              </div>
            ))}
            {workflow.variables.length === 0 && (
              <p className="workflow-help">
                暂无变量；在节点配置中使用 {"{{name}}"} 引用。
              </p>
            )}
          </section>
          {selectedNode && (
            <>
              <label>
                Label
                <input
                  value={String(selectedNode.data.label)}
                  onChange={(event) => rename(event.target.value)}
                />
              </label>
              <p>
                Node ID <code>{selectedNode.id}</code>
              </p>
              <p>
                Type <code>{selectedNode.data.workflowType}</code>
              </p>
              <p>
                Inputs{" "}
                <code>
                  {selectedNode.data.inputs
                    .map((port) => `${port.id}:${port.type}`)
                    .join(", ") || "none"}
                </code>
              </p>
              <p>
                Outputs{" "}
                <code>
                  {selectedNode.data.outputs
                    .map((port) => `${port.id}:${port.type}`)
                    .join(", ") || "none"}
                </code>
              </p>
              <button
                type="button"
                className="workflow-delete-node"
                onClick={deleteSelected}
              >
                删除此流程块
              </button>
              {selectedNode.data.workflowType.startsWith("ai.") && (
                <div className="workflow-agent-config">
                  <h4>Agent Policy Overrides</h4>
                  <label>
                    Agent
                    <input
                      value={String(selectedNode.data.config.agent ?? "writer")}
                      onChange={(event) =>
                        updateNodeConfig("agent", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Temperature
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
                    Max output tokens
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
                    Retry count
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
                    Context recipe
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
                      placeholder="默认使用 Agent policy"
                    />
                  </label>
                </div>
              )}
            </>
          )}
          {!loading && !selectedNode && <p>选择节点编辑属性</p>}
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
