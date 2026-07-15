from __future__ import annotations

from unittest.mock import Mock, patch

from django.urls import reverse

from sentry.integrations.source_code_management.status_check import StatusCheckStatus
from sentry.testutils.cases import APITestCase

SKIP_MODULE = "sentry.preprod.vcs.status_checks.skip"


class ProjectPreprodSkipStatusCheckEndpointTest(APITestCase):
    endpoint = "sentry-api-0-project-preprod-size-analysis-skip-status-check"
    check_type = "size"
    expected_check_name = "Size Analysis"

    def setUp(self) -> None:
        super().setUp()
        self.user = self.create_user()
        self.organization = self.create_organization(owner=self.user)
        self.project = self.create_project(organization=self.organization)
        self.repository = self.create_repo(
            project=self.project,
            name="owner/repo",
            provider="integrations:github",
            integration_id=123,
        )
        self.sha = "a" * 40

    def _url(self, organization_slug=None, project_slug=None):
        return reverse(
            self.endpoint,
            args=[organization_slug or self.organization.slug, project_slug or self.project.slug],
        )

    def _post(self, data, scope_list=None, url=None):
        # project:releases is what CI upload tokens (sentry-cli) carry, so it's the
        # realistic scope for this endpoint (see ProjectReleasePermission).
        token = self.create_user_auth_token(
            self.user, scope_list=scope_list or ["project:releases"]
        )
        return self.client.post(
            url or self._url(),
            data,
            HTTP_AUTHORIZATION=f"Bearer {token.token}",
        )

    def _patch_provider(self, mock_provider):
        return (
            patch(
                f"{SKIP_MODULE}.get_status_check_client_for_repo",
                return_value=(Mock(), self.repository),
            ),
            patch(f"{SKIP_MODULE}.get_status_check_provider", return_value=mock_provider),
        )

    def test_posts_skipped_check(self) -> None:
        mock_provider = Mock()
        mock_provider.create_status_check.return_value = "check_123"

        client_patch, provider_patch = self._patch_provider(mock_provider)
        with client_patch, provider_patch:
            response = self._post({"sha": self.sha, "repository": "owner/repo"})

        assert response.status_code == 200
        assert response.json() == {"success": True, "checkId": "check_123"}

        mock_provider.create_status_check.assert_called_once()
        kwargs = mock_provider.create_status_check.call_args.kwargs
        assert kwargs["repo"] == "owner/repo"
        assert kwargs["sha"] == self.sha
        assert kwargs["status"] == StatusCheckStatus.NEUTRAL
        # The posted check name must match the required-check name Sentry posts
        # during normal processing, or branch protection won't be satisfied.
        assert kwargs["title"] == self.expected_check_name
        assert kwargs["completed_at"] is not None

    def test_missing_sha_returns_400(self) -> None:
        response = self._post({"repository": "owner/repo"})
        assert response.status_code == 400
        assert "sha" in response.json()["detail"]

    def test_missing_repository_returns_400(self) -> None:
        response = self._post({"sha": self.sha})
        assert response.status_code == 400
        assert "repository" in response.json()["detail"]

    def test_repo_not_integrated_returns_400(self) -> None:
        # No patching: the real resolver finds no matching integrated repository.
        response = self._post({"sha": self.sha, "repository": "owner/not-integrated"})
        assert response.status_code == 400
        assert "owner/not-integrated" in response.json()["detail"]

    def test_null_check_id_returns_502(self) -> None:
        mock_provider = Mock()
        mock_provider.create_status_check.return_value = None

        client_patch, provider_patch = self._patch_provider(mock_provider)
        with client_patch, provider_patch:
            response = self._post({"sha": self.sha, "repository": "owner/repo"})

        assert response.status_code == 502

    def test_read_only_scope_forbidden(self) -> None:
        response = self._post(
            {"sha": self.sha, "repository": "owner/repo"}, scope_list=["project:read"]
        )
        assert response.status_code == 403


class ProjectPreprodSnapshotSkipStatusCheckEndpointTest(ProjectPreprodSkipStatusCheckEndpointTest):
    endpoint = "sentry-api-0-project-preprod-snapshot-skip-status-check"
    check_type = "snapshots"
    expected_check_name = "Snapshot Testing"
