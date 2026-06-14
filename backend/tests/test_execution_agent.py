from __future__ import annotations

import pytest

from backend.agents.execution_agent import ExecutionAgent, ExecutionValidationError
from backend.schemas.execution_plan_schema import ExecutionPlan
from backend.schemas.project_schema import ProjectUnderstanding
from backend.schemas.task_schema import Task
from backend.services.file_system_service import FileSystemService


class FakeCodexService:
    def execute_prompt(self, system_prompt: str, user_prompt: str) -> dict[str, object]:
        task_id = "TASK-001"
        if '"task_id": "TASK-002"' in user_prompt:
            task_id = "TASK-002"
        if '"task_id": "TASK-003"' in user_prompt:
            task_id = "TASK-003"
        if '"task_id": "TASK-004"' in user_prompt:
            task_id = "TASK-004"

        return {
            "task_id": task_id,
            "status": "completed",
            "summary": f"Executed {task_id} with implementation-ready changes.",
            "changes": [
                {
                    "file_path": f"app/{task_id.lower()}.py",
                    "change_type": "created",
                    "description": "Created the primary implementation file for the task.",
                    "content": f"def implemented_task() -> str:\n    return \"{task_id}\"\n",
                }
            ],
            "implementation_notes": [
                "Implemented according to task acceptance criteria.",
                "Kept the change scoped to the requested task.",
            ],
            "warnings": [],
            "next_recommended_tasks": ["TASK-004"] if task_id != "TASK-004" else [],
        }


def make_project_understanding() -> ProjectUnderstanding:
    return ProjectUnderstanding(
        project_name="OpsBoard",
        summary="A SaaS dashboard with authentication, reporting, and team management.",
        functional_requirements=[
            "Users can sign up and log in.",
            "Users can view dashboard metrics.",
            "Admins can manage teams.",
        ],
        non_functional_requirements=["The application must be secure and responsive."],
        pages=["Login", "Dashboard"],
        database_entities=["User", "Session", "Metric"],
        apis=["POST /auth/login", "GET /dashboard/metrics"],
        components=["LoginForm", "DashboardGrid", "MetricCard"],
        user_flows=["User logs in and views dashboard metrics."],
        implementation_notes=["Use JWT authentication and PostgreSQL."],
    )


def make_execution_plan() -> ExecutionPlan:
    return ExecutionPlan(
        project_type="SaaS Dashboard",
        architecture_style="Modular monolith with layered API architecture",
        recommended_stack=["Python 3.12", "FastAPI", "PostgreSQL", "React", "TypeScript"],
        phases=["Project Setup", "Database Design", "Authentication", "Frontend Development"],
        tasks=[
            Task(
                task_id="TASK-001",
                title="Design User Database Schema",
                description="Define the User and Session tables for authentication.",
                phase="Database Design",
                priority="high",
                estimated_complexity="medium",
                dependencies=[],
                acceptance_criteria=[
                    "User table includes identity fields.",
                    "Session table supports token lifecycle.",
                ],
            ),
            Task(
                task_id="TASK-002",
                title="Create JWT Authentication Service",
                description="Implement JWT token creation, validation, and failure handling.",
                phase="Authentication",
                priority="high",
                estimated_complexity="medium",
                dependencies=["TASK-001"],
                acceptance_criteria=[
                    "JWT creation works.",
                    "JWT validation works.",
                    "Invalid tokens are rejected.",
                ],
            ),
            Task(
                task_id="TASK-003",
                title="Create Login Page",
                description="Implement a login UI with email/password validation and API integration.",
                phase="Frontend Development",
                priority="high",
                estimated_complexity="medium",
                dependencies=["TASK-002"],
                acceptance_criteria=[
                    "Form renders.",
                    "Email validation works.",
                    "Password validation works.",
                    "Authentication API integration works.",
                ],
            ),
            Task(
                task_id="TASK-004",
                title="Create Dashboard Page",
                description="Implement dashboard metrics UI after authentication.",
                phase="Frontend Development",
                priority="medium",
                estimated_complexity="medium",
                dependencies=["TASK-002"],
                acceptance_criteria=[
                    "Dashboard renders.",
                    "Metrics API integration works.",
                    "Loading and error states work.",
                ],
            ),
        ],
        execution_order=["TASK-001", "TASK-002", "TASK-003", "TASK-004"],
    )


@pytest.fixture()
def agent(tmp_path) -> ExecutionAgent:  # type: ignore[no-untyped-def]
    return ExecutionAgent(
        codex_service=FakeCodexService(),  # type: ignore[arg-type]
        file_system_service=FileSystemService(output_root=tmp_path),
    )


def test_execute_database_schema_task(agent: ExecutionAgent) -> None:
    project = make_project_understanding()
    plan = make_execution_plan()
    task = plan.tasks[0]

    result = agent.execute_task(project, plan, task)

    assert result.task_id == "TASK-001"
    assert result.status == "completed"
    assert result.generated_files
    assert result.generated_files[0].file_path.endswith("app\\task-001.py") or result.generated_files[
        0
    ].file_path.endswith("app/task-001.py")


def test_execute_authentication_module_task_includes_dependency_context(agent: ExecutionAgent) -> None:
    project = make_project_understanding()
    plan = make_execution_plan()
    task = plan.tasks[1]

    context = agent.collect_context(project, plan, task)
    result = agent.execute_task(project, plan, task)

    assert context["dependency_tasks"][0]["task_id"] == "TASK-001"
    assert "JWT validation works." in context["acceptance_criteria"]
    assert result.task_id == "TASK-002"


def test_execute_login_page_task(agent: ExecutionAgent) -> None:
    project = make_project_understanding()
    plan = make_execution_plan()
    task = plan.tasks[2]

    prompt = agent.build_execution_prompt(agent.collect_context(project, plan, task))
    result = agent.execute_task(project, plan, task)

    assert "Create Login Page" in prompt
    assert "Email validation works." in prompt
    assert result.task_id == "TASK-003"
    assert result.next_recommended_tasks


def test_execute_dashboard_page_task(agent: ExecutionAgent) -> None:
    project = make_project_understanding()
    plan = make_execution_plan()
    task = plan.tasks[3]

    result = agent.execute_task(project, plan, task)

    assert result.task_id == "TASK-004"
    assert result.status == "completed"
    assert result.next_recommended_tasks == []


def test_execute_rejects_task_not_in_plan(agent: ExecutionAgent) -> None:
    project = make_project_understanding()
    plan = make_execution_plan()
    unknown_task = Task(
        task_id="TASK-999",
        title="Unknown Task",
        description="This task is not in the plan.",
        phase="Frontend Development",
        priority="low",
        estimated_complexity="small",
        dependencies=[],
        acceptance_criteria=["Task should be rejected."],
    )

    with pytest.raises(ExecutionValidationError, match="not present"):
        agent.execute_task(project, plan, unknown_task)


def test_generate_execution_report_from_values_validates_task_id(agent: ExecutionAgent) -> None:
    task = make_execution_plan().tasks[0]
    result = agent.generate_execution_report_from_values(
        task=task,
        summary="Generated schema implementation.",
        generated_files=[
            {
                "file_path": "backend/models/user.py",
                "change_type": "created",
                "description": "Created User model.",
            }
        ],
        modified_files=[],
        implementation_notes=["Schema follows requirements."],
        warnings=[],
        next_recommended_tasks=["TASK-002"],
    )

    assert result.task_id == "TASK-001"
    assert result.generated_files[0].change_type == "created"
