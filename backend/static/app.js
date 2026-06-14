const form = document.querySelector("#analyze-form");
const fileInput = document.querySelector("#file");
const submitButton = document.querySelector("#submit-button");
const clearButton = document.querySelector("#clear-button");
const planButton = document.querySelector("#plan-button");
const editPlanButton = document.querySelector("#edit-plan-button");
const savePlanButton = document.querySelector("#save-plan-button");
const executeButton = document.querySelector("#execute-button");
const runAllButton = document.querySelector("#run-all-button");
const complexityInput = document.querySelector("#complexity");
const output = document.querySelector("#output");
const errorBox = document.querySelector("#error-box");
const statusPill = document.querySelector("#status-pill");
const projectSelect = document.querySelector("#project-select");
const fileList = document.querySelector("#file-list");
const fileContent = document.querySelector("#file-content");
const activeFile = document.querySelector("#active-file");
const saveFileButton = document.querySelector("#save-file-button");
const refreshFilesButton = document.querySelector("#refresh-files-button");
const workspaceRoot = document.querySelector("#workspace-root");
const openWorkspaceButton = document.querySelector("#open-workspace-button");
const closeWorkspaceButton = document.querySelector("#close-workspace-button");
const workspaceModal = document.querySelector("#workspace-modal");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const chatSendButton = document.querySelector("#chat-send-button");
const chatMessages = document.querySelector("#chat-messages");
const applyChatChanges = document.querySelector("#apply-chat-changes");

let latestUnderstanding = null;
let latestPlan = null;
let executedTaskIds = new Set();
let selectedProject = "";
let selectedFile = "";

function setStatus(label, className = "") {
  statusPill.textContent = label;
  statusPill.className = `status-pill ${className}`.trim();
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  setStatus("Error", "error");
}

function clearError() {
  errorBox.textContent = "";
  errorBox.hidden = true;
}

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function setOutput(value) {
  output.textContent = typeof value === "string" ? value : prettyJson(value);
}

function setPlanEditing(enabled) {
  output.contentEditable = enabled ? "true" : "false";
  output.classList.toggle("editing", enabled);
  savePlanButton.disabled = !enabled;
}

async function parseResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { detail: text || "Unexpected non-JSON response." };
  }
}

async function analyzeText(content) {
  return fetch("/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

async function analyzeUpload(content, file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("content", content);

  return fetch("/analyze/upload", {
    method: "POST",
    body: formData,
  });
}

async function createPlan(projectUnderstanding) {
  return fetch("/plan/configured", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_understanding: projectUnderstanding,
      complexity: complexityInput.value,
    }),
  });
}

async function executeTask(projectUnderstanding, executionPlan, task) {
  return fetch("/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_understanding: projectUnderstanding,
      execution_plan: executionPlan,
      task,
    }),
  });
}

function findNextExecutableTask(plan) {
  for (const taskId of plan.execution_order) {
    if (executedTaskIds.has(taskId)) {
      continue;
    }
    const task = plan.tasks.find((candidate) => candidate.task_id === taskId);
    if (!task) {
      return null;
    }
    const dependenciesDone = task.dependencies.every((dependency) =>
      executedTaskIds.has(dependency),
    );
    if (dependenciesDone) {
      return task;
    }
  }
  return null;
}

async function fetchProjects() {
  const response = await fetch("/workspace/projects");
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(typeof payload.detail === "string" ? payload.detail : "Could not load projects.");
  }
  return payload;
}

async function fetchProjectFiles(project) {
  const response = await fetch(`/workspace/projects/${encodeURIComponent(project)}/files`);
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(typeof payload.detail === "string" ? payload.detail : "Could not load files.");
  }
  return payload.files;
}

async function fetchFile(project, filePath) {
  const response = await fetch(
    `/workspace/projects/${encodeURIComponent(project)}/files/${filePath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
  );
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(typeof payload.detail === "string" ? payload.detail : "Could not read file.");
  }
  return payload.content;
}

async function saveFile(project, filePath, content) {
  const response = await fetch(
    `/workspace/projects/${encodeURIComponent(project)}/files/${filePath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
  );
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(typeof payload.detail === "string" ? payload.detail : "Could not save file.");
  }
  return payload;
}

async function sendChatMessage(message) {
  const response = await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      project: selectedProject || "",
      file_path: selectedFile || "",
      apply_changes: applyChatChanges.checked,
    }),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(typeof payload.detail === "string" ? payload.detail : "Chat request failed.");
  }
  return payload;
}

function appendChatMessage(role, text) {
  const message = document.createElement("div");
  message.className = `chat-message ${role}`;
  message.textContent = text;
  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function summarizeChatResponse(payload) {
  const lines = [payload.reply];
  const generated = payload.generated_files || [];
  const modified = payload.modified_files || [];
  const warnings = payload.warnings || [];

  if (generated.length > 0) {
    lines.push("", "Created files:", ...generated.map((file) => `- ${file.file_path}`));
  }
  if (modified.length > 0) {
    lines.push("", "Modified files:", ...modified.map((file) => `- ${file.file_path}`));
  }
  if (warnings.length > 0) {
    lines.push("", "Warnings:", ...warnings.map((warning) => `- ${warning}`));
  }
  return lines.join("\n");
}

async function refreshWorkspace(preferredProject = "") {
  try {
    const payload = await fetchProjects();
    workspaceRoot.textContent = payload.output_root;
    projectSelect.innerHTML = "";

    if (payload.projects.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No generated projects yet";
      projectSelect.appendChild(option);
      fileList.innerHTML = "";
      return;
    }

    for (const project of payload.projects) {
      const option = document.createElement("option");
      option.value = project;
      option.textContent = project;
      projectSelect.appendChild(option);
    }

    selectedProject = preferredProject && payload.projects.includes(preferredProject)
      ? preferredProject
      : payload.projects[0];
    projectSelect.value = selectedProject;
    await refreshFileList();
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not refresh workspace.");
  }
}

async function refreshFileList() {
  selectedProject = projectSelect.value;
  selectedFile = "";
  activeFile.textContent = "No file selected";
  fileContent.value = "";
  saveFileButton.disabled = true;
  fileList.innerHTML = "";

  if (!selectedProject) {
    return;
  }

  const files = await fetchProjectFiles(selectedProject);
  for (const filePath of files) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "file-item";
    button.textContent = filePath;
    button.addEventListener("click", () => openFile(filePath));
    fileList.appendChild(button);
  }
}

async function openFile(filePath) {
  try {
    selectedFile = filePath;
    const content = await fetchFile(selectedProject, filePath);
    fileContent.value = content;
    activeFile.textContent = filePath;
    saveFileButton.disabled = false;
    for (const item of fileList.querySelectorAll(".file-item")) {
      item.classList.toggle("active", item.textContent === filePath);
    }
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not open file.");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const content = "";
  const file = fileInput.files[0];

  if (!content && !file) {
    showError("Choose a project file before running analysis.");
    return;
  }

  submitButton.disabled = true;
  planButton.disabled = true;
  editPlanButton.disabled = true;
  savePlanButton.disabled = true;
  executeButton.disabled = true;
  runAllButton.disabled = true;
  latestUnderstanding = null;
  latestPlan = null;
  executedTaskIds = new Set();
  setPlanEditing(false);
  setStatus("Analyzing", "running");
  setOutput("Analyzing project input...");

  try {
    const response = file ? await analyzeUpload(content, file) : await analyzeText(content);
    const payload = await parseResponse(response);

    if (!response.ok) {
      const message = typeof payload.detail === "string" ? payload.detail : prettyJson(payload);
      showError(message);
      setOutput(payload);
      return;
    }

    setOutput(payload);
    latestUnderstanding = payload;
    latestPlan = null;
    executedTaskIds = new Set();
    planButton.disabled = false;
    executeButton.disabled = true;
    setStatus("Complete", "done");
  } catch (error) {
    showError(error instanceof Error ? error.message : "Request failed.");
    setOutput("Request failed. Check that the FastAPI server is running.");
  } finally {
    submitButton.disabled = false;
  }
});

planButton.addEventListener("click", async () => {
  clearError();
  if (!latestUnderstanding) {
    showError("Run an understanding analysis before creating a plan.");
    return;
  }

  submitButton.disabled = true;
  planButton.disabled = true;
  editPlanButton.disabled = true;
  executeButton.disabled = true;
  runAllButton.disabled = true;
  setPlanEditing(false);
  setStatus("Planning", "running");
  setOutput(`Creating ${complexityInput.value} execution plan...`);

  try {
    const response = await createPlan(latestUnderstanding);
    const payload = await parseResponse(response);

    if (!response.ok) {
      const message = typeof payload.detail === "string" ? payload.detail : prettyJson(payload);
      showError(message);
      setOutput(payload);
      return;
    }

    setOutput(payload);
    latestPlan = payload;
    executedTaskIds = new Set();
    editPlanButton.disabled = false;
    executeButton.disabled = false;
    runAllButton.disabled = false;
    setStatus("Plan Ready", "done");
  } catch (error) {
    showError(error instanceof Error ? error.message : "Planning request failed.");
    setOutput("Planning failed. Check that the FastAPI server is running.");
  } finally {
    submitButton.disabled = false;
    planButton.disabled = latestUnderstanding === null;
  }
});

editPlanButton.addEventListener("click", () => {
  if (!latestPlan) {
    showError("Create a plan before editing it.");
    return;
  }
  setPlanEditing(true);
  setStatus("Editing Plan");
});

savePlanButton.addEventListener("click", () => {
  try {
    latestPlan = JSON.parse(output.textContent || "{}");
    setOutput(latestPlan);
    setPlanEditing(false);
    executeButton.disabled = false;
    runAllButton.disabled = false;
    setStatus("Plan Saved", "done");
  } catch {
    showError("Plan JSON is invalid. Fix it before saving.");
  }
});

executeButton.addEventListener("click", async () => {
  clearError();
  if (!latestUnderstanding || !latestPlan) {
    showError("Create a plan before executing a task.");
    return;
  }

  const task = findNextExecutableTask(latestPlan);
  if (!task) {
    showError("No executable task is available. All tasks may already be executed.");
    return;
  }

  submitButton.disabled = true;
  planButton.disabled = true;
  editPlanButton.disabled = true;
  runAllButton.disabled = true;
  executeButton.disabled = true;
  setStatus("Executing", "running");
  setOutput(`Executing ${task.task_id}: ${task.title}`);

  try {
    const response = await executeTask(latestUnderstanding, latestPlan, task);
    const payload = await parseResponse(response);

    if (!response.ok) {
      const message = typeof payload.detail === "string" ? payload.detail : prettyJson(payload);
      showError(message);
      setOutput(payload);
      return;
    }

    executedTaskIds.add(task.task_id);
    setOutput(payload);
    await refreshWorkspace(latestUnderstanding.project_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    setStatus("Executed", "done");
  } catch (error) {
    showError(error instanceof Error ? error.message : "Execution request failed.");
    setOutput("Execution failed. Check that the FastAPI server is running.");
  } finally {
    submitButton.disabled = false;
    planButton.disabled = latestUnderstanding === null;
    editPlanButton.disabled = latestPlan === null;
    runAllButton.disabled = !latestPlan || findNextExecutableTask(latestPlan) === null;
    executeButton.disabled = !latestPlan || findNextExecutableTask(latestPlan) === null;
  }
});

runAllButton.addEventListener("click", async () => {
  clearError();
  if (!latestUnderstanding || !latestPlan) {
    showError("Create a plan before running all tasks.");
    return;
  }

  submitButton.disabled = true;
  planButton.disabled = true;
  editPlanButton.disabled = true;
  executeButton.disabled = true;
  runAllButton.disabled = true;

  try {
    let task = findNextExecutableTask(latestPlan);
    while (task) {
      const completed = executedTaskIds.size + 1;
      setStatus(`Executing ${completed}/${latestPlan.tasks.length}`, "running");
      setOutput(`Executing ${task.task_id}: ${task.title}`);
      const response = await executeTask(latestUnderstanding, latestPlan, task);
      const payload = await parseResponse(response);
      if (!response.ok) {
        const message = typeof payload.detail === "string" ? payload.detail : prettyJson(payload);
        showError(message);
        setOutput(payload);
        return;
      }
      executedTaskIds.add(task.task_id);
      setOutput(payload);
      task = findNextExecutableTask(latestPlan);
    }
    await refreshWorkspace(latestUnderstanding.project_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    setStatus("All Tasks Done", "done");
  } catch (error) {
    showError(error instanceof Error ? error.message : "Run all failed.");
  } finally {
    submitButton.disabled = false;
    planButton.disabled = latestUnderstanding === null;
    editPlanButton.disabled = latestPlan === null;
    executeButton.disabled = !latestPlan || findNextExecutableTask(latestPlan) === null;
    runAllButton.disabled = !latestPlan || findNextExecutableTask(latestPlan) === null;
  }
});

clearButton.addEventListener("click", () => {
  form.reset();
  clearError();
  latestUnderstanding = null;
  latestPlan = null;
  executedTaskIds = new Set();
  setPlanEditing(false);
  planButton.disabled = true;
  editPlanButton.disabled = true;
  savePlanButton.disabled = true;
  executeButton.disabled = true;
  runAllButton.disabled = true;
  setStatus("Idle");
  setOutput("Run an analysis to see the validated JSON response here.");
});

projectSelect.addEventListener("change", () => {
  refreshFileList().catch((error) => {
    showError(error instanceof Error ? error.message : "Could not load project files.");
  });
});

refreshFilesButton.addEventListener("click", () => {
  refreshWorkspace(selectedProject);
});

saveFileButton.addEventListener("click", async () => {
  if (!selectedProject || !selectedFile) {
    showError("Select a file before saving.");
    return;
  }
  try {
    await saveFile(selectedProject, selectedFile, fileContent.value);
    setStatus("File Saved", "done");
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not save file.");
  }
});

openWorkspaceButton.addEventListener("click", async () => {
  workspaceModal.hidden = false;
  await refreshWorkspace(selectedProject);
});

closeWorkspaceButton.addEventListener("click", () => {
  workspaceModal.hidden = true;
});

workspaceModal.addEventListener("click", (event) => {
  if (event.target === workspaceModal) {
    workspaceModal.hidden = true;
  }
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const message = chatInput.value.trim();
  if (!message) {
    showError("Enter a chat prompt first.");
    return;
  }

  appendChatMessage("user", message);
  chatInput.value = "";
  chatSendButton.disabled = true;
  setStatus("Chatting", "running");

  try {
    const payload = await sendChatMessage(message);
    appendChatMessage("assistant", summarizeChatResponse(payload));
    if ((payload.generated_files || []).length > 0 || (payload.modified_files || []).length > 0) {
      await refreshWorkspace(selectedProject);
      if (selectedFile) {
        await openFile(selectedFile);
      }
    }
    setStatus("Chat Ready", "done");
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Chat request failed.";
    showError(messageText);
    appendChatMessage("assistant", messageText);
  } finally {
    chatSendButton.disabled = false;
  }
});

refreshWorkspace();
