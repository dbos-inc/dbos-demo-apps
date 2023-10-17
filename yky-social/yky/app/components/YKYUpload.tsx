'use client';

import { useState } from 'react';

interface ULProps {
    ultype: string;
    title: string;
}

const YKYUpload: React.FC<ULProps> = (props) => {
  const {title, ultype: _ultype} = props;

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
    // Construct form data
    const formData = new FormData();
    Object.entries(key.fields).forEach(([key, value]) => {
      formData.append(key, value as string);
    });
    formData.append('file', file);
    formData.append('Content-Type', file.type);

    // Upload using presigned POST
    const uploadResponse = await fetch(key.url, {
      method: 'POST',
      body: formData,
    });

    setUploading(false);

    if (uploadResponse.ok) {
      // Inform the server that the upload was successful.
      const _finresponse = await fetch(`/dofinishupload?wfid=${wfHandle}`);
      setUploadSuccess(true);
    } else {
      setUploadSuccess(false);
    }
  };

  return (
    <div className = "flex flex-col flex-grow items-center justify-center px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">{title}</h1>

      <input type="file" onChange={handleFileChange} />

      <button className={(uploading || !file) ? "bg-gray-700                   text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                                              : "bg-cyan-700 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"} 
              onClick={handleUpload}
              disabled={uploading || !file}
      >
        Upload
      </button>

      {uploading && <p>Uploading...</p>}
      {uploadSuccess === true && <p>Upload successful!</p>}
      {uploadSuccess === false && <p>Error uploading file. Please try again.</p>}
    </div>
  );
};

export default YKYUpload;
