"use client";

import {
  Bell,
  Boxes,
  Braces,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Database,
  Download,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  HelpCircle,
  Loader2,
  Play,
  Rocket,
  Search,
  Send,
  Sparkles,
  UploadCloud,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ChangeEvent, DragEvent, FormEvent, RefObject, useEffect, useMemo, useRef, useState } from "react";

type ProjectUnderstanding = {
  project_name: string;
  summary: string;
  functional_requirements: string[];
  non_functional_requirements: string[];
  pages: unknown[];
  database_entities: unknown[];
  apis: unknown[];
  components: unknown[];
  user_flows: unknown[];
  implementation_notes: string[];
};

type Task = {
  task_id: string;
  title: string;
  description: string;
  phase: string;
  priority: "high" | "medium" | "low";
  estimated_complexity: "small" | "medium" | "large";
  dependencies: string[];
  acceptance_criteria: string[];
};

type ExecutionPlan = {
  project_type: string;
  architecture_style: string;
  recommended_stack: string[];
  phases: string[];
  tasks: Task[];
  execution_order: string[];
};

type CodeChange = {
  file_path: string;
  change_type: "created" | "modified" | "deleted";
  description: string;
};

type ExecutionResult = {
  task_id: string;
  status: string;
  summary: string;
  generated_files: CodeChange[];
  modified_files: CodeChange[];
  implementation_notes: string[];
  warnings: string[];
  next_recommended_tasks: string[];
};

type ChatResponse = {
  reply: string;
  generated_files: CodeChange[];
  modified_files: CodeChange[];
  warnings: string[];
};

type ProjectListResponse = {
  output_root: string;
  projects: string[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type EditorTab = "brief" | "understanding" | "plan" | "code";

const DIRECT_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8010";
const API_BASE_CANDIDATES = Array.from(
  new Set([
    DIRECT_API_BASE,
    DIRECT_API_BASE.includes("127.0.0.1")
      ? DIRECT_API_BASE.replace("127.0.0.1", "localhost")
      : DIRECT_API_BASE.replace("localhost", "127.0.0.1"),
    "/api",
  ]),
);

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.07,
    },
  },
};

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "generated-project";
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { detail: text || "The backend returned a non-JSON response." };
  }
  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload !== null && "detail" in payload && typeof payload.detail === "string"
        ? payload.detail
        : JSON.stringify(payload, null, 2);
    throw new Error(detail || "Request failed.");
  }
  return payload as T;
}

function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 180000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => window.clearTimeout(timeoutId));
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const failures: string[] = [];

  for (const baseUrl of API_BASE_CANDIDATES) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}${path}`, init);
      if (![500, 502, 503, 504].includes(response.status)) {
        return response;
      }
      failures.push(`${baseUrl}: HTTP ${response.status}`);
    } catch (error) {
      failures.push(`${baseUrl}: ${error instanceof Error ? error.message : "network error"}`);
    }
  }

  throw new Error(
    `Could not connect to the Akriti backend. Start FastAPI on port 8010 and try again.\n\nCommand:\npython -m uvicorn backend.main:app --reload --port 8010\n\nChecked:\n${failures.join("\n")}`,
  );
}

function downloadText(filename: string, text: string, mimeType = "text/plain"): void {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatList(items: unknown[]): string {
  if (!items.length) {
    return "- Not specified";
  }
  return items.map((item) => `- ${typeof item === "string" ? item : JSON.stringify(item)}`).join("\n");
}

function createDocumentationTemplate(
  understanding: ProjectUnderstanding | null,
  plan: ExecutionPlan | null,
  result: ExecutionResult | null,
): string {
  const title = understanding?.project_name || "Akriti Project Documentation";
  return `# ${title}

## Executive Summary
${understanding?.summary || "No summary generated yet."}

## Product Requirements

### Functional Requirements
${formatList(understanding?.functional_requirements || [])}

### Non-Functional Requirements
${formatList(understanding?.non_functional_requirements || [])}

## User Experience

### Pages
${formatList(understanding?.pages || [])}

### Components
${formatList(understanding?.components || [])}

### User Flows
${formatList(understanding?.user_flows || [])}

## System Design

### Database Entities
${formatList(understanding?.database_entities || [])}

### APIs
${formatList(understanding?.apis || [])}

## Implementation Plan

### Project Type
${plan?.project_type || "Not planned yet."}

### Architecture Style
${plan?.architecture_style || "Not planned yet."}

### Recommended Stack
${formatList(plan?.recommended_stack || [])}

### Phases
${formatList(plan?.phases || [])}

### Tasks
${plan?.tasks?.length ? plan.tasks.map((task) => `### ${task.task_id}: ${task.title}
- Phase: ${task.phase}
- Priority: ${task.priority}
- Complexity: ${task.estimated_complexity}
- Dependencies: ${task.dependencies.length ? task.dependencies.join(", ") : "None"}
- Description: ${task.description}
- Acceptance Criteria:
${formatList(task.acceptance_criteria)}
`).join("\n") : "- No tasks generated yet."}

## Latest Execution Result
${result ? `- Task: ${result.task_id}
- Status: ${result.status}
- Summary: ${result.summary}

### Generated Files
${formatList(result.generated_files.map((file) => `${file.change_type}: ${file.file_path} - ${file.description}`))}

### Modified Files
${formatList(result.modified_files.map((file) => `${file.change_type}: ${file.file_path} - ${file.description}`))}

### Notes
${formatList(result.implementation_notes)}
` : "No execution result yet."}
`;
}

function CodeBlock({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (!part.startsWith("```")) {
          return <span key={index}>{part}</span>;
        }
        const code = part.replace(/^```[a-zA-Z0-9-]*\n?/, "").replace(/```$/, "");
        return (
          <pre key={index}>
            <button className="copy-code" type="button" onClick={() => navigator.clipboard.writeText(code)}>
              Copy
            </button>
            <code>{code}</code>
          </pre>
        );
      })}
    </>
  );
}

export default function Home() {
  const [complexity, setComplexity] = useState<"simple" | "medium" | "hard">("medium");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState("AI: Active");
  const [error, setError] = useState("");
  const [understanding, setUnderstanding] = useState<ProjectUnderstanding | null>(null);
  const [plan, setPlan] = useState<ExecutionPlan | null>(null);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [executedTaskIds, setExecutedTaskIds] = useState<Set<string>>(new Set());
  const [bottomTab, setBottomTab] = useState<"diagram" | "json" | "logs">("diagram");
  const [editorTab, setEditorTab] = useState<EditorTab>("brief");
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [projects, setProjects] = useState<string[]>([]);
  const [outputRoot, setOutputRoot] = useState("");
  const [activeProject, setActiveProject] = useState("");
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [applyChanges, setApplyChanges] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const planningInFlightRef = useRef(false);

  const nextTask = useMemo(() => {
    if (!plan) {
      return null;
    }
    for (const taskId of plan.execution_order) {
      if (executedTaskIds.has(taskId)) {
        continue;
      }
      const task = plan.tasks.find((candidate) => candidate.task_id === taskId);
      if (!task) {
        return null;
      }
      if (task.dependencies.every((dependency) => executedTaskIds.has(dependency))) {
        return task;
      }
    }
    return null;
  }, [executedTaskIds, plan]);

  const rawOutput = useMemo(() => {
    if (executionResult) {
      return executionResult;
    }
    if (plan) {
      return plan;
    }
    if (understanding) {
      return understanding;
    }
    return { message: "Upload a document to generate structured Akriti output." };
  }, [executionResult, plan, understanding]);

  useEffect(() => {
    refreshWorkspace().catch(() => undefined);
    // Run once on load to hydrate generated project metadata from the backend.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!chatInputRef.current) {
      return;
    }
    chatInputRef.current.style.height = "0";
    chatInputRef.current.style.height = `${Math.min(chatInputRef.current.scrollHeight, 160)}px`;
  }, [chatInput]);

  async function analyze(): Promise<void> {
    setError("");
    if (!selectedFile) {
      setError("Upload a project document, diagram, or mockup before analysis.");
      return;
    }
    setIsBusy(true);
    setStatus("Analyzing");
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("content", "");
      const response = await apiFetch("/analyze/upload", { method: "POST", body: formData });
      const payload = await parseResponse<ProjectUnderstanding>(response);
      setUnderstanding(payload);
      setPlan(null);
      setExecutionResult(null);
      setExecutedTaskIds(new Set());
      setStatus("Understanding Ready");
      setEditorTab("understanding");
      setBottomTab("json");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Analysis failed.");
      setStatus("Error");
    } finally {
      setIsBusy(false);
    }
  }

  async function createPlan(projectUnderstanding: ProjectUnderstanding | null = understanding): Promise<void> {
    if (planningInFlightRef.current) {
      return;
    }
    if (!projectUnderstanding) {
      setError("Run analysis before creating a plan.");
      return;
    }
    planningInFlightRef.current = true;
    setIsBusy(true);
    setStatus("Planning");
    setError("");
    try {
      const response = await apiFetch("/plan/configured", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_understanding: projectUnderstanding, complexity }),
      });
      const payload = await parseResponse<ExecutionPlan>(response);
      setPlan(payload);
      setExecutionResult(null);
      setExecutedTaskIds(new Set());
      setStatus("Plan Ready");
      setEditorTab("plan");
      setBottomTab("diagram");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Planning failed.");
      setStatus("Error");
    } finally {
      planningInFlightRef.current = false;
      setIsBusy(false);
    }
  }

  async function executeTask(task: Task | null = nextTask): Promise<void> {
    if (!understanding || !plan || !task) {
      setError("Create a plan before executing a task.");
      return;
    }
    setIsBusy(true);
    setStatus(`Executing ${task.task_id}`);
    setError("");
    try {
      const response = await apiFetch("/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_understanding: understanding, execution_plan: plan, task }),
      });
      const payload = await parseResponse<ExecutionResult>(response);
      setExecutionResult(payload);
      setExecutedTaskIds((current) => new Set([...current, task.task_id]));
      await refreshWorkspace(slugify(understanding.project_name));
      setStatus("Task Executed");
      setEditorTab("code");
      setBottomTab("logs");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Execution failed.");
      setStatus("Error");
    } finally {
      setIsBusy(false);
    }
  }

  async function runAllTasks(): Promise<void> {
    if (!plan) {
      return;
    }
    let currentIds = new Set(executedTaskIds);
    for (const taskId of plan.execution_order) {
      const task = plan.tasks.find((candidate) => candidate.task_id === taskId);
      if (!task || currentIds.has(taskId)) {
        continue;
      }
      if (!task.dependencies.every((dependency) => currentIds.has(dependency))) {
        continue;
      }
      await executeTask(task);
      currentIds = new Set([...currentIds, task.task_id]);
    }
  }

  async function refreshWorkspace(preferredProject = activeProject): Promise<void> {
    const response = await apiFetch("/workspace/projects");
    const payload = await parseResponse<ProjectListResponse>(response);
    setOutputRoot(payload.output_root);
    setProjects(payload.projects);
    const nextProject = preferredProject && payload.projects.includes(preferredProject) ? preferredProject : payload.projects[0] || "";
    setActiveProject(nextProject);
    if (nextProject) {
      await loadProjectFiles(nextProject);
    }
  }

  async function loadProjectFiles(project: string): Promise<void> {
    const response = await apiFetch(`/workspace/projects/${encodeURIComponent(project)}/files`);
    const payload = await parseResponse<{ files: string[] }>(response);
    setProjectFiles(payload.files);
  }

  async function openFile(path: string): Promise<void> {
    if (!activeProject) {
      return;
    }
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const response = await apiFetch(`/workspace/projects/${encodeURIComponent(activeProject)}/files/${encodedPath}`);
    const payload = await parseResponse<{ content: string }>(response);
    setActiveFile(path);
    setFileContent(payload.content);
  }

  async function saveFile(): Promise<void> {
    if (!activeProject || !activeFile) {
      return;
    }
    const encodedPath = activeFile.split("/").map(encodeURIComponent).join("/");
    await apiFetch(`/workspace/projects/${encodeURIComponent(activeProject)}/files/${encodedPath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: fileContent }),
    }).then(parseResponse);
    setStatus("File Saved");
  }

  async function sendChat(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    const message = chatInput.trim();
    if (!message) {
      return;
    }
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text: message };
    setChatMessages((items) => [...items, userMessage]);
    setChatInput("");
    setIsChatting(true);
    try {
      const response = await apiFetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          project: activeProject,
          file_path: activeFile,
          apply_changes: applyChanges,
        }),
      });
      const payload = await parseResponse<ChatResponse>(response);
      const lines = [payload.reply];
      if (payload.generated_files.length) {
        lines.push("", "Created files:", ...payload.generated_files.map((file) => `- ${file.file_path}`));
      }
      if (payload.modified_files.length) {
        lines.push("", "Modified files:", ...payload.modified_files.map((file) => `- ${file.file_path}`));
      }
      if (payload.warnings.length) {
        lines.push("", "Warnings:", ...payload.warnings.map((warning) => `- ${warning}`));
      }
      setChatMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", text: lines.join("\n") }]);
      await refreshWorkspace(activeProject);
      if (activeFile) {
        await openFile(activeFile);
      }
      setStatus("AI: Active");
    } catch (requestError) {
      setChatMessages((items) => [
        ...items,
        { id: crypto.randomUUID(), role: "assistant", text: requestError instanceof Error ? requestError.message : "Chat failed." },
      ]);
      setStatus("Error");
    } finally {
      setIsChatting(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>): void {
    setSelectedFile(event.target.files?.[0] || null);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  }

  function downloadJson(): void {
    downloadText("akriti-output.json", formatJson(rawOutput), "application/json");
  }

  function downloadDocumentation(): void {
    const filename = `${slugify(understanding?.project_name || "akriti-documentation")}.md`;
    downloadText(filename, createDocumentationTemplate(understanding, plan, executionResult), "text/markdown");
  }

  return (
    <div className="app-root">
      <Background />
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">A</span>
          <span>
            <span className="brand-title">Akriti</span>
            <span className="brand-subtitle">Document intelligence to code</span>
          </span>
        </div>
        <div className="search-box">
          <Search size={17} />
          <input placeholder="Search files, generated plans, tasks..." aria-label="Search workspace" />
        </div>
        <div className="top-actions">
          <button className="project-select" type="button">
            <Boxes size={16} />
            {understanding?.project_name || "Document Upload App"}
            <ChevronDown size={14} />
          </button>
          <button className="top-action" type="button">
            <Sparkles size={16} />
            AI
          </button>
          <Bell size={18} />
          <HelpCircle size={18} />
          <span className="avatar">NS</span>
        </div>
      </header>

      <main className={`shell ${explorerOpen ? "" : "explorer-collapsed"}`}>
        <motion.button
          className="sidebar-toggle"
          aria-label={explorerOpen ? "Hide explorer" : "Show explorer"}
          type="button"
          onClick={() => setExplorerOpen((open) => !open)}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
        >
          {explorerOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </motion.button>
        <Explorer
          projects={projects}
          projectFiles={projectFiles}
          activeProject={activeProject}
          activeFile={activeFile}
          outputRoot={outputRoot}
          isOpen={explorerOpen}
          onToggle={() => setExplorerOpen((open) => !open)}
          onOpenWorkspace={() => setWorkspaceOpen(true)}
          onOpenFile={openFile}
        />

        <section className="editor">
          <div className="tabs">
            <button className={`tab ${editorTab === "brief" ? "active" : ""}`} type="button" onClick={() => setEditorTab("brief")}><FileText size={15} /> Project Brief</button>
            <button className={`tab ${editorTab === "understanding" ? "active" : ""}`} type="button" onClick={() => setEditorTab("understanding")}><Braces size={15} /> Understanding.json</button>
            <button
              className={`tab ${editorTab === "plan" ? "active" : ""}`}
              type="button"
              onClick={() => {
                setEditorTab("plan");
                if (understanding && !plan && !isBusy) {
                  createPlan().catch((planError) =>
                    setError(planError instanceof Error ? planError.message : "Planning failed."),
                  );
                }
              }}
            >
              <Zap size={15} /> Execution Plan
            </button>
            <button className={`tab ${editorTab === "code" ? "active" : ""}`} type="button" onClick={() => setEditorTab("code")}><FileCode2 size={15} /> Generated Code</button>
          </div>

          <div className="editor-top">
            <div className="breadcrumb">
              <span>src</span>
              <span>›</span>
              <strong>{getTabTitle(editorTab, activeFile)}</strong>
            </div>
            <div className="editor-actions">
              <button className="secondary-button" type="button" onClick={downloadJson}>
                <FileJson size={15} />
                JSON
              </button>
              <button className="secondary-button" type="button" onClick={downloadDocumentation}>
                <Download size={15} />
                Docs
              </button>
              <button className="primary-button" type="button" onClick={() => createPlan()} disabled={!understanding || isBusy}>
                <Sparkles size={15} />
                Plan
              </button>
            </div>
          </div>

          <div className="editor-body">
            <AnimatePresence mode="wait">
              {editorTab === "brief" ? (
                <BriefPanel
                  key="brief"
                  complexity={complexity}
                  error={error}
                  isBusy={isBusy}
                  isDragging={isDragging}
                  selectedFile={selectedFile}
                  status={status}
                  fileInputRef={fileInputRef}
                  setComplexity={setComplexity}
                  setIsDragging={setIsDragging}
                  onDrop={onDrop}
                  onFileChange={onFileChange}
                  onAnalyze={analyze}
                />
              ) : null}
              {editorTab === "understanding" ? (
                <UnderstandingPanel key="understanding" understanding={understanding} />
              ) : null}
              {editorTab === "plan" ? (
                <PlanPanel
                  key="plan"
                  plan={plan}
                  canCreatePlan={Boolean(understanding)}
                  isBusy={isBusy}
                  executedTaskIds={executedTaskIds}
                  nextTaskId={nextTask?.task_id || ""}
                  onCreatePlan={() => createPlan()}
                  onExecute={executeTask}
                />
              ) : null}
              {editorTab === "code" ? (
                <GeneratedCodePanel key="code" result={executionResult} files={projectFiles} activeProject={activeProject} onOpenWorkspace={() => setWorkspaceOpen(true)} onOpenFile={openFile} />
              ) : null}
            </AnimatePresence>
          </div>

          <section className={`bottom-panel ${bottomPanelOpen ? "" : "collapsed"}`}>
            <motion.button
              className="bottom-panel-toggle"
              type="button"
              aria-label={bottomPanelOpen ? "Hide bottom panel" : "Show bottom panel"}
              onClick={() => setBottomPanelOpen((open) => !open)}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
            >
              {bottomPanelOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </motion.button>
            <div className="bottom-tabs">
              <span className={bottomTab === "diagram" ? "active" : ""} onClick={() => setBottomTab("diagram")}>DIAGRAM</span>
              <span className={bottomTab === "json" ? "active" : ""} onClick={() => setBottomTab("json")}>JSON</span>
              <span className={bottomTab === "logs" ? "active" : ""} onClick={() => setBottomTab("logs")}>LOGS</span>
              <button className="ghost-button" type="button" onClick={() => runAllTasks()} disabled={!nextTask || isBusy}>
                <Rocket size={14} />
                Run All
              </button>
            </div>
            <pre className="json-view">
              {bottomTab === "diagram" ? createDiagramText(understanding, plan) : bottomTab === "logs" ? createLogs(executionResult, status) : formatJson(rawOutput)}
            </pre>
          </section>

          <footer className="statusbar">
            <div><span>Spaces: 2</span><span>UTF-8</span><span>TypeScript React</span></div>
            <div><span>AI: Active</span><span>{DIRECT_API_BASE}</span></div>
          </footer>
        </section>

        <AssistantPanel
          messages={chatMessages}
          input={chatInput}
          isChatting={isChatting}
          applyChanges={applyChanges}
          inputRef={chatInputRef}
          setApplyChanges={setApplyChanges}
          setInput={setChatInput}
          onSubmit={sendChat}
        />
      </main>

      <AnimatePresence>
        {workspaceOpen ? (
          <WorkspaceModal
            activeProject={activeProject}
            projects={projects}
            files={projectFiles}
            activeFile={activeFile}
            fileContent={fileContent}
            setActiveProject={(project) => {
              setActiveProject(project);
              loadProjectFiles(project).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load files."));
            }}
            openFile={openFile}
            setFileContent={setFileContent}
            saveFile={saveFile}
            close={() => setWorkspaceOpen(false)}
            refresh={() => refreshWorkspace(activeProject)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Background() {
  return (
    <div className="background" aria-hidden="true">
      <motion.span className="mesh one" animate={{ x: [0, 42, -18], y: [0, -24, 18] }} transition={{ duration: 18, repeat: Infinity, repeatType: "mirror" }} />
      <motion.span className="mesh two" animate={{ x: [0, -38, 20], y: [0, 26, -16] }} transition={{ duration: 20, repeat: Infinity, repeatType: "mirror" }} />
      <motion.span className="mesh three" animate={{ x: [0, 24, -28], y: [0, -20, 20] }} transition={{ duration: 22, repeat: Infinity, repeatType: "mirror" }} />
      <span className="grid-overlay" />
    </div>
  );
}

function getTabTitle(tab: EditorTab, activeFile: string): string {
  if (tab === "brief") {
    return "Project Brief";
  }
  if (tab === "understanding") {
    return "Understanding.json";
  }
  if (tab === "plan") {
    return "Execution Plan";
  }
  return activeFile || "Generated Code";
}

function BriefPanel(props: {
  complexity: "simple" | "medium" | "hard";
  error: string;
  isBusy: boolean;
  isDragging: boolean;
  selectedFile: File | null;
  status: string;
  fileInputRef: RefObject<HTMLInputElement>;
  setComplexity: (value: "simple" | "medium" | "hard") => void;
  setIsDragging: (value: boolean) => void;
  onDrop: (event: DragEvent<HTMLLabelElement>) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onAnalyze: () => void;
}) {
  return (
    <motion.div key="brief" variants={stagger} initial="hidden" animate="show" exit={{ opacity: 0 }} className="analysis-grid">
      <motion.section className="card upload-card span-12" variants={cardVariants}>
        <div className="card-inner">
          <div className="section-heading">
            <div>
              <span className="chip"><Sparkles size={13} /> {props.status}</span>
              <h3 className="upload-title">Upload document</h3>
            </div>
            {props.isBusy ? <Loader2 className="spin" size={16} /> : <UploadCloud size={16} />}
          </div>
          <label
            className={`upload-zone ${props.isDragging ? "dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              props.setIsDragging(true);
            }}
            onDragLeave={() => props.setIsDragging(false)}
            onDrop={props.onDrop}
          >
            <input ref={props.fileInputRef} type="file" onChange={props.onFileChange} />
            <span>
              <span className="upload-icon"><UploadCloud size={26} /></span>
              <strong>Drop project document</strong>
              <small>PDF notes, text specs, diagrams, JSON, CSV, PNG, JPG</small>
              {props.selectedFile ? <span className="file-pill"><CheckCircle2 size={14} /> {props.selectedFile.name}</span> : null}
            </span>
          </label>
          <div style={{ height: 12 }} />
          {props.isBusy ? <div className="progress"><motion.span animate={{ scaleX: [0.15, 1, 0.45] }} transition={{ repeat: Infinity, duration: 1.1 }} /></div> : null}
          <div style={{ height: 14 }} />
          <div className="quick-actions">
            <select value={props.complexity} onChange={(event) => props.setComplexity(event.target.value as "simple" | "medium" | "hard")}>
              <option value="simple">Simple</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <button className="primary-button" type="button" onClick={props.onAnalyze} disabled={props.isBusy}>
              Analyze
            </button>
          </div>
          {props.error ? <p className="error">{props.error}</p> : null}
        </div>
      </motion.section>
    </motion.div>
  );
}

function UnderstandingPanel({ understanding }: { understanding: ProjectUnderstanding | null }) {
  if (!understanding) {
    return <EmptyMiddle title="No understanding generated yet" description="Upload and analyze a document. This tab will then show structured project knowledge." />;
  }

  return (
    <motion.div key="understanding" variants={stagger} initial="hidden" animate="show" exit={{ opacity: 0 }} className="analysis-grid">
      <OverviewCards understanding={understanding} plan={null} executionResult={null} />
      <motion.section className="card span-12" variants={cardVariants}>
        <div className="card-inner">
          <div className="section-heading">
            <h3>Validated JSON</h3>
            <span className="chip"><FileJson size={13} /> ProjectUnderstanding</span>
          </div>
          <pre className="middle-json">{formatJson(understanding)}</pre>
        </div>
      </motion.section>
    </motion.div>
  );
}

function PlanPanel(props: {
  plan: ExecutionPlan | null;
  canCreatePlan: boolean;
  isBusy: boolean;
  executedTaskIds: Set<string>;
  nextTaskId: string;
  onCreatePlan: () => void;
  onExecute: (task: Task) => void;
}) {
  if (!props.plan) {
    if (props.isBusy && props.canCreatePlan) {
      return (
        <motion.div key="plan-loading" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="empty-state">
          <Loader2 className="spin" size={26} />
          <h3>Generating execution plan</h3>
          <p>The Planning Agent is creating phases, tasks, dependencies, and execution order. This can take a few seconds.</p>
        </motion.div>
      );
    }

    return (
      <motion.div key="plan-empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="empty-state">
        <h3>No execution plan yet</h3>
        <p>Analyze a document first, then generate the plan. This keeps the agent workflow explicit and prevents duplicate planning requests.</p>
        <button className="primary-button" type="button" onClick={props.onCreatePlan} disabled={!props.canCreatePlan || props.isBusy}>
          <Sparkles size={15} />
          Generate Execution Plan
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div key="plan" variants={stagger} initial="hidden" animate="show" exit={{ opacity: 0 }} className="analysis-grid middle-scroll">
      <motion.section className="card span-12" variants={cardVariants}>
        <div className="card-inner">
          <div className="section-heading">
            <h3>{props.plan.project_type}</h3>
            <div className="chips">{props.plan.recommended_stack.map((item) => <span className="chip" key={item}>{item}</span>)}</div>
          </div>
          <p>{props.plan.architecture_style}</p>
        </div>
      </motion.section>
      <TaskBoard plan={props.plan} executedTaskIds={props.executedTaskIds} nextTaskId={props.nextTaskId} onExecute={props.onExecute} />
    </motion.div>
  );
}

function GeneratedCodePanel(props: {
  result: ExecutionResult | null;
  files: string[];
  activeProject: string;
  onOpenWorkspace: () => void;
  onOpenFile: (file: string) => void;
}) {
  return (
    <motion.div key="code" variants={stagger} initial="hidden" animate="show" exit={{ opacity: 0 }} className="analysis-grid">
      <motion.section className="card span-12" variants={cardVariants}>
        <div className="card-inner">
          <div className="section-heading">
            <div>
              <h3>{props.activeProject || "Generated Code"}</h3>
              <p>{props.result?.summary || "Execute a task or open the workspace to inspect generated files."}</p>
            </div>
            <button className="secondary-button" type="button" onClick={props.onOpenWorkspace}><Folder size={14} /> Open Files</button>
          </div>
          <div className="analysis-grid">
            {[...(props.result?.generated_files || []), ...(props.result?.modified_files || [])].map((file) => (
              <div className="change-card span-6" key={`${file.change_type}-${file.file_path}`}>
                <div className="task-title"><span>{file.file_path}</span><span className="chip">{file.change_type}</span></div>
                <p>{file.description}</p>
              </div>
            ))}
            {!props.result ? props.files.slice(0, 10).map((file) => (
              <button className="file-row span-6" key={file} type="button" onClick={() => props.onOpenFile(file)}>
                <FileCode2 size={14} /> {file}
              </button>
            )) : null}
          </div>
        </div>
      </motion.section>
    </motion.div>
  );
}

function EmptyMiddle({ title, description }: { title: string; description: string }) {
  return (
    <motion.div key={title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </motion.div>
  );
}

function Explorer(props: {
  projects: string[];
  projectFiles: string[];
  activeProject: string;
  activeFile: string;
  outputRoot: string;
  isOpen: boolean;
  onToggle: () => void;
  onOpenWorkspace: () => void;
  onOpenFile: (file: string) => void;
}) {
  return (
    <motion.aside
      className={`explorer ${props.isOpen ? "open" : "closed"}`}
      animate={{ x: props.isOpen ? 0 : -24, opacity: props.isOpen ? 1 : 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      <div className="panel-header">
        <div>
          <div className="panel-kicker">Explorer</div>
          <h2 className="panel-title">{props.activeProject || "Generated Projects"}</h2>
        </div>
        <div className="editor-actions">
          <button className="ghost-button" type="button" onClick={props.onOpenWorkspace}><Folder size={15} /></button>
          <button className="ghost-button" type="button" onClick={props.onToggle}><X size={15} /></button>
        </div>
      </div>
      <div className="explorer-scroll">
        <div className="tree-section">
          <div className="tree-label"><Folder size={14} /> Projects</div>
          {props.projects.length ? props.projects.map((project) => (
            <div className={`tree-item ${project === props.activeProject ? "active" : ""}`} key={project}>
              <Folder size={14} /> {project}
            </div>
          )) : <div className="tree-item">No generated projects yet</div>}
        </div>
        <div className="tree-section">
          <div className="tree-label"><FileCode2 size={14} /> Files</div>
          {props.projectFiles.slice(0, 18).map((file) => (
            <button className={`tree-item ${file === props.activeFile ? "active" : ""}`} key={file} type="button" onClick={() => props.onOpenFile(file)}>
              <Code2 size={14} /> {file}
            </button>
          ))}
        </div>
        <p className="workspace-root">{props.outputRoot || "Downloads output folder appears here after execution."}</p>
      </div>
    </motion.aside>
  );
}

function OverviewCards({ understanding, plan, executionResult }: { understanding: ProjectUnderstanding | null; plan: ExecutionPlan | null; executionResult: ExecutionResult | null }) {
  return (
    <>
      <motion.section className="card span-4" variants={cardVariants}>
        <div className="card-inner">
          <div className="section-heading"><h3>Metrics</h3><Sparkles size={16} /></div>
          <div className="metric-grid">
            <div className="metric"><strong>{understanding?.functional_requirements.length || 0}</strong><span>Requirements</span></div>
            <div className="metric"><strong>{understanding?.apis.length || 0}</strong><span>APIs</span></div>
            <div className="metric"><strong>{plan?.tasks.length || 0}</strong><span>Tasks</span></div>
            <div className="metric"><strong>{executionResult ? 1 : 0}</strong><span>Executions</span></div>
          </div>
        </div>
      </motion.section>
      <motion.section className="card span-4" variants={cardVariants}>
        <div className="card-inner">
          <div className="section-heading"><h3>Architecture</h3><Workflow size={16} /></div>
          <p>{plan?.architecture_style || "Generate a plan to see architecture recommendations."}</p>
          <div className="chips">{(plan?.recommended_stack || ["FastAPI", "Next.js", "TypeScript"]).slice(0, 5).map((item) => <span className="chip" key={item}>{item}</span>)}</div>
        </div>
      </motion.section>
      <motion.section className="card span-4" variants={cardVariants}>
        <div className="card-inner">
          <div className="section-heading"><h3>Summary</h3><FileText size={16} /></div>
          <p>{understanding?.summary || "Structured project summary will appear here after analysis."}</p>
        </div>
      </motion.section>
      <motion.section className="card span-6" variants={cardVariants}>
        <div className="card-inner">
          <div className="section-heading"><h3>Requirements</h3><CheckCircle2 size={16} /></div>
          <ul className="list">{(understanding?.functional_requirements || ["Upload a document to extract requirements."]).slice(0, 6).map((item) => <li key={String(item)}>{String(item)}</li>)}</ul>
        </div>
      </motion.section>
      <motion.section className="card span-6" variants={cardVariants}>
        <div className="card-inner">
          <div className="section-heading"><h3>Data & APIs</h3><Database size={16} /></div>
          <ul className="list">{[...(understanding?.database_entities || []), ...(understanding?.apis || [])].slice(0, 6).map((item, index) => <li key={index}>{typeof item === "string" ? item : JSON.stringify(item)}</li>)}</ul>
        </div>
      </motion.section>
    </>
  );
}

function TaskBoard({ plan, executedTaskIds, nextTaskId, onExecute }: { plan: ExecutionPlan | null; executedTaskIds: Set<string>; nextTaskId: string; onExecute: (task: Task) => void }) {
  return (
    <motion.section className="card span-12" variants={cardVariants}>
      <div className="card-inner">
        <div className="section-heading">
          <h3>Execution Plan</h3>
          <div className="chips">{(plan?.phases || ["Project Setup", "Backend", "Frontend", "Testing"]).map((phase) => <span className="chip" key={phase}>{phase}</span>)}</div>
        </div>
        <div className="analysis-grid">
          {(plan?.tasks || []).slice(0, 8).map((task) => (
            <div className="task-card span-6" key={task.task_id}>
              <div className="task-title"><span>{task.task_id}: {task.title}</span><span className="chip">{task.priority}</span></div>
              <p>{task.description}</p>
              <div className="chips">
                <span className="chip">{task.phase}</span>
                <span className="chip">{task.estimated_complexity}</span>
                {executedTaskIds.has(task.task_id) ? <span className="chip">Done</span> : null}
              </div>
              <button className="secondary-button" type="button" onClick={() => onExecute(task)} disabled={nextTaskId !== task.task_id && !executedTaskIds.has(task.task_id)}>
                <Play size={14} /> Execute
              </button>
            </div>
          ))}
          {!plan ? <div className="empty-state span-12"><h3>No plan generated yet</h3><p>Create a plan to see atomic tasks, dependencies, and execution order.</p></div> : null}
        </div>
      </div>
    </motion.section>
  );
}

function AssistantPanel(props: {
  messages: ChatMessage[];
  input: string;
  isChatting: boolean;
  applyChanges: boolean;
  inputRef: RefObject<HTMLTextAreaElement>;
  setApplyChanges: (value: boolean) => void;
  setInput: (value: string) => void;
  onSubmit: (event?: FormEvent) => void;
}) {
  return (
    <aside className="assistant">
      <div>
        <div className="panel-header">
          <div>
            <div className="panel-kicker">AI Assistant</div>
            <h2 className="panel-title">Chat</h2>
          </div>
          <label className="chip">
            <input type="checkbox" checked={props.applyChanges} onChange={(event) => props.setApplyChanges(event.target.checked)} />
            Apply
          </label>
        </div>
        <div className="assistant-tabs">
          <button className="assistant-tab active" type="button">Chat</button>
          <button className="assistant-tab" type="button">Suggestions</button>
          <button className="assistant-tab" type="button">Errors</button>
          <button className="assistant-tab" type="button">Docs</button>
        </div>
      </div>
      <div className="chat-scroll">
        {props.messages.length === 0 ? (
          <div className="message">
            <span className="message-avatar"><Sparkles size={16} /></span>
            <div className="bubble">Ask me to explain, fix, optimize, or extend the generated document upload application.</div>
          </div>
        ) : null}
        <AnimatePresence initial={false}>
          {props.messages.map((message) => (
            <motion.div className={`message ${message.role}`} key={message.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {message.role === "assistant" ? <span className="message-avatar"><Sparkles size={16} /></span> : null}
              <div className="bubble"><CodeBlock text={message.text} /></div>
              {message.role === "user" ? <span className="message-avatar user">You</span> : null}
            </motion.div>
          ))}
        </AnimatePresence>
        {props.isChatting ? (
          <div className="message"><span className="message-avatar"><Sparkles size={16} /></span><div className="bubble">Akriti is thinking...</div></div>
        ) : null}
      </div>
      <div className="assistant-footer">
        <form className="chat-composer" onSubmit={props.onSubmit}>
          <textarea ref={props.inputRef} value={props.input} onChange={(event) => props.setInput(event.target.value)} placeholder="Type your prompt here..." />
          <button className="send-button" type="submit"><Send size={18} /></button>
        </form>
        <div className="assistant-actions">
          <button className="secondary-button" type="button" onClick={() => props.setInput("Explain this generated project")}>Explain Code</button>
          <button className="secondary-button" type="button" onClick={() => props.setInput("Optimize this code and apply safe changes")}>Optimize Code</button>
          <button className="secondary-button" type="button" onClick={() => props.setInput("Fix errors in the selected file")}>Fix Errors</button>
          <button className="secondary-button" type="button" onClick={() => props.setInput("Generate a component diagram")}>Generate Diagram</button>
        </div>
      </div>
    </aside>
  );
}

function WorkspaceModal(props: {
  projects: string[];
  files: string[];
  activeProject: string;
  activeFile: string;
  fileContent: string;
  setActiveProject: (project: string) => void;
  openFile: (file: string) => void;
  setFileContent: (content: string) => void;
  saveFile: () => void;
  close: () => void;
  refresh: () => void;
}) {
  return (
    <motion.div className="workspace-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section className="card modal-panel" initial={{ y: 20, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.98 }}>
        <div className="panel-header">
          <div>
            <div className="panel-kicker">Generated code workspace</div>
            <h2 className="panel-title">Files</h2>
          </div>
          <div className="editor-actions">
            <button className="secondary-button" type="button" onClick={props.refresh}>Refresh</button>
            <button className="ghost-button" type="button" onClick={props.close}><X size={16} /> Close</button>
          </div>
        </div>
        <div className="workspace-grid">
          <aside>
            <select value={props.activeProject} onChange={(event) => props.setActiveProject(event.target.value)}>
              {props.projects.map((project) => <option key={project} value={project}>{project}</option>)}
            </select>
            <div className="file-list">
              {props.files.map((file) => (
                <button className={`file-button ${file === props.activeFile ? "active" : ""}`} key={file} type="button" onClick={() => props.openFile(file)}>
                  {file}
                </button>
              ))}
            </div>
          </aside>
          <section>
            <div className="section-heading">
              <h3>{props.activeFile || "No file selected"}</h3>
              <button className="primary-button" type="button" onClick={props.saveFile} disabled={!props.activeFile}>Save File</button>
            </div>
            <textarea className="code-editor" value={props.fileContent} onChange={(event) => props.setFileContent(event.target.value)} placeholder="Select a generated file to edit." />
          </section>
        </div>
      </motion.section>
    </motion.div>
  );
}

function createDiagramText(understanding: ProjectUnderstanding | null, plan: ExecutionPlan | null): string {
  if (!understanding && !plan) {
    return "Component Architecture\n\nUpload a document to generate an architecture diagram summary.";
  }
  return `Component Architecture

${understanding?.project_name || "Project"}
├─ Pages: ${understanding?.pages.length || 0}
├─ Components: ${understanding?.components.length || 0}
├─ APIs: ${understanding?.apis.length || 0}
├─ Database Entities: ${understanding?.database_entities.length || 0}
└─ Execution Phases
${(plan?.phases || []).map((phase) => `   ├─ ${phase}`).join("\n") || "   └─ Generate a plan to view phases"}`;
}

function createLogs(result: ExecutionResult | null, status: string): string {
  return [
    `[status] ${status}`,
    result ? `[execution] ${result.task_id}: ${result.summary}` : "[execution] No task executed yet.",
    ...(result?.warnings || []).map((warning) => `[warning] ${warning}`),
  ].join("\n");
}
