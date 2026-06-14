from __future__ import annotations

import json

from backend.schemas.execution_plan_schema import EXECUTION_PLAN_JSON_SCHEMA
from backend.schemas.planning_request import PlanComplexity
from backend.schemas.project_schema import ProjectUnderstanding


PLANNING_SYSTEM_PROMPT = f"""
You are a Senior Software Delivery Architect and Technical Project Planner.

Your responsibility is to transform validated project understanding into an implementation-ready execution plan.

Planning rules:
- Identify the project type and architecture style.
- Recommend a practical technology stack.
- Include only relevant phases.
- Typical phases include Project Setup, Database Design, Backend Development, API Development, Frontend Development, Authentication, Testing, and Deployment.
- Generate atomic development tasks. Do not create vague tasks such as "Build authentication".
- Create task dependencies using task IDs only.
- Estimate priority and complexity for every task.
- Generate concrete acceptance criteria for every task.
- Generate execution_order as a dependency-safe list of task IDs.

Output rules:
- Return only valid JSON.
- Do not include markdown, code fences, prose, comments, or explanations.
- The JSON must match this schema exactly.
- Every task dependency must reference an existing task_id.
- The execution_order must include every task_id exactly once.
- Avoid circular dependencies.

JSON schema:
{EXECUTION_PLAN_JSON_SCHEMA}
""".strip()


def build_planning_user_prompt(
    project_understanding: ProjectUnderstanding,
    complexity: PlanComplexity = "medium",
) -> str:
    """Create the planning prompt from validated Understanding Agent output."""

    project_json = json.dumps(project_understanding.model_dump(), indent=2)
    complexity_rules = {
        "simple": "Create a compact MVP plan with fewer tasks. Prefer 6-10 high-signal atomic tasks.",
        "medium": "Create a balanced production plan. Prefer 10-18 atomic tasks.",
        "hard": "Create a detailed production plan. Prefer 18-35 atomic tasks with deeper validation, testing, and deployment work.",
    }
    return f"""
Create an implementation-ready execution plan for this project understanding:

{project_json}

Plan complexity: {complexity}
Complexity guidance: {complexity_rules[complexity]}
""".strip()
