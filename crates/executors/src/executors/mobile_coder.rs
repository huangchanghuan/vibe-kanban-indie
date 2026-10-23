//! Mobile Coder executor — China Mobile's enterprise fork of opencode.
//!
//! Mobile Coder's headless server (`mobile serve`) exposes the same HTTP API
//! and SSE event stream as opencode, so this executor reuses the [`Opencode`]
//! implementation end-to-end (spawn, discovery, log normalization, approvals,
//! slash commands) and only swaps the wire-level "flavor": binary name
//! (`mobile`), the `Mobile Coder server listening on …` banner, the
//! `MOBILE_CODER_*` environment variables, the Basic-auth username and the
//! `mobile-coder` config paths.

use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::opencode::{MOBILE_CODER_FLAVOR, Opencode, availability_for, mcp_config_path_for};
use crate::{
    approvals::ExecutorApprovalService,
    env::ExecutionEnv,
    executors::{
        AvailabilityInfo, BaseCodingAgent, ExecutorConfig, ExecutorError, SpawnedChild,
        StandardCodingAgentExecutor,
    },
};

/// Headless Mobile Coder executor. Wire-format-compatible with [`Opencode`]
/// (its settings schema is intentionally identical), driven over the
/// `mobile serve` HTTP API with `MOBILE_CODER_*` env/auth conventions.
#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct MobileCoder {
    #[serde(flatten)]
    #[ts(flatten)]
    #[schemars(flatten)]
    pub inner: Opencode,
}

#[async_trait]
impl StandardCodingAgentExecutor for MobileCoder {
    fn apply_overrides(&mut self, executor_config: &ExecutorConfig) {
        self.inner.apply_overrides(executor_config);
    }

    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.inner.use_approvals(approvals);
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        self.inner
            .spawn_for(current_dir, prompt, None, env, MOBILE_CODER_FLAVOR)
            .await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        _reset_to_message_id: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        self.inner
            .spawn_for(
                current_dir,
                prompt,
                Some(session_id),
                env,
                MOBILE_CODER_FLAVOR,
            )
            .await
    }

    fn normalize_logs(
        &self,
        msg_store: Arc<workspace_utils::msg_store::MsgStore>,
        worktree_path: &Path,
    ) -> Vec<tokio::task::JoinHandle<()>> {
        self.inner.normalize_logs(msg_store, worktree_path)
    }

    async fn discover_options(
        &self,
        workdir: Option<&Path>,
        repo_path: Option<&Path>,
    ) -> Result<futures::stream::BoxStream<'static, json_patch::Patch>, ExecutorError> {
        self.inner
            .discover_options_for(
                MOBILE_CODER_FLAVOR,
                BaseCodingAgent::MobileCoder,
                workdir,
                repo_path,
            )
            .await
    }

    fn get_preset_options(&self) -> ExecutorConfig {
        let mut cfg = self.inner.get_preset_options();
        cfg.executor = BaseCodingAgent::MobileCoder;
        cfg
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        mcp_config_path_for(MOBILE_CODER_FLAVOR)
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        availability_for(MOBILE_CODER_FLAVOR)
    }
}
