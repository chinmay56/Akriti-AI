from __future__ import annotations

import logging
import os
import re
from pathlib import Path

from dotenv import load_dotenv

from schemas.code_change import CodeChange
from schemas.execution_artifact import CodeArtifact

logger = logging.getLogger(__name__)
BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent
DEFAULT_OUTPUT_ROOT = Path.home() / "Downloads" / "ai_generated_projects"
IGNORED_FILE_TREE_DIRS = {
    ".git",
    ".next",
    ".venv",
    "__pycache__",
    "node_modules",
    "data",
    "dist",
    "build",
}
BLOCKED_WRITE_DIRS = {
    ".git",
    ".next",
    ".venv",
    "__pycache__",
    "node_modules",
    "data",
    "dist",
    "build",
}


class FileSystemServiceError(RuntimeError):
    """Raised when an artifact cannot be applied safely."""


class FileSystemService:
    """Applies generated code artifacts inside a safe generated-projects workspace."""

    def __init__(self, output_root: Path | None = None) -> None:
        load_dotenv(BACKEND_DIR / ".env")
        configured_root = os.getenv("EXECUTION_OUTPUT_DIR")
        if configured_root and configured_root.strip() != "generated_projects":
            configured_path = Path(configured_root).expanduser()
        else:
            configured_path = DEFAULT_OUTPUT_ROOT
        if configured_path.is_absolute():
            resolved_root = configured_path
        else:
            resolved_root = REPO_DIR / configured_path

        self.output_root = (output_root or resolved_root).resolve()
        self.output_root.mkdir(parents=True, exist_ok=True)

    def apply_artifacts(
        self,
        project_name: str,
        artifacts: list[CodeArtifact],
    ) -> tuple[list[CodeChange], list[CodeChange]]:
        project_root = self._project_root(project_name)
        project_root.mkdir(parents=True, exist_ok=True)

        generated_files: list[CodeChange] = []
        modified_files: list[CodeChange] = []

        for artifact in artifacts:
            target_path = self._safe_target_path(project_root=project_root, file_path=artifact.file_path)
            logger.info("Applying artifact %s to %s", artifact.change_type, target_path)

            if artifact.change_type == "deleted":
                if target_path.exists():
                    target_path.unlink()
                modified_files.append(
                    CodeChange(
                        file_path=str(target_path),
                        change_type="deleted",
                        description=artifact.description,
                    )
                )
                continue

            existed_before = target_path.exists()
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_text(artifact.content or "", encoding="utf-8", newline="\n")

            change = CodeChange(
                file_path=str(target_path),
                change_type="modified" if existed_before else "created",
                description=artifact.description,
            )
            if existed_before:
                modified_files.append(change)
            else:
                generated_files.append(change)

        return generated_files, modified_files

    def list_projects(self) -> list[str]:
        return sorted(path.name for path in self.output_root.iterdir() if path.is_dir())

    def list_files(self, project: str) -> list[str]:
        project_root = self._safe_project_root(project)
        if not project_root.exists():
            return []

        files: list[str] = []
        for path in project_root.rglob("*"):
            if any(part in IGNORED_FILE_TREE_DIRS for part in path.relative_to(project_root).parts):
                continue
            if path.is_file():
                files.append(path.relative_to(project_root).as_posix())
        return sorted(files)

    def read_file(self, project: str, file_path: str) -> str:
        project_root = self._safe_project_root(project)
        target_path = self._safe_target_path(project_root=project_root, file_path=file_path)
        if not target_path.is_file():
            raise FileSystemServiceError(f"File not found: {file_path}")
        return target_path.read_text(encoding="utf-8")

    def write_file(self, project: str, file_path: str, content: str) -> str:
        project_root = self._safe_project_root(project)
        target_path = self._safe_target_path(project_root=project_root, file_path=file_path)
        if not target_path.is_file():
            raise FileSystemServiceError(f"File not found: {file_path}")
        target_path.write_text(content, encoding="utf-8", newline="\n")
        return str(target_path)

    def _project_root(self, project_name: str) -> Path:
        slug = self._slugify(project_name or "generated-project")
        return (self.output_root / slug).resolve()

    def _safe_project_root(self, project: str) -> Path:
        slug = self._slugify(project)
        project_root = (self.output_root / slug).resolve()
        if self.output_root != project_root and self.output_root not in project_root.parents:
            raise FileSystemServiceError(f"Unsafe project path: {project}")
        return project_root

    def _safe_target_path(self, project_root: Path, file_path: str) -> Path:
        normalized = file_path.replace("\\", "/").lstrip("/")
        if not normalized or normalized.startswith("../") or "/../" in normalized:
            raise FileSystemServiceError(f"Unsafe artifact path: {file_path}")
        if any(part in BLOCKED_WRITE_DIRS for part in Path(normalized).parts):
            raise FileSystemServiceError(f"Refusing to write generated/runtime directory path: {file_path}")

        target_path = (project_root / normalized).resolve()
        if project_root != target_path and project_root not in target_path.parents:
            raise FileSystemServiceError(f"Artifact path escapes project output directory: {file_path}")
        return target_path

    @staticmethod
    def _slugify(value: str) -> str:
        slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
        return slug or "generated-project"
