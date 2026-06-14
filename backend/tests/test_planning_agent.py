from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.agents.planning_agent import PlanningAgent
from backend.schemas.execution_plan_schema import ExecutionPlan
from backend.schemas.project_schema import ProjectUnderstanding


class FakePlanningService:
    def create_execution_plan(self, system_prompt: str, user_prompt: str) -> dict[str, object]:
        return {
            "project_type": "SaaS Dashboard",
            "architecture_style": "Modular monolith with layered API architecture",
            "recommended_stack": ["Python 3.12", "FastAPI", "PostgreSQL", "React", "TypeScript"],
            "phases": ["Project Setup", "Database Design", "API Development", "Frontend Development", "Testing"],
            "tasks": [
                {
                    "task_id": "TASK-001",
                    "title": "Initialize Project Repository",
                    "description": "Create the repository and runtime configuration.",
                    "phase": "Project Setup",
                    "priority": "high",
                    "estimated_complexity": "small",
                    "dependencies": [],
                    "acceptance_criteria": ["Repository structure is created."],
                },
                {
                    "task_id": "TASK-002",
                    "title": "Design Account Data Model",
                    "description": "Define account fields and relationships.",
                    "phase": "Database Design",
                    "priority": "high",
                    "estimated_complexity": "medium",
                    "dependencies": ["TASK-001"],
                    "acceptance_criteria": ["Account schema is documented."],
                },
                {
                    "task_id": "TASK-003",
                    "title": "Create Dashboard Page",
                    "description": "Implement dashboard UI.",
                    "phase": "Frontend Development",
                    "priority": "medium",
                    "estimated_complexity": "medium",
                    "dependencies": ["TASK-002"],
                    "acceptance_criteria": ["Page renders successfully."],
                },
            ],
            "execution_order": ["TASK-001", "TASK-002", "TASK-003"],
        }


def make_project_understanding(
    project_name: str,
    summary: str,
    functional_requirements: list[str],
    pages: list[str],
    database_entities: list[str],
    apis: list[str],
    implementation_notes: list[str] | None = None,
) -> ProjectUnderstanding:
    return ProjectUnderstanding(
        project_name=project_name,
        summary=summary,
        functional_requirements=functional_requirements,
        non_functional_requirements=["The application must be reliable and secure."],
        pages=pages,
        database_entities=database_entities,
        apis=apis,
        components=["Navigation", "DataTable", "Form"],
        user_flows=["User signs in and completes the primary workflow."],
        implementation_notes=implementation_notes or [],
    )


def test_create_plan_uses_planning_service_and_validates_response() -> None:
    agent = PlanningAgent(planning_service=FakePlanningService())  # type: ignore[arg-type]
    project = make_project_understanding(
        project_name="MetricsHQ",
        summary="A SaaS dashboard for account analytics.",
        functional_requirements=["Users can view account metrics."],
        pages=["Dashboard"],
        database_entities=["Account"],
        apis=["GET /metrics"],
    )

    plan = agent.create_plan(project)

    assert plan.project_type == "SaaS Dashboard"
    assert plan.execution_order == ["TASK-001", "TASK-002", "TASK-003"]
    assert all(task.acceptance_criteria for task in plan.tasks)


def test_ecommerce_project_generates_relevant_plan() -> None:
    agent = PlanningAgent(planning_service=FakePlanningService())  # type: ignore[arg-type]
    project = make_project_understanding(
        project_name="ShopPilot",
        summary="An e-commerce store with product catalog, cart, checkout, and orders.",
        functional_requirements=[
            "Customers can browse products.",
            "Customers can add items to cart.",
            "Customers can complete checkout.",
        ],
        pages=["Product List", "Product Detail", "Cart", "Checkout"],
        database_entities=["User", "Product", "Cart", "Order", "Payment"],
        apis=["GET /products", "POST /cart/items", "POST /checkout", "GET /orders"],
    )

    plan = agent.build_deterministic_plan(project)

    assert plan.project_type == "E-commerce Application"
    assert "Database Design" in plan.phases
    assert "Frontend Development" in plan.phases
    assert any(task.title == "Create Checkout Page" for task in plan.tasks)
    assert set(plan.execution_order) == {task.task_id for task in plan.tasks}


def test_saas_dashboard_generates_authentication_and_dashboard_tasks() -> None:
    agent = PlanningAgent(planning_service=FakePlanningService())  # type: ignore[arg-type]
    project = make_project_understanding(
        project_name="OpsBoard",
        summary="A SaaS dashboard with subscriptions, teams, roles, and reporting.",
        functional_requirements=[
            "Users can log in.",
            "Admins can manage team roles.",
            "Users can view reports.",
        ],
        pages=["Login", "Team Management", "Reports Dashboard"],
        database_entities=["User", "Team", "Role", "Subscription", "Report"],
        apis=["POST /auth/login", "GET /reports", "PATCH /teams/{team_id}/roles"],
    )

    plan = agent.build_deterministic_plan(project)

    assert plan.project_type == "SaaS Dashboard"
    assert "Authentication" in plan.phases
    assert any("Authentication Middleware" in task.title for task in plan.tasks)
    assert any(task.title == "Create Reports Dashboard Page" for task in plan.tasks)


def test_ai_application_recommends_openai_sdk_when_notes_reference_models() -> None:
    agent = PlanningAgent(planning_service=FakePlanningService())  # type: ignore[arg-type]
    project = make_project_understanding(
        project_name="SupportAI",
        summary="An AI application that classifies support tickets and drafts replies.",
        functional_requirements=[
            "Users can upload support tickets.",
            "The system generates draft responses.",
        ],
        pages=["Ticket Upload", "Review Draft"],
        database_entities=["Ticket", "DraftResponse", "User"],
        apis=["POST /tickets", "POST /tickets/{ticket_id}/draft"],
        implementation_notes=["Use an LLM model for response drafting."],
    )

    plan = agent.build_deterministic_plan(project)

    assert plan.project_type == "AI Application"
    assert "OpenAI SDK" in plan.recommended_stack
    assert all(task.acceptance_criteria for task in plan.tasks)


def test_execution_plan_rejects_missing_dependency_reference() -> None:
    with pytest.raises(ValidationError, match="missing task IDs"):
        ExecutionPlan.model_validate(
            {
                "project_type": "Web Application",
                "architecture_style": "Modular monolith",
                "recommended_stack": ["Python"],
                "phases": ["Project Setup"],
                "tasks": [
                    {
                        "task_id": "TASK-001",
                        "title": "Initialize Project",
                        "description": "Create setup.",
                        "phase": "Project Setup",
                        "priority": "high",
                        "estimated_complexity": "small",
                        "dependencies": ["TASK-999"],
                        "acceptance_criteria": ["Setup exists."],
                    }
                ],
                "execution_order": ["TASK-001"],
            }
        )


def test_execution_plan_rejects_circular_dependencies() -> None:
    with pytest.raises(ValidationError, match="Circular dependency"):
        ExecutionPlan.model_validate(
            {
                "project_type": "Web Application",
                "architecture_style": "Modular monolith",
                "recommended_stack": ["Python"],
                "phases": ["Project Setup"],
                "tasks": [
                    {
                        "task_id": "TASK-001",
                        "title": "Task One",
                        "description": "First task.",
                        "phase": "Project Setup",
                        "priority": "high",
                        "estimated_complexity": "small",
                        "dependencies": ["TASK-002"],
                        "acceptance_criteria": ["Done."],
                    },
                    {
                        "task_id": "TASK-002",
                        "title": "Task Two",
                        "description": "Second task.",
                        "phase": "Project Setup",
                        "priority": "high",
                        "estimated_complexity": "small",
                        "dependencies": ["TASK-001"],
                        "acceptance_criteria": ["Done."],
                    },
                ],
                "execution_order": ["TASK-001", "TASK-002"],
            }
        )


def test_execution_plan_rejects_invalid_execution_order() -> None:
    with pytest.raises(ValidationError, match="before dependency"):
        ExecutionPlan.model_validate(
            {
                "project_type": "Web Application",
                "architecture_style": "Modular monolith",
                "recommended_stack": ["Python"],
                "phases": ["Project Setup", "API Development"],
                "tasks": [
                    {
                        "task_id": "TASK-001",
                        "title": "Initialize Project",
                        "description": "Create setup.",
                        "phase": "Project Setup",
                        "priority": "high",
                        "estimated_complexity": "small",
                        "dependencies": [],
                        "acceptance_criteria": ["Setup exists."],
                    },
                    {
                        "task_id": "TASK-002",
                        "title": "Implement API",
                        "description": "Create API.",
                        "phase": "API Development",
                        "priority": "high",
                        "estimated_complexity": "medium",
                        "dependencies": ["TASK-001"],
                        "acceptance_criteria": ["API works."],
                    },
                ],
                "execution_order": ["TASK-002", "TASK-001"],
            }
        )
