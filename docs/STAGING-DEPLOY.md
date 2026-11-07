# Staging deployment

`.github/workflows/staging-deploy.yml` deploys commits pushed to `staging`, or a manually selected commit through `workflow_dispatch`. Configure a GitHub Actions environment named `staging` and add these **environment secrets**:

| Secret | Value |
| --- | --- |
| `TS_AUTHKEY` | Tailscale auth key that can join the staging server to the tailnet and apply `tag:ci` (configure the tailnet ACL/tag owner accordingly). |
| `STAGING_SSH_PRIVATE_KEY` | Private key for SSH access to the staging host. |
| `STAGING_HOST` | Hostname or IP reachable from the runner after Tailscale connects. |
| `STAGING_USER` | SSH account allowed to write the deployment directory and run `sudo systemctl restart <service>`. |
| `STAGING_DEPLOY_DIR` | Absolute directory on the server; contains `releases/` and a `current` symlink. |
| `STAGING_SERVICE` | Existing systemd unit that serves the app from `<deploy-dir>/current`. |
| `STAGING_HEALTH_URL` | Health URL reachable from the runner shell on the remote host, commonly `http://127.0.0.1:<port>/health`. |

The staging systemd unit must already be configured to run the app from its `current` working directory and load its environment from the server's own protected configuration. The workflow does not read, transfer, or print that environment file. The host needs Bash, `tar`, `curl`, `systemctl`, and `sudo` permission for restarting only the configured unit. Ensure the app's required Python dependencies/runtime are already installed on the server or provided by the service configuration; this workflow packages tracked source files and does not build a container.

Deployment extracts each commit into a new release directory, switches `current` atomically, restarts the unit, and retries the health check for up to one minute. A restart or health-check failure restores the prior release symlink and restarts the unit. The first deployment has no prior release to restore; in that case, a failed health check exits with failure and requires operator recovery. Releases are retained so rollback targets remain available. Database migrations execute at app startup; code rollback cannot reverse a migration, so migrations must remain backward compatible with the previous release.

The workflow intentionally fails during its initial configuration step if any secret is absent. It makes no remote deployment-directory changes until after SSH reaches the host and verifies required remote commands and the staged archive.
