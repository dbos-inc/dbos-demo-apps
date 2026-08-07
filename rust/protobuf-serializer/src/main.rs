//! Custom-serializer demo, ported from the Go `protobuf-serializer` app:
//! plug a protobuf codec into durare so workflow inputs and outputs are
//! stored as protobuf bytes instead of JSON, run one task workflow, and
//! print its result. See `proto_serializer.rs` for the codec and the
//! value-level vs. type-level note.

mod proto_serializer;
mod task;

use durare::{
    DurableContext, DurableEngine, PostgresProvider, Result, Serializer, WorkflowOptions,
};
use proto_serializer::ProtoSerializer;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use task::{Priority, Task, TaskResult};

#[durare::workflow("ProcessTask")]
async fn process_task(ctx: DurableContext, task: Task) -> Result<TaskResult> {
    ctx.step("process", || async {
        Ok(TaskResult {
            task_id: task.id.clone(),
            success: true,
            message: format!("Processed task: {}", task.title),
            output_metadata: HashMap::from([
                ("processed_by".to_string(), "durare".to_string()),
                ("priority".to_string(), task.priority.as_str().to_string()),
            ]),
        })
    })
    .await
}

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let db_url = std::env::var("DBOS_SYSTEM_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .expect("set DBOS_SYSTEM_DATABASE_URL (or DATABASE_URL) to a Postgres URL");

    // Install the protobuf codec: every workflow input/output/event this
    // engine stores is written as google.protobuf.Value bytes.
    let provider = PostgresProvider::connect(&db_url)
        .await?
        .with_serializer(Serializer::custom(Arc::new(ProtoSerializer)));
    let engine = DurableEngine::new(Arc::new(provider)).await?;
    engine.launch().await?;

    let task = Task {
        id: "task-1".to_string(),
        title: "Demo Task".to_string(),
        description: "A demo task using protobuf serialization".to_string(),
        priority: Priority::High,
        tags: vec!["demo".to_string(), "protobuf".to_string()],
        metadata: HashMap::from([("source".to_string(), "cli".to_string())]),
    };

    let handle = engine
        .start::<Task, TaskResult>("ProcessTask", task, WorkflowOptions::default())
        .await?;
    let result = handle.result().await?;

    println!("Task ID: {}", result.task_id);
    println!("Success: {}", result.success);
    println!("Message: {}", result.message);
    println!("Metadata: {:?}", result.output_metadata);

    engine.shutdown(Duration::from_secs(10)).await?;
    Ok(())
}
