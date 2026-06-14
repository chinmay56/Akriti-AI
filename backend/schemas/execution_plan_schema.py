from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend.schemas.task_schema import Task


class ExecutionPlan(BaseModel):
    """Implementation-ready plan generated from a project understanding."""

    model_config = ConfigDict(extra="forbid")

    project_type: str = Field(..., min_length=1)
    architecture_style: str = Field(..., min_length=1)
    recommended_stack: list[str] = Field(..., min_length=1)
    phases: list[str] = Field(..., min_length=1)
    tasks: list[Task] = Field(..., min_length=1)
    execution_order: list[str] = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_plan_integrity(self) -> "ExecutionPlan":
        task_ids = [task.task_id for task in self.tasks]
        duplicate_ids = sorted({task_id for task_id in task_ids if task_ids.count(task_id) > 1})
        if duplicate_ids:
            raise ValueError(f"Duplicate task IDs found: {', '.join(duplicate_ids)}")

        task_id_set = set(task_ids)
        phase_set = set(self.phases)
        missing_phase_tasks = [task.task_id for task in self.tasks if task.phase not in phase_set]
        if missing_phase_tasks:
            raise ValueError(
                "Tasks reference phases that are not declared: " + ", ".join(missing_phase_tasks)
            )

        missing_dependencies = sorted(
            {
                dependency
                for task in self.tasks
                for dependency in task.dependencies
                if dependency not in task_id_set
            }
        )
        if missing_dependencies:
            raise ValueError(
                "Task dependencies reference missing task IDs: " + ", ".join(missing_dependencies)
            )

        if set(self.execution_order) != task_id_set or len(self.execution_order) != len(task_ids):
            raise ValueError("Execution order must contain each task ID exactly once.")

        self._validate_no_circular_dependencies()
        self._validate_execution_order_respects_dependencies()
        return self

    def _validate_no_circular_dependencies(self) -> None:
        graph = {task.task_id: task.dependencies for task in self.tasks}
        visiting: set[str] = set()
        visited: set[str] = set()

        def visit(task_id: str) -> None:
            if task_id in visiting:
                raise ValueError(f"Circular dependency detected at task {task_id}.")
            if task_id in visited:
                return

            visiting.add(task_id)
            for dependency in graph[task_id]:
                visit(dependency)
            visiting.remove(task_id)
            visited.add(task_id)

        for task_id in graph:
            visit(task_id)

    def _validate_execution_order_respects_dependencies(self) -> None:
        position = {task_id: index for index, task_id in enumerate(self.execution_order)}
        for task in self.tasks:
            for dependency in task.dependencies:
                if position[dependency] > position[task.task_id]:
                    raise ValueError(
                        f"Execution order places {task.task_id} before dependency {dependency}."
                    )


EXECUTION_PLAN_JSON_SCHEMA: dict[str, object] = ExecutionPlan.model_json_schema()
