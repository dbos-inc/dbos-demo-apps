import requests

app_url = "http://0.0.0.0:8000"
endpoint = app_url + "/start_transfer"
data = {
    # The bucket to transfer from
    # For example, we use the publicly accessible Google Brain Genomics dataset
    # See https://registry.opendata.aws/google-brain-genomics-public/
    # This is a good example of multiple large files
    "src_bucket": "genomics-benchmark-datasets",
    "src_prefix": "google-brain/fastq/novaseq/wgs_pcr_plus/",

    # The files to transfer
    # You can use "src_keys": None, to specify "everything under src_prefix"
    "src_keys": [
       "20x/HG001.novaseq.pcr-plus.20x.R1.fastq.gz",
       "20x/HG001.novaseq.pcr-plus.20x.R2.fastq.gz",
       "20x/HG002.novaseq.pcr-plus.20x.R1.fastq.gz",
       "20x/HG002.novaseq.pcr-plus.20x.R2.fastq.gz",
       "20x/HG003.novaseq.pcr-plus.20x.R1.fastq.gz",
       "20x/HG003.novaseq.pcr-plus.20x.R2.fastq.gz",
       "20x/HG004.novaseq.pcr-plus.20x.R1.fastq.gz",
       "20x/HG004.novaseq.pcr-plus.20x.R2.fastq.gz",
       "20x/HG005.novaseq.pcr-plus.20x.R1.fastq.gz",
       "20x/HG005.novaseq.pcr-plus.20x.R2.fastq.gz",
       "20x/HG006.novaseq.pcr-plus.20x.R1.fastq.gz",
       "20x/HG006.novaseq.pcr-plus.20x.R2.fastq.gz",
       "20x/HG007.novaseq.pcr-plus.20x.R1.fastq.gz",
       "20x/HG007.novaseq.pcr-plus.20x.R2.fastq.gz",
       "20x/NA12891.novaseq.pcr-plus.20x.R1.fastq.gz",
       "20x/NA12891.novaseq.pcr-plus.20x.R2.fastq.gz",
       "20x/NA12892.novaseq.pcr-plus.20x.R1.fastq.gz",
       "20x/NA12892.novaseq.pcr-plus.20x.R2.fastq.gz",
       "40x/NA12891.novaseq.pcr-plus.40x.R1.fastq.gz",
       "40x/NA12891.novaseq.pcr-plus.40x.R2.fastq.gz",
       "40x/NA12892.novaseq.pcr-plus.40x.R1.fastq.gz",
       "40x/NA12892.novaseq.pcr-plus.40x.R2.fastq.gz",
    ],

    # The bucket to transfer to
    "dst_bucket": "YOUR_BUCKET_HERE",

    # The path to write to
    # src_prefix is removed and this prefix is appended
    # so this example will create paths like transferred_files/20x/HG001...
    "dst_prefix": "transferred_files/"
}
response = requests.post(endpoint, json=data)
response.raise_for_status()
transfer_id = response.json()
print(f"Visit {app_url}/transfer_status/{transfer_id} to track transfer")
