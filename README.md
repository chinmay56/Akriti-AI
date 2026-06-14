# Akriti

A production-ready AI Software Engineering Assistant with document intelligence, diagram understanding, planning, execution, generated project file editing, and a Codex-style chat workflow.

## Tech Stack

- Python 3.12
- FastAPI
- OpenAI SDK
- Pydantic
- python-dotenv

## Project Structure

```text
Akriti/
|-- backend/
|   |-- agents/
|   |-- prompts/
|   |-- routes/
|   |-- schemas/
|   |-- services/
|   |-- tests/
|   |-- main.py
|   |-- requirements.txt
|   `-- .env.example
|-- frontend/
|   |-- index.html
|   |-- styles.css
|   `-- app.js
|-- extension/
|   |-- src/
|   |-- manifest.json
|   |-- package.json
|   `-- vite.config.ts
|-- README.md
`-- .gitignore
```

The `frontend/` folder contains the Akriti web UI. FastAPI serves it at `/` and serves its assets from `/static`.
The `extension/` folder contains the Chrome visual review extension source. Its `node_modules/` and `dist/` folders are intentionally ignored.

## Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env`:

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5.5
OPENAI_PLANNING_MODEL=gpt-5.5
OPENAI_EXECUTION_MODEL=gpt-5.5
OPENAI_CHAT_MODEL=gpt-5.5
EXECUTION_OUTPUT_DIR=~/Downloads/ai_generated_projects
LOG_LEVEL=INFO
```

## Run Server

From the repository root:

```bash
uvicorn backend.main:app --reload
```

The API will be available at:

```text
http://127.0.0.1:8000
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

## Analyze Project Text

Endpoint:

```text
POST /analyze
```

Example request:

```bash
curl -X POST http://127.0.0.1:8000/analyze ^
  -H "Content-Type: application/json" ^
  -d "{\"content\":\"Build a task management app with users, projects, kanban boards, tasks, comments, and role-based permissions.\"}"
```

Example response:

```json
{
  "project_name": "Task Management App",
  "summary": "A collaborative task management application with projects, kanban boards, tasks, comments, and role-based permissions.",
  "functional_requirements": [
    "Users can manage projects.",
    "Users can manage tasks on kanban boards.",
    "Users can comment on tasks.",
    "The system supports role-based permissions."
  ],
  "non_functional_requirements": [],
  "pages": [
    "Project List",
    "Project Detail",
    "Kanban Board",
    "Task Detail"
  ],
  "database_entities": [
    "User",
    "Project",
    "Task",
    "Comment",
    "Role"
  ],
  "apis": [
    "POST /projects",
    "GET /projects",
    "POST /tasks",
    "PATCH /tasks/{task_id}",
    "POST /tasks/{task_id}/comments"
  ],
  "components": [
    "ProjectList",
    "KanbanBoard",
    "TaskCard",
    "TaskDetail",
    "CommentThread"
  ],
  "user_flows": [
    "User creates a project, adds tasks, moves tasks through kanban columns, and collaborates through comments."
  ],
  "implementation_notes": [
    "Enforce role-based permissions across project and task APIs."
  ]
}
```

## Upload A File

Endpoint:

```text
POST /analyze/upload
```

Supported uploads:

- Text files: `.txt`, `.md`, `.json`, `.csv`, `.tsv`, `.yaml`, `.yml`, `.xml`
- Images: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`

Open the interactive API docs in your browser:

```text
http://127.0.0.1:8000/docs
```

Then expand `POST /analyze/upload`, click **Try it out**, choose a file, optionally add extra context, and click **Execute**.

PowerShell example:

```powershell
curl.exe -X POST http://127.0.0.1:8000/analyze/upload `
  -F "file=@C:\path\to\project-requirements.md" `
  -F "content=Extract pages, APIs, database entities, and user flows."
```

Image upload example:

```powershell
curl.exe -X POST http://127.0.0.1:8000/analyze/upload `
  -F "file=@C:\path\to\ui-mockup.png" `
  -F "content=This is the dashboard mockup for the project."
```

## Image Analysis

The `UnderstandingAgent` also supports image analysis from Python:

```python
from backend.agents.understanding_agent import UnderstandingAgent

agent = UnderstandingAgent()
result = agent.analyze_image("path/to/mockup.png")
print(result.model_dump())
```

For combined text and images:

```python
result = agent.analyze_project(
    content="Analyze this project description with the attached UI mockups.",
    images=["mockup.png", "erd.png"],
)
```

## Create An Execution Plan

Endpoint:

```text
POST /plan
```

The Planning Agent consumes the `ProjectUnderstanding` JSON produced by `/analyze` and returns an implementation-ready `ExecutionPlan`.

Example request:

```powershell
curl.exe -X POST http://127.0.0.1:8000/plan `
  -H "Content-Type: application/json" `
  -d "{\"project_name\":\"TaskFlow\",\"summary\":\"A task management app.\",\"functional_requirements\":[\"Users can create tasks.\"],\"non_functional_requirements\":[\"The app must be secure.\"],\"pages\":[\"Login\",\"Kanban Board\"],\"database_entities\":[\"User\",\"Task\"],\"apis\":[\"POST /auth/login\",\"POST /tasks\"],\"components\":[\"LoginForm\",\"TaskCard\"],\"user_flows\":[\"User logs in and creates a task.\"],\"implementation_notes\":[\"Use PostgreSQL.\"]}"
```

Example response shape:

```json
{
  "project_type": "SaaS Dashboard",
  "architecture_style": "Modular monolith with layered API architecture",
  "recommended_stack": ["Python 3.12", "FastAPI", "PostgreSQL", "React", "TypeScript"],
  "phases": ["Project Setup", "Database Design", "API Development", "Frontend Development", "Testing", "Deployment"],
  "tasks": [
    {
      "task_id": "TASK-001",
      "title": "Initialize Project Repository",
      "description": "Create the repository and runtime configuration.",
      "phase": "Project Setup",
      "priority": "high",
      "estimated_complexity": "small",
      "dependencies": [],
      "acceptance_criteria": ["Repository structure is created."]
    }
  ],
  "execution_order": ["TASK-001"]
}
```

## Execute A Development Task

Endpoint:

```text
POST /execute
```

The Execution Agent consumes:

- `project_understanding`: output from `/analyze`
- `execution_plan`: output from `/plan`
- `task`: one task from `execution_plan.tasks`

The browser UI supports the full flow:

1. Paste project input and click `Analyze`.
2. Choose `Simple`, `Medium`, or `Hard`.
3. Click `Create Plan`.
4. Optionally click `Edit Plan`, change the JSON, then click `Save Plan`.
5. Click `Execute Next Task` or `Run All Tasks`.

The API returns a structured execution report:

```json
{
  "task_id": "TASK-001",
  "status": "completed",
  "summary": "Implemented the requested task.",
  "generated_files": [
    {
      "file_path": "backend/models/user.py",
      "change_type": "created",
      "description": "Created the User model."
    }
  ],
  "modified_files": [],
  "implementation_notes": ["Implementation follows the task acceptance criteria."],
  "warnings": [],
  "next_recommended_tasks": ["TASK-002"]
}
```

Generated code is written to:

```text
~/Downloads/ai_generated_projects/<project-name>/
```

On this Windows laptop, that normally resolves to:

```text
C:\Users\Nikhi\Downloads\ai_generated_projects\<project-name>\
```

The web app also includes a generated-code workspace panel. Use `Refresh Files`, choose the project folder, select a file, edit it in the browser, and click `Save File`.

The web app includes a Codex-style chat panel. Select a generated project or file, then ask for error fixes, code changes, explanations, or new features. When `Apply changes` is checked, returned file changes are written safely inside the selected generated project.

For safety, the Execution Agent only accepts relative artifact paths and blocks path traversal such as `../`. This keeps generated demo code isolated from the agent backend.

## Error Handling

The API handles:

- Missing or invalid OpenAI API key
- Invalid model responses
- JSON parsing errors
- Schema validation failures and missing fields
- Invalid request content

## Run Tests

```bash
python -m pytest backend
```

The sample test uses a fake OpenAI service, so it does not require an API key.
