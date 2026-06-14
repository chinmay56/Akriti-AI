from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from services.file_system_service import FileSystemService, FileSystemServiceError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspace", tags=["workspace"])


class ProjectListResponse(BaseModel):
    output_root: str
    projects: list[str]


class FileListResponse(BaseModel):
    project: str
    files: list[str]


class FileReadResponse(BaseModel):
    project: str
    file_path: str
    content: str


class FileSaveRequest(BaseModel):
    content: str = Field(...)


class FileSaveResponse(BaseModel):
    project: str
    file_path: str
    saved_path: str


@router.get("/projects", response_model=ProjectListResponse)
def list_projects() -> ProjectListResponse:
    service = FileSystemService()
    return ProjectListResponse(output_root=str(service.output_root), projects=service.list_projects())


@router.get("/projects/{project}/files", response_model=FileListResponse)
def list_project_files(project: str) -> FileListResponse:
    try:
        service = FileSystemService()
        return FileListResponse(project=project, files=service.list_files(project))
    except FileSystemServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/projects/{project}/files/{file_path:path}", response_model=FileReadResponse)
def read_project_file(project: str, file_path: str) -> FileReadResponse:
    try:
        service = FileSystemService()
        return FileReadResponse(
            project=project,
            file_path=file_path,
            content=service.read_file(project=project, file_path=file_path),
        )
    except FileSystemServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.put("/projects/{project}/files/{file_path:path}", response_model=FileSaveResponse)
def save_project_file(project: str, file_path: str, request: FileSaveRequest) -> FileSaveResponse:
    try:
        service = FileSystemService()
        saved_path = service.write_file(project=project, file_path=file_path, content=request.content)
        return FileSaveResponse(project=project, file_path=file_path, saved_path=saved_path)
    except FileSystemServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
