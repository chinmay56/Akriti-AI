from __future__ import annotations

from typing import Any

from agents.understanding_agent import UnderstandingAgent


SAMPLE_PROJECT_DESCRIPTION = """
Build TaskFlow, a team task management web app. Users can sign up, create projects,
invite team members, create tasks, assign tasks, set due dates, and track status on
a kanban board. Admins can manage members. The system should include audit logs,
role-based access control, fast page loads, and PostgreSQL persistence.
"""


class FakeOpenAIService:
    def analyze_text(self, system_prompt: str, user_prompt: str) -> dict[str, Any]:
        return {
            "project_name": "TaskFlow",
            "summary": "A team task management web app for projects, members, and kanban task tracking.",
            "functional_requirements": [
                "Users can sign up.",
                "Users can create projects.",
                "Users can invite team members.",
                "Users can create and assign tasks.",
                "Users can track tasks on a kanban board.",
                "Admins can manage members.",
            ],
            "non_functional_requirements": [
                "Role-based access control is required.",
                "Fast page loads are required.",
                "Audit logging is required.",
            ],
            "pages": ["Sign Up", "Projects", "Project Detail", "Kanban Board", "Member Management"],
            "database_entities": ["User", "Project", "ProjectMember", "Task", "AuditLog"],
            "apis": [
                "POST /auth/signup",
                "POST /projects",
                "POST /projects/{project_id}/members",
                "POST /tasks",
                "PATCH /tasks/{task_id}",
            ],
            "components": ["AuthForm", "ProjectList", "KanbanBoard", "TaskCard", "MemberTable"],
            "user_flows": [
                "User signs up, creates a project, invites members, creates tasks, and tracks work on the kanban board."
            ],
            "implementation_notes": [
                "Use PostgreSQL for persistence.",
                "Enforce authorization by role on project and member APIs.",
            ],
        }


def test_understanding_agent_returns_valid_project_understanding() -> None:
    agent = UnderstandingAgent(openai_service=FakeOpenAIService())  # type: ignore[arg-type]

    result = agent.analyze_text(SAMPLE_PROJECT_DESCRIPTION)

    assert result.project_name == "TaskFlow"
    assert "Users can create projects." in result.functional_requirements
    assert "User" in result.database_entities
    assert "Kanban Board" in result.pages
    assert result.apis
