from fastapi import FastAPI, HTTPException
import boto3
from boto3.s3.transfer import TransferConfig
from botocore.config import Config
from dbos import DBOS, DBOSConfig, Queue
from typing import List, Optional
import os
from dataclasses import dataclass
from pydantic import BaseModel

app = FastAPI()
config: DBOSConfig = {
    "name": "s3mirror",
    "system_database_url": os.environ.get("DBOS_SYSTEM_DATABASE_URL"),
    "application_version": "0.1.0",
}
DBOS(fastapi=app, config=config)

## Tuning Parameters
# Running in DBOS Cloud; S3 max requests per prefix is around 3500
# This processes up to 1500 requests at once, leaving some room for others using the bucket/prefix
MAX_FILES_AT_A_TIME = 15
MAX_FILES_PER_WORKER = 3

# See https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html
MAX_CONCURRENT_REQUESTS_PER_FILE = 100
FILE_CHUNK_SIZE_BYTES = 16*1024*1024

## S3 Client
s3 = boto3.client('s3', config=Config(max_pool_connections=MAX_FILES_PER_WORKER * MAX_CONCURRENT_REQUESTS_PER_FILE))

@DBOS.step(retries_allowed=True, max_attempts=3)
def s3_list_bucket(bucket: str, prefix: str):
    # List with prefix and pagination
    result = None
    response = s3.list_objects_v2(
        Bucket=bucket, 
        Prefix=prefix
    )
    if not 'Contents' in response:
        return result
    result = response['Contents']
    while response['IsTruncated']:
        response = s3.list_objects_v2(
            Bucket=bucket, 
            Prefix=prefix,  
            ContinuationToken = response['NextContinuationToken']
        )
        result.extend( response['Contents'] )
    return result

@dataclass
class BucketPaths:
    src_bucket: str
    src_prefix: str
    dst_bucket: str
    dst_prefix: str

@dataclass
class FileTransferTask:
    idx:         int
    key:         str
    size:        float
    workflow_id: str

@DBOS.step(retries_allowed=True, max_attempts=3)
def s3_transfer_file(buckets: BucketPaths, task: FileTransferTask):
    DBOS.span.set_attribute("s3mirror_key", task.key)
    DBOS.logger.info(f"{DBOS.workflow_id} starting transfer {task.idx}: {task.key}")
    s3.copy(
        CopySource= {
            'Bucket': buckets.src_bucket,
            'Key': buckets.src_prefix + task.key
        },
        Bucket = buckets.dst_bucket,
        Key = buckets.dst_prefix + task.key,
        Config = TransferConfig(
            use_threads=True,
            max_concurrency=MAX_CONCURRENT_REQUESTS_PER_FILE,
            multipart_chunksize=FILE_CHUNK_SIZE_BYTES
        )
    )
    DBOS.logger.info(f"{DBOS.workflow_id} finished transfer {task.idx}: {task.key}")

## The main transfer job logic
transfer_queue = Queue("transfer_queue", concurrency = MAX_FILES_AT_A_TIME, worker_concurrency = MAX_FILES_PER_WORKER)

@DBOS.workflow()
def transfer_job(buckets: BucketPaths, tasks: List[FileTransferTask]):
    DBOS.logger.info(f"{DBOS.workflow_id} starting {len(tasks)} transfers from {buckets.src_bucket}/{buckets.src_prefix} to {buckets.dst_bucket}/{buckets.dst_prefix}")
    # For each task, start a workflow on the queue
    for task in tasks:
         handle = transfer_queue.enqueue(s3_transfer_file, task = task, buckets = buckets)
         task.workflow_id = handle.workflow_id
    # Store the description and ID of each transfer in the workflow context
    DBOS.set_event('tasks', tasks)

## The API Endpoints
class TransferSchema(BaseModel):
    src_bucket: str
    src_prefix: str
    src_keys: Optional[List[str]] # Set this to None to transfer everything under bucket/prefix
    dst_bucket: str
    dst_prefix: str

@app.post("/start_transfer")
@DBOS.workflow()
def start_transfer(transfer_spec: TransferSchema):
    buckets = BucketPaths(src_bucket = transfer_spec.src_bucket, src_prefix = transfer_spec.src_prefix,
                          dst_bucket = transfer_spec.dst_bucket, dst_prefix = transfer_spec.dst_prefix )
    # Get all the keys in the src bucket/prefix with sizes in GB
    sources = s3_list_bucket(buckets.src_bucket, buckets.src_prefix)
    keys = [ item['Key'].replace(buckets.src_prefix, "") for item in sources ]
    sizes = [ item['Size'] / (1024.0*1024*1024) for item in sources ]
    # If user specified a list of keys, subset by it
    if transfer_spec.src_keys is not None:
        filtered_keys_and_sizes = [ (key, size) for key, size in zip(keys, sizes) if key in transfer_spec.src_keys ]
        keys = [key for key, size in filtered_keys_and_sizes]
        sizes = [size for key, size in filtered_keys_and_sizes]
        if len(transfer_spec.src_keys) > len(keys): 
            # User specified some keys that we can't find (also can do "log warning and proceed" here)
            raise HTTPException(status_code=400, detail="Not all src_keys were found in src_bucket")
    # If there are matching keys in the dst bucket/prefix, subset by those
    destinations = s3_list_bucket(buckets.dst_bucket, buckets.dst_prefix)
    if destinations is not None:
        dst_keys = [ item['Key'].replace(buckets.dst_prefix, "") for item in destinations ]
        [ DBOS.logger.info(f"Skipping: {key}, already present in the destination path") for key in dst_keys if key in keys]
        filtered_keys_and_sizes = [ (key, size) for key, size in zip(keys, sizes) if key not in dst_keys ]
        keys = [key for key, size in filtered_keys_and_sizes]
        sizes = [size for key, size in filtered_keys_and_sizes]
    # Create tasks and pass them to a transfer job
    tasks = []
    for i, (key, size) in enumerate(zip(keys, sizes)):
        tasks.append(FileTransferTask(idx = i, key = key, size = size, workflow_id = None))
    handle = DBOS.start_workflow(transfer_job, buckets, tasks)
    DBOS.logger.info(f"Started transfer {handle.workflow_id}")
    return handle.workflow_id

@app.get("/transfer_status/{transfer_id}")
def transfer_status(transfer_id: str):
    tasks = DBOS.get_event(transfer_id, 'tasks', timeout_seconds=0)
    if tasks is None:
        raise HTTPException(status_code=404, detail="Transfer not found")
    filewise_status = []
    n_transferred = n_error = transferred_size = 0
    t_start = t_end = None
    for task in tasks:
        workflow_summary = DBOS.list_workflows(workflow_ids=[task.workflow_id])[0]
        filewise_status.append({
            'file':   task.key,
            'size':   task.size,
            'status': workflow_summary.status,
            'tstart': workflow_summary.created_at,
            'tend':   (workflow_summary.updated_at if workflow_summary.status == "SUCCESS" else None),
            'error':  str(workflow_summary.error)
        })
        if workflow_summary.status == "SUCCESS":
            t_start = workflow_summary.created_at if t_start is None else min(t_start, workflow_summary.created_at)
            t_end = workflow_summary.updated_at if t_end is None else max(t_end, workflow_summary.updated_at)
            n_transferred += 1
            transferred_size += task.size
        elif workflow_summary.status == "ERROR":
            n_error += 1
    transfer_rate = transferred_size * 1000.0 / (t_end - t_start) if transferred_size > 0 and (t_start != t_end) else 0
    return {
        'files': len(tasks),
        'transferred': n_transferred,
        'errors': n_error,
        'rate': transfer_rate,
        'filewise': filewise_status
    }

# An endpoint to cancel a transfer
@app.post("/cancel/{transfer_id}")
def cancel(transfer_id: str):
    tasks = DBOS.get_event(transfer_id, 'tasks', timeout_seconds=0)
    if tasks is None:
        raise HTTPException(status_code=404, detail="Transfer not found")
    for task in tasks:
        DBOS.cancel_workflow(task.workflow_id)

# Finally, this endpoint crashes your app. For demonstration purposes only. :)
@app.post("/crash_application")
def crash_application():
    os._exit(1)
