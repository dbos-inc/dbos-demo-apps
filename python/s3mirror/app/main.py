from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
import boto3
from boto3.s3.transfer import TransferConfig
from botocore.config import Config
from dbos import DBOS, Queue
import time
from typing import List, Optional
import threading
import os
from dataclasses import dataclass
from enum import Enum
from pydantic import BaseModel
from sqlalchemy import text

app = FastAPI()
DBOS(fastapi=app)

## Tuning Parameters
# Running in DBOS Cloud; S3 max requests per prefix is around 3500
# This processes up to 1800 requests at once, leaving some room for others using the bucket/prefix
MAX_FILES_AT_A_TIME = 18
MAX_FILES_PER_WORKER = 3

# See https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html
MAX_CONCURRENT_REQUESTS_PER_FILE = 100
FILE_CHUNK_SIZE_BYTES = 16*1024*1024

## S3 Client
s3 = boto3.client('s3', config=Config(retries={"max_attempts": 5}, max_pool_connections=MAX_FILES_PER_WORKER * MAX_CONCURRENT_REQUESTS_PER_FILE))

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

class TransferStatus(Enum):
    QUEUED = 0
    TRANSFERRING = 1
    SUCCESS = 2
    ERROR = 3

@dataclass
class FileTransferTask:
    idx:        int
    key:        str
    size:       float
    status:     TransferStatus
    t_start:    float = 0
    t_end:      float = 0
    error_text: str   = ""

@DBOS.step(retries_allowed=True, max_attempts=3)
def s3_transfer_file(buckets: BucketPaths, task: FileTransferTask):
    # Transfer the file
    DBOS.logger.info(f"{DBOS.workflow_id} starting transfer {task.idx}: {task.key}")
    t_start = time.time()
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
    t_end = time.time()
    elapsed = (t_end-t_start)
    DBOS.logger.info(f"{DBOS.workflow_id} finished transfer {task.idx}: {task.key} in {elapsed:.1f} seconds")
    task.status = TransferStatus.SUCCESS
    task.t_start = t_start
    task.t_end = t_end
    return task


## The main transfer job logic
transfer_queue = Queue("transfer_queue", concurrency = MAX_FILES_AT_A_TIME, worker_concurrency = MAX_FILES_PER_WORKER)

@DBOS.workflow()
def transfer_job(buckets: BucketPaths, tasks: List[FileTransferTask]):
    DBOS.logger.info(f"{DBOS.workflow_id} starting {len(tasks)} transfers from {buckets.src_bucket}/{buckets.src_prefix} to {buckets.dst_bucket}/{buckets.dst_prefix}")
    DBOS.set_event('tasks', tasks)
    # For each task, start a workflow on the queue
    handles = [ transfer_queue.enqueue(s3_transfer_file, task = task, buckets = buckets) for task in tasks ]
    # Babysit them until all finish
    while not all( [ task.status in [ TransferStatus.SUCCESS, TransferStatus.ERROR ] for task in tasks ] ):
        DBOS.sleep(1)
        for i, (task, handle) in enumerate(zip(tasks, handles)):
            workflow_status = handle.get_status().status
            if workflow_status in ["SUCCESS", "ERROR", "RETRIES_EXCEEDED"]:
                try:
                    tasks[i] = handle.get_result()
                except Exception as exn:
                    tasks[i].status = TransferStatus.ERROR
                    tasks[i].error_text = str(exn)    
            elif workflow_status == "ENQUEUED":
                tasks[i].status = TransferStatus.QUEUED
            elif workflow_status == "PENDING":
                tasks[i].status = TransferStatus.TRANSFERRING           
            elif workflow_status == "CANCELLED":
                tasks[i].status = TransferStatus.ERROR
                tasks[i].error_text = "Transfer cancelled"
        # Update for the status page
        DBOS.set_event('tasks', tasks)
    DBOS.logger.info(f"{DBOS.workflow_id} all files finished")

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
        tasks.append(FileTransferTask(idx = i, key = key, size = size, status = TransferStatus.QUEUED))
    handle = DBOS.start_workflow(transfer_job, buckets, tasks)
    return handle.workflow_id

@app.get("/transfer_status/{transfer_id}")
def transfer_status(transfer_id: str):
    tasks = DBOS.get_event(transfer_id, 'tasks', timeout_seconds=0)
    if tasks is None:
        raise HTTPException(status_code=404, detail="Transfer not found")
    filewise_status = []
    n_transferred = n_error = total_size = 0
    for task in tasks:
        filewise_status.append({
            'file':   task.key,
            'size':   task.size,
            'status': task.status.name,
            'tstart': task.t_start,
            'tend':   task.t_end,
            'error':  task.error_text
        })
        if task.status == TransferStatus.SUCCESS:
            total_size += task.size
            n_transferred += 1
        elif task.status == TransferStatus.ERROR:
            n_error += 1    
    try:
        t_start = min([ task.t_start for task in tasks if task.status == TransferStatus.SUCCESS ])
        t_end   = max([ task.t_end for task in tasks if task.status == TransferStatus.SUCCESS ])
        transfer_rate = total_size / (t_end - t_start) if n_transferred > 0 else 0
    except Exception as e:
        # In case there's a divide by 0 somehow
        transfer_rate = None
    return {
        'files': len(tasks),
        'transferred': n_transferred,
        'errors': n_error,
        'rate': transfer_rate,
        'filewise': filewise_status
    }
