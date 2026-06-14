from __future__ import annotations

import logging
from typing import Any

from pydantic import ValidationError

from backend.prompts.execution_prompt import EXECUTION_SYSTEM_PROMPT, build_execution_user_prompt
from backend.schemas.execution_artifact import ExecutionArtifactPlan
from backend.schemas.execution_plan_schema import ExecutionPlan
from backend.schemas.execution_result import ExecutionResult
from backend.schemas.project_schema import ProjectUnderstanding
from backend.schemas.task_schema import Task
from backend.services.codex_service import CodexService
from backend.services.file_system_service import FileSystemService, FileSystemServiceError
from backend.services.openai_service import ModelResponseError

logger = logging.getLogger(__name__)


class ExecutionValidationError(ValueError):
    """Raised when task execution input or output fails validation."""


class ExecutionAgent:
    """Codex-style orchestrator for executing one development task at a time."""

    def __init__(
        self,
        codex_service: CodexService | None = None,
        file_system_service: FileSystemService | None = None,
    ) -> None:
        self.codex_service = codex_service or CodexService()
        self.file_system_service = file_system_service or FileSystemService()

    def execute_task(
        self,
        project_understanding: ProjectUnderstanding,
        execution_plan: ExecutionPlan,
        task: Task,
    ) -> ExecutionResult:
        logger.info("Task received: %s", task.task_id)
        self._validate_task_reference(execution_plan=execution_plan, task=task)

        context = self.collect_context(
            project_understanding=project_understanding,
            execution_plan=execution_plan,
            task=task,
        )
        if not context:
            logger.error("Validation error: empty execution context")
            raise ExecutionValidationError("Execution context must not be empty.")

        logger.info("Context assembled for task: %s", task.task_id)
        prompt = self.build_execution_prompt(context)
        logger.info("Prompt generated for task: %s", task.task_id)

        logger.info("Execution started for task: %s", task.task_id)
        raw_result = self.codex_service.execute_prompt(
            system_prompt=EXECUTION_SYSTEM_PROMPT,
            user_prompt=prompt,
        )
        result = self.generate_execution_report(
            raw_result=raw_result,
            project_understanding=project_understanding,
            execution_plan=execution_plan,
            task=task,
        )
        logger.info("Execution completed for task: %s", task.task_id)
        return result

    def build_execution_prompt(self, context: dict[str, Any]) -> str:
        if not context:
            raise ExecutionValidationError("Cannot build execution prompt from empty context.")
        return build_execution_user_prompt(context)

    def collect_context(
        self,
        project_understanding: ProjectUnderstanding,
        execution_plan: ExecutionPlan,
        task: Task,
    ) -> dict[str, Any]:
        self._validate_task_reference(execution_plan=execution_plan, task=task)

        dependency_tasks = self._get_dependency_tasks(execution_plan=execution_plan, task=task)
        next_tasks = self._get_next_recommended_tasks(execution_plan=execution_plan, task=task)

        context = {
            "project": {
                "name": project_understanding.project_name,
                "summary": project_understanding.summary,
                "functional_requirements": project_understanding.functional_requirements,
                "non_functional_requirements": project_understanding.non_functional_requirements,
                "database_entities": project_understanding.database_entities,
                "apis": project_understanding.apis,
                "components": project_understanding.components,
                "pages": project_understanding.pages,
                "user_flows": project_understanding.user_flows,
                "implementation_notes": project_understanding.implementation_notes,
            },
            "plan": {
                "project_type": execution_plan.project_type,
                "architecture_style": execution_plan.architecture_style,
                "recommended_stack": execution_plan.recommended_stack,
                "phases": execution_plan.phases,
                "execution_order": execution_plan.execution_order,
            },
            "current_task": task.model_dump(),
            "dependency_tasks": [dependency.model_dump() for dependency in dependency_tasks],
            "acceptance_criteria": task.acceptance_criteria,
            "next_recommended_tasks": next_tasks,
            "filesystem": {
                "write_policy": "Generated code will be written inside a generated project output directory.",
                "path_rules": [
                    "Use relative file paths only.",
                    "Do not use absolute paths.",
                    "Do not use .. path traversal.",
                    "Return complete content for each created or modified file.",
                ],
            },
        }

        if not any(
            [
                context["project"]["functional_requirements"],
                context["project"]["database_entities"],
                context["project"]["apis"],
                context["project"]["components"],
                context["project"]["user_flows"],
                context["plan"]["recommended_stack"],
                context["current_task"],
            ]
        ):
            logger.error("Validation error: assembled context lacks useful project or task details")
            raise ExecutionValidationError("Execution context is missing project and task details.")

        return context

    def generate_execution_report_from_values(
        self,
        task: Task,
        summary: str,
        generated_files: list[dict[str, str]],
        modified_files: list[dict[str, str]],
        implementation_notes: list[str],
        warnings: list[str],
        next_recommended_tasks: list[str],
        status: str = "completed",
    ) -> ExecutionResult:
        raw_result = {
            "task_id": task.task_id,
            "status": status,
            "summary": summary,
            "generated_files": generated_files,
            "modified_files": modified_files,
            "implementation_notes": implementation_notes,
            "warnings": warnings,
            "next_recommended_tasks": next_recommended_tasks,
        }
        return self.validate_result(raw_result=raw_result, task=task)

    def generate_execution_report(
        self,
        raw_result: dict[str, Any],
        project_understanding: ProjectUnderstanding,
        execution_plan: ExecutionPlan,
        task: Task,
    ) -> ExecutionResult:
        artifact_plan = self._validate_artifact_plan(raw_result=raw_result, task=task)

        try:
            generated_files, modified_files = self.file_system_service.apply_artifacts(
                project_name=project_understanding.project_name,
                artifacts=artifact_plan.changes,
            )
        except FileSystemServiceError as exc:
            logger.exception("Validation error while applying generated artifacts")
            raise ExecutionValidationError(str(exc)) from exc

        next_tasks = [
            task_id
            for task_id in artifact_plan.next_recommended_tasks
            if task_id in {plan_task.task_id for plan_task in execution_plan.tasks}
        ]
        if not next_tasks:
            next_tasks = self._get_next_recommended_tasks(execution_plan=execution_plan, task=task)

        report = {
            "task_id": artifact_plan.task_id,
            "status": artifact_plan.status,
            "summary": artifact_plan.summary,
            "generated_files": [change.model_dump() for change in generated_files],
            "modified_files": [change.model_dump() for change in modified_files],
            "implementation_notes": artifact_plan.implementation_notes,
            "warnings": artifact_plan.warnings,
            "next_recommended_tasks": next_tasks,
        }
        return self.validate_result(raw_result=report, task=task)

    def validate_result(self, raw_result: dict[str, Any], task: Task) -> ExecutionResult:
        try:
            result = ExecutionResult.model_validate(raw_result)
        except ValidationError as exc:
            logger.exception("Validation errors in execution result")
            raise ModelResponseError("Execution response did not match ExecutionResult schema.") from exc

        if result.task_id != task.task_id:
            logger.error("Validation error: execution result task ID does not match current task")
            raise ExecutionValidationError(
                f"Execution result task_id {result.task_id} does not match requested task {task.task_id}."
            )

        return result

    def _validate_artifact_plan(self, raw_result: dict[str, Any], task: Task) -> ExecutionArtifactPlan:
        try:
            artifact_plan = ExecutionArtifactPlan.model_validate(raw_result)
        except ValidationError as exc:
            logger.exception("Validation errors in execution artifact plan")
            raise ModelResponseError("Execution response did not include valid code artifacts.") from exc

        if artifact_plan.task_id != task.task_id:
            logger.error("Validation error: artifact plan task ID does not match current task")
            raise ExecutionValidationError(
                f"Execution artifact task_id {artifact_plan.task_id} does not match requested task {task.task_id}."
            )
        return artifact_plan

    def _validate_task_reference(self, execution_plan: ExecutionPlan, task: Task) -> None:
        plan_task_ids = {plan_task.task_id for plan_task in execution_plan.tasks}
        if not task.task_id:
            logger.error("Validation error: missing task information")
            raise ExecutionValidationError("Task must include a task_id.")
        if task.task_id not in plan_task_ids:
            logger.error("Validation error: invalid task reference %s", task.task_id)
            raise ExecutionValidationError(f"Task {task.task_id} is not present in the execution plan.")

        plan_task = self._find_task(execution_plan=execution_plan, task_id=task.task_id)
        if plan_task.model_dump() != task.model_dump():
            logger.error("Validation error: task payload does not match execution plan task")
            raise ExecutionValidationError(
                f"Task {task.task_id} payload must match the corresponding execution plan task."
            )

        missing_dependencies = [
            dependency for dependency in task.dependencies if dependency not in plan_task_ids
        ]
        if missing_dependencies:
            logger.error("Validation error: missing dependencies for task %s", task.task_id)
            raise ExecutionValidationError(
                "Task dependencies are missing from execution plan: " + ", ".join(missing_dependencies)
            )

    def _get_dependency_tasks(self, execution_plan: ExecutionPlan, task: Task) -> list[Task]:
        return [
            self._find_task(execution_plan=execution_plan, task_id=dependency)
            for dependency in task.dependencies
        ]

    def _get_next_recommended_tasks(self, execution_plan: ExecutionPlan, task: Task) -> list[str]:
        try:
            current_index = execution_plan.execution_order.index(task.task_id)
        except ValueError as exc:
            logger.error("Validation error: task missing from execution order")
            raise ExecutionValidationError(
                f"Task {task.task_id} is missing from execution_order."
            ) from exc

        completed_or_current = set(execution_plan.execution_order[: current_index + 1])
        next_task_ids: list[str] = []
        for task_id in execution_plan.execution_order[current_index + 1 :]:
            candidate = self._find_task(execution_plan=execution_plan, task_id=task_id)
            if set(candidate.dependencies).issubset(completed_or_current):
                next_task_ids.append(task_id)
            if len(next_task_ids) == 3:
                break
        return next_task_ids

    @staticmethod
    def _find_task(execution_plan: ExecutionPlan, task_id: str) -> Task:
        for task in execution_plan.tasks:
            if task.task_id == task_id:
                return task
        raise ExecutionValidationError(f"Task {task_id} is not present in the execution plan.")
