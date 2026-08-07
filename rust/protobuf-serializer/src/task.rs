//! The demo's message types, mirroring `task.proto` from the Go app
//! (`Task`, `TaskResult`, `Priority`). Workflow inputs and outputs pass
//! through serde on their way to the serializer, so these are plain serde
//! structs shaped like the proto messages — enums serialize as their proto
//! names (`"HIGH"`), matching proto3's JSON mapping.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Priority {
    PriorityUnspecified,
    Low,
    Medium,
    High,
    Critical,
}

impl Priority {
    pub fn as_str(self) -> &'static str {
        match self {
            Priority::PriorityUnspecified => "PRIORITY_UNSPECIFIED",
            Priority::Low => "LOW",
            Priority::Medium => "MEDIUM",
            Priority::High => "HIGH",
            Priority::Critical => "CRITICAL",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub priority: Priority,
    pub tags: Vec<String>,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    pub task_id: String,
    pub success: bool,
    pub message: String,
    pub output_metadata: HashMap<String, String>,
}
