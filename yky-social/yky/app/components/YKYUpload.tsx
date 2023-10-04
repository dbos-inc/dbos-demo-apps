'use client';

import { useState } from 'react';

interface ULProps {
    ultype: string;
    title: string;
}

const YKYUpload: React.FC<ULProps> = (props) => {
  const {title, ultype} = props;

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<boolean | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files ? e.target.files[0] : null;
    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);

    // 1. Get the pre-signed URL from the Next.js API route.
    const response = await fetch(`/doupload`);
    const { wfHandle, key, file: _fpath} = await response.json();

    // 2. Use the pre-signed URL to upload the file to S3.
    const uploadResponse = await fetch(key, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });

    setUploading(false);

    if (uploadResponse.ok) {
      // Inform the server that the upload was successful.
      const finresponse = await fetch(`/dofinishupload?wfid=${wfHandle}`);
      setUploadSuccess(true);
    } else {
      setUploadSuccess(false);
    }
  };

  return (
    <div>
      <h1>{title}</h1>

      <input type="file" onChange={handleFileChange} />

      <button onClick={handleUpload} disabled={uploading || !file}>
        Upload
      </button>

      {uploading && <p>Uploading...</p>}
      {uploadSuccess === true && <p>Upload successful!</p>}
      {uploadSuccess === false && <p>Error uploading file. Please try again.</p>}
    </div>
  );
};

export default YKYUpload;
