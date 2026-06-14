from __future__ import annotations

import logging
from collections import deque
from typing import Any

from pydantic import ValidationError

from prompts.planning_prompt import PLANNING_SYSTEM_PROMPT, build_planning_user_prompt
from schemas.execution_plan_schema import ExecutionPlan
from schemas.planning_request import PlanComplexity
from schemas.project_schema import ProjectUnderstanding
from schemas.task_schema import Task, TaskComplexity, TaskPriority
from services.openai_service import ModelResponseError
from services.planning_service import PlanningService

logger = logging.getLogger(__name__)


class PlanningValidationError(ValueError):
    """Raised when a generated execution plan fails planning rules."""


class PlanningAgent:
    """Agent that converts project understanding into an execution plan."""

    def __init__(self, planning_service: PlanningService | None = None) -> None:
        self.planning_service = planning_service or PlanningService()

    def create_plan(
        self,
        project_understanding: ProjectUnderstanding,
        complexity: PlanComplexity = "medium",
    ) -> ExecutionPlan:
        logger.info("Planning started")
        prompt = build_planning_user_prompt(project_understanding, complexity=complexity)
        raw_plan = self.planning_service.create_execution_plan(
            system_prompt=PLANNING_SYSTEM_PROMPT,
            user_prompt=prompt,
        )
        plan = self._validate_raw_plan(raw_plan)
        self.validate_dependencies(plan)
        logger.info("Plan completed")
        return plan

    def generate_phases(self, project_understanding: ProjectUnderstanding) -> list[str]:
        phases = ["Project Setup"]

        if project_understanding.database_entities:
            phases.append("Database Design")
        if project_understanding.components or project_understanding.implementation_notes:
            phases.append("Backend Development")
        if project_understanding.apis:
            phases.append("API Development")
        if project_understanding.pages:
            phases.append("Frontend Development")
        if self._requires_authentication(project_understanding):
            phases.append("Authentication")

        phases.extend(["Testing", "Deployment"])
        return list(dict.fromkeys(phases))

    def generate_tasks(self, project_understanding: ProjectUnderstanding) -> list[Task]:
        phases = self.generate_phases(project_understanding)
        tasks: list[Task] = []

        def add_task(
            title: str,
            description: str,
            phase: str,
            priority: TaskPriority,
            complexity: TaskComplexity,
            dependencies: list[str],
            acceptance_criteria: list[str],
        ) -> str:
            task_id = f"TASK-{len(tasks) + 1:03d}"
            tasks.append(
                Task(
                    task_id=task_id,
                    title=title,
                    description=description,
                    phase=phase,
                    priority=priority,
                    estimated_complexity=complexity,
                    dependencies=dependencies,
                    acceptance_criteria=acceptance_criteria,
                )
            )
            return task_id

        setup_id = add_task(
            title="Initialize Project Repository",
            description="Create the application repository, configure Python runtime, dependency management, formatting, and environment loading.",
            phase="Project Setup",
            priority="high",
            complexity="small",
            dependencies=[],
            acceptance_criteria=[
                "Repository structure is created.",
                "Runtime dependencies are documented.",
                "Environment configuration is supported.",
            ],
        )

        database_ids: list[str] = []
        if "Database Design" in phases:
            for entity in project_understanding.database_entities:
                database_ids.append(
                    add_task(
                        title=f"Design {entity} Data Model",
                        description=f"Define fields, relationships, indexes, and validation rules for {entity}.",
                        phase="Database Design",
                        priority="high",
                        complexity="medium",
                        dependencies=[setup_id],
                        acceptance_criteria=[
                            f"{entity} schema is documented.",
                            "Relationships and constraints are defined.",
                            "Migration impact is clear.",
                        ],
                    )
                )

        api_ids: list[str] = []
        api_dependency = database_ids[-1:] or [setup_id]
        if "API Development" in phases:
            for api in project_understanding.apis:
                api_ids.append(
                    add_task(
                        title=f"Implement {api}",
                        description=f"Build and validate the {api} endpoint or integration contract.",
                        phase="API Development",
                        priority="high",
                        complexity="medium",
                        dependencies=api_dependency,
                        acceptance_criteria=[
                            "Endpoint request validation is implemented.",
                            "Success and error responses are defined.",
                            "Automated tests cover expected behavior.",
                        ],
                    )
                )

        auth_dependencies = api_ids[:1] or database_ids[-1:] or [setup_id]
        if "Authentication" in phases:
            add_task(
                title="Create Authentication Middleware",
                description="Implement authentication checks and route protection for protected application behavior.",
                phase="Authentication",
                priority="high",
                complexity="medium",
                dependencies=auth_dependencies,
                acceptance_criteria=[
                    "Protected routes reject unauthenticated requests.",
                    "Authenticated requests expose user context.",
                    "Authorization failures return consistent errors.",
                ],
            )

        frontend_dependencies = api_ids or [setup_id]
        if "Frontend Development" in phases:
            for page in project_understanding.pages:
                add_task(
                    title=f"Create {page} Page",
                    description=f"Implement the {page} UI with loading, empty, success, and error states.",
                    phase="Frontend Development",
                    priority="medium",
                    complexity="medium",
                    dependencies=frontend_dependencies[:2],
                    acceptance_criteria=[
                        "Page renders successfully.",
                        "Form or interaction validation works when applicable.",
                        "Error handling is visible to users.",
                        "Relevant API integration works when applicable.",
                    ],
                )

        test_dependency = [tasks[-1].task_id]
        add_task(
            title="Create End-to-End Smoke Tests",
            description="Cover the critical user flows with automated smoke tests.",
            phase="Testing",
            priority="medium",
            complexity="medium",
            dependencies=test_dependency,
            acceptance_criteria=[
                "Critical flows are covered by tests.",
                "Tests can run in a clean environment.",
                "Failures provide actionable diagnostics.",
            ],
        )
        add_task(
            title="Prepare Production Deployment",
            description="Configure production settings, deployment documentation, and release checks.",
            phase="Deployment",
            priority="medium",
            complexity="small",
            dependencies=[tasks[-1].task_id],
            acceptance_criteria=[
                "Production environment variables are documented.",
                "Deployment command or pipeline is documented.",
                "Health checks are available after deployment.",
            ],
        )

        logger.info("Tasks generated: %d", len(tasks))
        return tasks

    def validate_dependencies(self, plan: ExecutionPlan) -> None:
        try:
            ExecutionPlan.model_validate(plan.model_dump())
        except ValidationError as exc:
            logger.exception("Validation errors in planning dependencies")
            raise PlanningValidationError(str(exc)) from exc
        logger.info("Dependencies generated and validated")

    def build_deterministic_plan(self, project_understanding: ProjectUnderstanding) -> ExecutionPlan:
        tasks = self.generate_tasks(project_understanding)
        phases = self.generate_phases(project_understanding)
        raw_plan = {
            "project_type": self._infer_project_type(project_understanding),
            "architecture_style": self._recommend_architecture(project_understanding),
            "recommended_stack": self._recommend_stack(project_understanding),
            "phases": phases,
            "tasks": [task.model_dump() for task in tasks],
            "execution_order": self._topological_order(tasks),
        }
        return self._validate_raw_plan(raw_plan)

    @staticmethod
    def _validate_raw_plan(raw_plan: dict[str, Any]) -> ExecutionPlan:
        try:
            return ExecutionPlan.model_validate(raw_plan)
        except ValidationError as exc:
            logger.exception("Invalid execution plan response")
            raise ModelResponseError("Planning response did not match ExecutionPlan schema.") from exc

    @staticmethod
    def _requires_authentication(project_understanding: ProjectUnderstanding) -> bool:
        haystack = " ".join(
            [
                project_understanding.summary,
                *project_understanding.functional_requirements,
                *project_understanding.non_functional_requirements,
                *project_understanding.pages,
                *project_understanding.apis,
                *project_understanding.user_flows,
            ]
        ).lower()
        return any(term in haystack for term in ["auth", "login", "signup", "sign up", "role", "user"])

    @staticmethod
    def _infer_project_type(project_understanding: ProjectUnderstanding) -> str:
        text = f"{project_understanding.project_name} {project_understanding.summary}".lower()
        if any(term in text for term in ["e-commerce", "commerce", "shop", "store", "checkout"]):
            return "E-commerce Application"
        if any(term in text for term in ["saas", "dashboard", "tenant", "subscription"]):
            return "SaaS Dashboard"
        if any(term in text for term in ["ai", "agent", "model", "llm"]):
            return "AI Application"
        return "Web Application"

    @staticmethod
    def _recommend_architecture(project_understanding: ProjectUnderstanding) -> str:
        if len(project_understanding.apis) > 8 or len(project_understanding.database_entities) > 8:
            return "Modular service-oriented architecture"
        return "Modular monolith with layered API architecture"

    @staticmethod
    def _recommend_stack(project_understanding: ProjectUnderstanding) -> list[str]:
        stack = ["Python 3.12", "FastAPI", "Pydantic", "PostgreSQL", "Pytest"]
        if project_understanding.pages:
            stack.extend(["React", "TypeScript"])
        if any("ai" in note.lower() or "model" in note.lower() for note in project_understanding.implementation_notes):
            stack.append("OpenAI SDK")
        return list(dict.fromkeys(stack))

    @staticmethod
    def _topological_order(tasks: list[Task]) -> list[str]:
        task_ids = {task.task_id for task in tasks}
        dependents: dict[str, list[str]] = {task_id: [] for task_id in task_ids}
        dependency_count: dict[str, int] = {task.task_id: len(task.dependencies) for task in tasks}

        for task in tasks:
            for dependency in task.dependencies:
                dependents[dependency].append(task.task_id)

        ready = deque([task.task_id for task in tasks if dependency_count[task.task_id] == 0])
        order: list[str] = []
        while ready:
            task_id = ready.popleft()
            order.append(task_id)
            for dependent in dependents[task_id]:
                dependency_count[dependent] -= 1
                if dependency_count[dependent] == 0:
                    ready.append(dependent)

        if len(order) != len(task_ids):
            raise PlanningValidationError("Could not create execution order due to circular dependencies.")
        return order
