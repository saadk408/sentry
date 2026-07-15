from __future__ import annotations

import logging

from rest_framework.request import Request
from rest_framework.response import Response

from sentry.api.api_owners import ApiOwner
from sentry.api.api_publish_status import ApiPublishStatus
from sentry.api.base import cell_silo_endpoint
from sentry.api.bases.project import ProjectEndpoint, ProjectReleasePermission
from sentry.models.project import Project
from sentry.preprod.vcs.status_checks.skip import (
    SkipStatusCheckError,
    StatusCheckType,
    create_skipped_status_check,
)
from sentry.ratelimits.config import RateLimitConfig
from sentry.types.ratelimit import RateLimit, RateLimitCategory
from sentry.utils import metrics

logger = logging.getLogger(__name__)


class BaseProjectPreprodSkipStatusCheckEndpoint(ProjectEndpoint):
    """Post a passing "skipped" status check for a bare commit SHA, so a required
    check is satisfied on PRs that intentionally don't upload an artifact.
    """

    owner = ApiOwner.EMERGE_TOOLS
    publish_status = {
        "POST": ApiPublishStatus.EXPERIMENTAL,
    }
    # Release scope: the same CI token that uploads builds can post skips.
    permission_classes = (ProjectReleasePermission,)
    rate_limits = RateLimitConfig(
        limit_overrides={
            "POST": {
                RateLimitCategory.ORGANIZATION: RateLimit(limit=100, window=60),
            }
        }
    )

    check_type: StatusCheckType

    def post(self, request: Request, project: Project) -> Response:
        sha = request.data.get("sha")
        repository = request.data.get("repository")

        if not sha or not isinstance(sha, str):
            return self._failure(
                reason="missing_sha", detail="A commit `sha` is required.", status=400
            )
        if not repository or not isinstance(repository, str):
            return self._failure(
                reason="missing_repository",
                detail="A `repository` name is required.",
                status=400,
            )

        try:
            check_id = create_skipped_status_check(
                project=project,
                repo_name=repository,
                sha=sha,
                check_type=self.check_type,
            )
        except SkipStatusCheckError as e:
            return self._failure(reason=e.reason, detail=e.detail, status=e.status_code)

        metrics.incr(
            "preprod.status_checks.skip",
            tags={"check_type": self.check_type, "success": True},
        )
        return Response({"success": True, "checkId": check_id}, status=200)

    def _failure(self, *, reason: str, detail: str, status: int) -> Response:
        metrics.incr(
            "preprod.status_checks.skip",
            tags={"check_type": self.check_type, "success": False, "reason": reason},
        )
        return Response({"detail": detail}, status=status)


@cell_silo_endpoint
class ProjectPreprodSizeAnalysisSkipStatusCheckEndpoint(BaseProjectPreprodSkipStatusCheckEndpoint):
    check_type = "size"


@cell_silo_endpoint
class ProjectPreprodSnapshotSkipStatusCheckEndpoint(BaseProjectPreprodSkipStatusCheckEndpoint):
    check_type = "snapshots"
